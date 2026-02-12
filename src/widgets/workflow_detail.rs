use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Frame;

use crate::app::App;
use crate::theme;

pub fn render(app: &App, frame: &mut Frame, area: Rect) {
    let detail = match &app.selected_workflow {
        Some(d) => d,
        None => {
            let loading = Paragraph::new(" Loading workflow detail...")
                .style(Style::default().fg(theme::TEXT_MUTED));
            frame.render_widget(loading, area);
            return;
        }
    };

    let layout = Layout::vertical([
        Constraint::Length(1), // tab bar
        Constraint::Fill(1),  // content
    ])
    .split(area);

    // Tab bar
    let tabs = ["Summary", "Input/Output", "History", "Pending Activities", "Task Queue"];
    let mut tab_spans: Vec<Span> = vec![Span::raw(" ")];
    for (i, tab) in tabs.iter().enumerate() {
        let style = if i == app.workflow_detail_tab {
            Style::default()
                .fg(theme::PURPLE)
                .add_modifier(Modifier::BOLD | Modifier::UNDERLINED)
        } else {
            Style::default().fg(theme::TEXT_MUTED)
        };
        tab_spans.push(Span::styled(format!(" {} ", tab), style));
        tab_spans.push(Span::raw(" "));
    }
    frame.render_widget(Paragraph::new(Line::from(tab_spans)), layout[0]);

    // Content
    let scroll = app.detail_scroll;
    match app.workflow_detail_tab {
        0 => render_summary(detail, frame, layout[1], scroll),
        1 => render_io(detail, frame, layout[1], scroll),
        2 => render_history(app, frame, layout[1], scroll),
        3 => render_pending(detail, frame, layout[1], scroll),
        4 => render_task_queue(app, detail, frame, layout[1], scroll),
        _ => {}
    }
}

fn render_summary(detail: &crate::domain::WorkflowDetail, frame: &mut Frame, area: Rect, scroll: u16) {
    let wf = &detail.summary;
    let started = format_time(&wf.start_time);
    let closed = wf
        .close_time
        .map(|t| format_time(&t))
        .unwrap_or_else(|| "-".to_string());
    let history_len = detail.history_length.to_string();
    let pending_count = detail.pending_activities.len().to_string();

    let lines = vec![
        field_line("Workflow ID", &wf.workflow_id),
        field_line("Run ID", &wf.run_id),
        field_line("Type", &wf.workflow_type),
        field_line("Status", wf.status.as_str()),
        field_line("Task Queue", &wf.task_queue),
        field_line("Started", &started),
        field_line("Closed", &closed),
        field_line("History Length", &history_len),
        field_line("Pending Activities", &pending_count),
    ];

    let paragraph = Paragraph::new(lines)
        .block(Block::default().borders(Borders::NONE))
        .wrap(Wrap { trim: true })
        .scroll((scroll, 0));
    frame.render_widget(paragraph, area);
}

fn render_io(detail: &crate::domain::WorkflowDetail, frame: &mut Frame, area: Rect, scroll: u16) {
    let mut lines = vec![];

    lines.push(Line::from(Span::styled(
        " Input:",
        Style::default().fg(theme::PURPLE).add_modifier(Modifier::BOLD),
    )));
    if let Some(ref input) = detail.input {
        let formatted = serde_json::to_string_pretty(input).unwrap_or_else(|_| input.to_string());
        for line in formatted.lines() {
            lines.push(Line::from(Span::styled(
                format!("   {}", line),
                Style::default().fg(theme::TEXT),
            )));
        }
    } else {
        lines.push(Line::from(Span::styled(
            "   (none)",
            Style::default().fg(theme::TEXT_MUTED),
        )));
    }

    lines.push(Line::from(""));

    lines.push(Line::from(Span::styled(
        " Output:",
        Style::default().fg(theme::GREEN).add_modifier(Modifier::BOLD),
    )));
    if let Some(ref output) = detail.output {
        let formatted = serde_json::to_string_pretty(output).unwrap_or_else(|_| output.to_string());
        for line in formatted.lines() {
            lines.push(Line::from(Span::styled(
                format!("   {}", line),
                Style::default().fg(theme::TEXT),
            )));
        }
    } else {
        lines.push(Line::from(Span::styled(
            "   (none)",
            Style::default().fg(theme::TEXT_MUTED),
        )));
    }

    if let Some(ref failure) = detail.failure {
        lines.push(Line::from(Span::styled(
            " Failure:",
            Style::default().fg(theme::RED).add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::from(format!("   Type: {}", failure.failure_type)));
        lines.push(Line::from(format!("   Message: {}", failure.message)));
        if let Some(ref trace) = failure.stack_trace {
            lines.push(Line::from("   Stack Trace:"));
            for line in trace.lines() {
                lines.push(Line::from(format!("     {}", line)));
            }
        }
    }

    let paragraph = Paragraph::new(lines)
        .block(Block::default().borders(Borders::NONE))
        .wrap(Wrap { trim: false })
        .scroll((scroll, 0));
    frame.render_widget(paragraph, area);
}

fn render_history(app: &App, frame: &mut Frame, area: Rect, scroll: u16) {
    match &app.workflow_history {
        crate::app::LoadState::Loaded(events) => {
            let mut lines: Vec<Line> = Vec::new();
            for e in events {
                // Event header line
                lines.push(Line::from(vec![
                    Span::styled(
                        format!(" {:>4} ", e.event_id),
                        Style::default().fg(theme::TEXT_MUTED),
                    ),
                    Span::styled(
                        format!("{:<45} ", e.event_type),
                        event_type_style(&e.event_type),
                    ),
                    Span::styled(
                        format_time(&e.timestamp),
                        Style::default().fg(theme::TEXT_MUTED),
                    ),
                ]));

                // Event details (if any non-empty details exist)
                if let Some(obj) = e.details.as_object() {
                    if !obj.is_empty() {
                        for (key, value) in obj {
                            let val_str = match value {
                                serde_json::Value::String(s) => s.clone(),
                                other => serde_json::to_string_pretty(other)
                                    .unwrap_or_else(|_| other.to_string()),
                            };
                            // For multi-line values, indent continuation lines
                            let first_line = val_str.lines().next().unwrap_or("");
                            lines.push(Line::from(vec![
                                Span::raw("        "),
                                Span::styled(
                                    format!("{}: ", key),
                                    Style::default().fg(theme::PURPLE),
                                ),
                                Span::styled(
                                    first_line.to_string(),
                                    Style::default().fg(theme::TEXT_DIM),
                                ),
                            ]));
                            for cont_line in val_str.lines().skip(1) {
                                lines.push(Line::from(Span::styled(
                                    format!("          {}", cont_line),
                                    Style::default().fg(theme::TEXT_DIM),
                                )));
                            }
                        }
                    }
                }
            }

            let paragraph = Paragraph::new(lines)
                .block(Block::default().borders(Borders::NONE))
                .scroll((scroll, 0));
            frame.render_widget(paragraph, area);
        }
        crate::app::LoadState::Loading => {
            frame.render_widget(
                Paragraph::new(" Loading history...").style(Style::default().fg(theme::TEXT_MUTED)),
                area,
            );
        }
        _ => {
            frame.render_widget(
                Paragraph::new(" Press Tab or 'l' to load history")
                    .style(Style::default().fg(theme::TEXT_MUTED)),
                area,
            );
        }
    }
}

fn render_pending(detail: &crate::domain::WorkflowDetail, frame: &mut Frame, area: Rect, scroll: u16) {
    if detail.pending_activities.is_empty() {
        frame.render_widget(
            Paragraph::new(" No pending activities").style(Style::default().fg(theme::TEXT_MUTED)),
            area,
        );
        return;
    }

    let lines: Vec<Line> = detail
        .pending_activities
        .iter()
        .map(|a| {
            Line::from(vec![
                Span::styled(
                    format!(" {:>6} ", a.activity_id),
                    Style::default().fg(theme::TEXT_MUTED),
                ),
                Span::styled(
                    format!("{:<30} ", a.activity_type),
                    Style::default().fg(theme::TEXT),
                ),
                Span::styled(
                    format!("{:<15} ", a.state.as_str()),
                    Style::default().fg(theme::YELLOW),
                ),
                Span::styled(
                    format!("attempt:{}", a.attempt),
                    Style::default().fg(theme::TEXT_MUTED),
                ),
            ])
        })
        .collect();

    let paragraph = Paragraph::new(lines)
        .block(Block::default().borders(Borders::NONE))
        .scroll((scroll, 0));
    frame.render_widget(paragraph, area);
}

fn render_task_queue(
    app: &App,
    detail: &crate::domain::WorkflowDetail,
    frame: &mut Frame,
    area: Rect,
    scroll: u16,
) {
    match &app.task_queue_detail {
        crate::app::LoadState::Loaded(tq) => {
            let pollers_count = tq.pollers.len().to_string();
            let mut lines = vec![
                field_line("Task Queue", &tq.name),
                field_line("Pollers", &pollers_count),
                Line::from(""),
            ];

            if tq.pollers.is_empty() {
                lines.push(Line::from(Span::styled(
                    " No pollers",
                    Style::default().fg(theme::TEXT_MUTED),
                )));
            } else {
                lines.push(Line::from(Span::styled(
                    " Pollers:",
                    Style::default()
                        .fg(theme::PURPLE)
                        .add_modifier(Modifier::BOLD),
                )));
                for p in &tq.pollers {
                    let last_access = p
                        .last_access_time
                        .map(|t| format_time(&t))
                        .unwrap_or_else(|| "-".to_string());
                    lines.push(Line::from(vec![
                        Span::styled("   ", Style::default()),
                        Span::styled(
                            format!("{:<40} ", p.identity),
                            Style::default().fg(theme::TEXT),
                        ),
                        Span::styled(
                            format!("last:{:<20} ", last_access),
                            Style::default().fg(theme::TEXT_MUTED),
                        ),
                        Span::styled(
                            format!("rate:{:.1}/s", p.rate_per_second),
                            Style::default().fg(theme::TEXT_MUTED),
                        ),
                    ]));
                }
            }

            let paragraph = Paragraph::new(lines)
                .block(Block::default().borders(Borders::NONE))
                .wrap(Wrap { trim: true })
                .scroll((scroll, 0));
            frame.render_widget(paragraph, area);
        }
        crate::app::LoadState::Loading => {
            frame.render_widget(
                Paragraph::new(" Loading task queue info...")
                    .style(Style::default().fg(theme::TEXT_MUTED)),
                area,
            );
        }
        _ => {
            let tq_name = &detail.summary.task_queue;
            frame.render_widget(
                Paragraph::new(format!(" Task queue: {} (press Tab or 'l' to load)", tq_name))
                    .style(Style::default().fg(theme::TEXT_MUTED)),
                area,
            );
        }
    }
}

fn field_line<'a>(label: &'a str, value: &'a str) -> Line<'a> {
    Line::from(vec![
        Span::styled(
            format!(" {:<20} ", label),
            Style::default()
                .fg(theme::PURPLE)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(value.to_string(), Style::default().fg(theme::TEXT)),
    ])
}

fn event_type_style(event_type: &str) -> Style {
    if event_type.contains("Failed") || event_type.contains("TimedOut") {
        Style::default().fg(theme::RED)
    } else if event_type.contains("Completed") {
        Style::default().fg(theme::GREEN)
    } else if event_type.contains("Started") {
        Style::default().fg(theme::BLUE)
    } else if event_type.contains("Scheduled") {
        Style::default().fg(theme::YELLOW)
    } else {
        Style::default().fg(theme::TEXT)
    }
}

fn format_time(dt: &chrono::DateTime<chrono::Utc>) -> String {
    let local = dt.with_timezone(&chrono::Local);
    local.format("%Y-%m-%d %H:%M:%S").to_string()
}
