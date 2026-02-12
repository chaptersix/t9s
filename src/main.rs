use std::sync::Arc;
use std::time::Duration;

use clap::Parser;
use color_eyre::eyre::Result;
use ratatui::layout::{Constraint, Layout};
use tokio::sync::mpsc;

use t9s::action::Action;
use t9s::app::{App, ConfirmAction, Effect, InputMode, Overlay, View};
use t9s::client::GrpcTemporalClient;
use t9s::config::Cli;
use t9s::event::{key_to_action, AppEvent, RawEventHandler};
use t9s::widgets;
use t9s::worker::{CliRequest, CliWorker};

#[tokio::main]
async fn main() -> Result<()> {
    color_eyre::install()?;
    dotenvy::dotenv().ok();

    let cli = Cli::parse();

    // Set up logging
    if let Some(ref log_file) = cli.log_file {
        let file = std::fs::File::create(log_file)?;
        tracing_subscriber::fmt()
            .with_writer(file)
            .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
            .init();
    }

    run_tui(cli).await
}

async fn run_tui(cli: Cli) -> Result<()> {
    // Connect to Temporal
    let client = GrpcTemporalClient::connect(
        &cli.address,
        cli.namespace.clone(),
        cli.api_key.clone(),
        cli.tls_cert.clone(),
        cli.tls_key.clone(),
    )
    .await;

    let client: Arc<dyn t9s::client::TemporalClient> = match client {
        Ok(c) => Arc::new(c),
        Err(e) => {
            eprintln!("Failed to connect to Temporal at {}: {}", cli.address, e);
            eprintln!();
            eprintln!("Make sure Temporal is running and accessible.");
            eprintln!("  TEMPORAL_ADDRESS={}", cli.address);
            eprintln!("  TEMPORAL_NAMESPACE={}", cli.namespace);
            if cli.api_key.is_some() {
                eprintln!("  TEMPORAL_API_KEY=<set>");
            }
            std::process::exit(1);
        }
    };

    // Initialize app state
    let mut app = App::new(cli.namespace.clone());
    app.polling_interval = Duration::from_secs(cli.poll_interval);
    app.base_polling_interval = Duration::from_secs(cli.poll_interval);
    app.connection_status = t9s::app::ConnectionStatus::Connected;

    // Set up channels
    let (action_tx, mut action_rx) = mpsc::unbounded_channel::<Action>();

    // Create worker
    let (worker, cli_handle) = CliWorker::new(client, action_tx.clone());
    tokio::spawn(worker.run());

    // Initial data load
    cli_handle.send(CliRequest::LoadNamespaces);
    cli_handle.send(CliRequest::LoadWorkflows {
        namespace: cli.namespace.clone(),
        query: None,
        page_size: app.page_size,
        next_page_token: vec![],
    });
    cli_handle.send(CliRequest::LoadWorkflowCount {
        namespace: cli.namespace.clone(),
        query: None,
    });

    // Set up terminal
    let mut terminal = t9s::tui::init()?;

    // Set up event handler
    let mut events = RawEventHandler::new(Duration::from_secs(1));

    // Main loop
    loop {
        // Render
        terminal.draw(|frame| render(&mut app, frame))?;

        // Handle events
        tokio::select! {
            Some(event) = events.next() => {
                match event {
                    AppEvent::Key(key) => {
                        // Special handling for confirm modal
                        if let Overlay::Confirm(ref confirm_action) = app.overlay {
                            match key.code {
                                crossterm::event::KeyCode::Char('y') | crossterm::event::KeyCode::Enter => {
                                    let effects = match confirm_action.clone() {
                                        ConfirmAction::CancelWorkflow(id, run_id) => {
                                            vec![Effect::CancelWorkflow(id, run_id)]
                                        }
                                        ConfirmAction::TerminateWorkflow(id, run_id) => {
                                            vec![Effect::TerminateWorkflow(id, run_id)]
                                        }
                                        ConfirmAction::DeleteSchedule(id) => {
                                            vec![Effect::DeleteSchedule(id)]
                                        }
                                        ConfirmAction::TriggerSchedule(id) => {
                                            vec![Effect::TriggerSchedule(id)]
                                        }
                                    };
                                    app.overlay = Overlay::None;
                                    handle_effects(effects, &cli_handle, &app);
                                    continue;
                                }
                                crossterm::event::KeyCode::Char('n') | crossterm::event::KeyCode::Esc => {
                                    app.overlay = Overlay::None;
                                    continue;
                                }
                                _ => continue,
                            }
                        }

                        // Handle namespace selector keys (needs app state)
                        if matches!(app.overlay, Overlay::NamespaceSelector) {
                            match key.code {
                                crossterm::event::KeyCode::Char('j') | crossterm::event::KeyCode::Down => {
                                    app.namespace_selector_state.select_next();
                                    continue;
                                }
                                crossterm::event::KeyCode::Char('k') | crossterm::event::KeyCode::Up => {
                                    app.namespace_selector_state.select_previous();
                                    continue;
                                }
                                crossterm::event::KeyCode::Enter => {
                                    if let Some(idx) = app.namespace_selector_state.selected() {
                                        if let Some(ns) = app.namespaces.get(idx) {
                                            let ns_name = ns.name.clone();
                                            let effects = app.update(Action::SwitchNamespace(ns_name));
                                            handle_effects(effects, &cli_handle, &app);
                                        }
                                    }
                                    continue;
                                }
                                crossterm::event::KeyCode::Char('g') => {
                                    app.namespace_selector_state.select_first();
                                    continue;
                                }
                                crossterm::event::KeyCode::Char('G') => {
                                    app.namespace_selector_state.select_last();
                                    continue;
                                }
                                _ => {} // Fall through to key_to_action for Esc etc
                            }
                        }

                        if let Some(action) = key_to_action(
                            key,
                            &app.view,
                            &app.input_mode,
                            &app.overlay,
                            &app.input_buffer,
                        ) {
                            let effects = app.update(action);
                            handle_effects(effects, &cli_handle, &app);
                        }
                    }
                    AppEvent::Tick => {
                        let effects = app.update(Action::Tick);
                        handle_effects(effects, &cli_handle, &app);
                    }
                }
            }
            Some(action) = action_rx.recv() => {
                let effects = app.update(action);
                handle_effects(effects, &cli_handle, &app);
            }
        }

        if app.should_quit {
            break;
        }
    }

    // Restore terminal
    t9s::tui::restore()?;

    Ok(())
}

fn render(app: &mut App, frame: &mut ratatui::Frame) {
    let area = frame.area();

    // Dark navy background
    frame.render_widget(
        ratatui::widgets::Block::default().style(
            ratatui::style::Style::default().bg(t9s::theme::BG_DARK),
        ),
        area,
    );

    let layout = Layout::vertical([
        Constraint::Length(1), // Tab bar
        Constraint::Fill(1),  // Content
        Constraint::Length(1), // Footer
    ])
    .split(area);

    // Tab bar
    widgets::tab_bar::render(app, frame, layout[0]);

    // Content area
    let content_area = layout[1];
    match app.view {
        View::WorkflowList => widgets::workflow_list::render(app, frame, content_area),
        View::WorkflowDetail => widgets::workflow_detail::render(app, frame, content_area),
        View::ScheduleList => widgets::schedule_list::render(app, frame, content_area),
        View::ScheduleDetail => widgets::schedule_detail::render(app, frame, content_area),
    }

    // Footer
    widgets::footer::render(app, frame, layout[2]);

    // Overlays
    match &app.overlay {
        Overlay::Help => widgets::help_overlay::render(&app.view, frame, area),
        Overlay::Confirm(action) => widgets::confirm_modal::render(action, frame, area),
        Overlay::NamespaceSelector => {
            widgets::namespace_selector::render(app, frame, area);
        }
        Overlay::None => {}
    }

    // Input mode overlays
    match app.input_mode {
        InputMode::Command => widgets::command_input::render_command_modal(app, frame, area),
        InputMode::Search => widgets::command_input::render_search_modal(app, frame, area),
        _ => {}
    }

    // Error toast
    widgets::error_toast::render(app, frame, area);
}

fn handle_effects(
    effects: Vec<Effect>,
    cli_handle: &t9s::worker::CliHandle,
    app: &App,
) {
    for effect in effects {
        match effect {
            Effect::LoadWorkflows => {
                cli_handle.send(CliRequest::LoadWorkflows {
                    namespace: app.namespace.clone(),
                    query: app.search_query.clone(),
                    page_size: app.page_size,
                    next_page_token: vec![],
                });
            }
            Effect::LoadMoreWorkflows => {
                cli_handle.send(CliRequest::LoadMoreWorkflows {
                    namespace: app.namespace.clone(),
                    query: app.search_query.clone(),
                    page_size: app.page_size,
                    next_page_token: app.next_page_token.clone(),
                });
            }
            Effect::LoadWorkflowDetail(wf_id, run_id) => {
                cli_handle.send(CliRequest::LoadWorkflowDetail {
                    namespace: app.namespace.clone(),
                    workflow_id: wf_id,
                    run_id,
                });
            }
            Effect::LoadHistory(wf_id, run_id) => {
                cli_handle.send(CliRequest::LoadHistory {
                    namespace: app.namespace.clone(),
                    workflow_id: wf_id,
                    run_id,
                });
            }
            Effect::LoadNamespaces => {
                cli_handle.send(CliRequest::LoadNamespaces);
            }
            Effect::LoadSchedules => {
                cli_handle.send(CliRequest::LoadSchedules {
                    namespace: app.namespace.clone(),
                });
            }
            Effect::LoadScheduleDetail(schedule_id) => {
                cli_handle.send(CliRequest::LoadScheduleDetail {
                    namespace: app.namespace.clone(),
                    schedule_id,
                });
            }
            Effect::LoadWorkflowCount => {
                cli_handle.send(CliRequest::LoadWorkflowCount {
                    namespace: app.namespace.clone(),
                    query: app.search_query.clone(),
                });
            }
            Effect::CancelWorkflow(wf_id, run_id) => {
                cli_handle.send(CliRequest::CancelWorkflow {
                    namespace: app.namespace.clone(),
                    workflow_id: wf_id,
                    run_id,
                });
            }
            Effect::TerminateWorkflow(wf_id, run_id) => {
                cli_handle.send(CliRequest::TerminateWorkflow {
                    namespace: app.namespace.clone(),
                    workflow_id: wf_id,
                    run_id,
                });
            }
            Effect::PauseSchedule(schedule_id, pause) => {
                cli_handle.send(CliRequest::PauseSchedule {
                    namespace: app.namespace.clone(),
                    schedule_id,
                    pause,
                });
            }
            Effect::TriggerSchedule(schedule_id) => {
                cli_handle.send(CliRequest::TriggerSchedule {
                    namespace: app.namespace.clone(),
                    schedule_id,
                });
            }
            Effect::DeleteSchedule(schedule_id) => {
                cli_handle.send(CliRequest::DeleteSchedule {
                    namespace: app.namespace.clone(),
                    schedule_id,
                });
            }
            Effect::LoadTaskQueueDetail(task_queue) => {
                cli_handle.send(CliRequest::DescribeTaskQueue {
                    namespace: app.namespace.clone(),
                    task_queue,
                });
            }
            Effect::SignalWorkflow(wf_id, run_id, signal_name, input) => {
                cli_handle.send(CliRequest::SignalWorkflow {
                    namespace: app.namespace.clone(),
                    workflow_id: wf_id,
                    run_id,
                    signal_name,
                    input,
                });
            }
            Effect::Quit => {}
        }
    }
}
