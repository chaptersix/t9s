use std::time::Duration;

use crossterm::event::{Event, EventStream, KeyCode, KeyEvent, KeyModifiers};
use futures::StreamExt;
use tokio::sync::mpsc;

use crate::action::Action;
use crate::app::{InputMode, Overlay, View};
use crate::kinds::{operation_for_key, KindId};

pub struct EventHandler {
    rx: mpsc::UnboundedReceiver<Action>,
}

impl EventHandler {
    pub fn new(tick_rate: Duration) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();

        tokio::spawn(async move {
            let mut reader = EventStream::new();
            let mut tick = tokio::time::interval(tick_rate);

            loop {
                tokio::select! {
                    _ = tick.tick() => {
                        if tx.send(Action::Tick).is_err() {
                            break;
                        }
                    }
                    event = reader.next() => {
                        match event {
                            Some(Ok(Event::Key(_key))) => {
                                // Unused - we use RawEventHandler instead
                                if tx.send(Action::Tick).is_err() {
                                    break;
                                }
                            }
                            Some(Ok(_)) => {} // mouse, resize, etc.
                            Some(Err(_)) => break,
                            None => break,
                        }
                    }
                }
            }
        });

        Self { rx }
    }

    pub async fn next(&mut self) -> Option<Action> {
        self.rx.recv().await
    }
}

/// A simpler event handler that returns raw crossterm events
pub struct RawEventHandler {
    rx: mpsc::UnboundedReceiver<AppEvent>,
}

pub enum AppEvent {
    Key(KeyEvent),
    Tick,
}

impl RawEventHandler {
    pub fn new(tick_rate: Duration) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();

        tokio::spawn(async move {
            let mut reader = EventStream::new();
            let mut tick = tokio::time::interval(tick_rate);

            loop {
                tokio::select! {
                    _ = tick.tick() => {
                        if tx.send(AppEvent::Tick).is_err() {
                            break;
                        }
                    }
                    event = reader.next() => {
                        match event {
                            Some(Ok(Event::Key(key))) => {
                                if tx.send(AppEvent::Key(key)).is_err() {
                                    break;
                                }
                            }
                            Some(Ok(_)) => {}
                            Some(Err(_)) => break,
                            None => break,
                        }
                    }
                }
            }
        });

        Self { rx }
    }

    pub async fn next(&mut self) -> Option<AppEvent> {
        self.rx.recv().await
    }
}

/// Map a key event to an action based on current app state
pub fn key_to_action(
    key: KeyEvent,
    view: &View,
    input_mode: &InputMode,
    overlay: &Overlay,
    input_buffer: &str,
) -> Option<Action> {
    // Handle overlay-specific keys first
    match overlay {
        Overlay::Help => {
            return match key.code {
                KeyCode::Esc | KeyCode::Char('?') | KeyCode::Char('q') => {
                    Some(Action::ToggleHelp)
                }
                _ => None,
            };
        }
        Overlay::Confirm(_) => {
            return match key.code {
                KeyCode::Char('y') | KeyCode::Enter => {
                    // The confirm action is handled in main.rs by reading overlay state
                    Some(Action::CloseOverlay)
                }
                KeyCode::Char('n') | KeyCode::Esc => Some(Action::CloseOverlay),
                _ => None,
            };
        }
        Overlay::NamespaceSelector => {
            // Navigation handled specially in main.rs since we need app state
            return match key.code {
                KeyCode::Esc => Some(Action::CloseOverlay),
                _ => None,
            };
        }
        Overlay::None => {}
    }

    // Handle input mode keys
    match input_mode {
        InputMode::Command => {
            return match key.code {
                KeyCode::Esc => Some(Action::CloseOverlay),
                KeyCode::Enter => Some(Action::SubmitCommandInput(input_buffer.to_string())),
                KeyCode::Tab => {
                    // Tab completion: fill with first matching command
                    let input_cmd = input_buffer.split_whitespace().next().unwrap_or("");
                    let matches = crate::input::commands::matching_commands(input_cmd);
                    if let Some(cmd) = matches.first() {
                        let completed = format!("{} ", cmd.name);
                        Some(Action::UpdateInputBuffer(completed))
                    } else {
                        None
                    }
                }
                KeyCode::Backspace => {
                    let mut buf = input_buffer.to_string();
                    buf.pop();
                    Some(Action::UpdateInputBuffer(buf))
                }
                KeyCode::Char(c) => {
                    let mut buf = input_buffer.to_string();
                    buf.push(c);
                    Some(Action::UpdateInputBuffer(buf))
                }
                _ => None,
            };
        }
        InputMode::Search => {
            return match key.code {
                KeyCode::Esc => {
                    Some(Action::CloseOverlay)
                }
                KeyCode::Enter => Some(Action::SubmitSearch(input_buffer.to_string())),
                KeyCode::Backspace => {
                    let mut buf = input_buffer.to_string();
                    buf.pop();
                    Some(Action::UpdateInputBuffer(buf))
                }
                KeyCode::Char(c) => {
                    let mut buf = input_buffer.to_string();
                    buf.push(c);
                    Some(Action::UpdateInputBuffer(buf))
                }
                _ => None,
            };
        }
        InputMode::PendingG => {
            return match key.code {
                KeyCode::Char('g') => Some(Action::NavigateTop),
                _ => Some(Action::Back), // Cancel the pending chord
            };
        }
        InputMode::Normal => {}
    }

    // Normal mode - check for Ctrl modifiers first
    if key.modifiers.contains(KeyModifiers::CONTROL) {
        return match key.code {
            KeyCode::Char('c') => Some(Action::Quit),
            KeyCode::Char('r') => Some(Action::Refresh),
            KeyCode::Char('d') => Some(Action::PageDown),
            KeyCode::Char('u') => Some(Action::PageUp),
            _ => None,
        };
    }

    // Normal mode - view-specific keys
    match key.code {
        // Global
        KeyCode::Char('q') => Some(Action::Quit),
        KeyCode::Char(':') => Some(Action::OpenCommandInput),
        KeyCode::Char('/') if matches!(view, View::Collection(_)) => {
            Some(Action::OpenSearch)
        }
        KeyCode::Char('?') => Some(Action::ToggleHelp),
        KeyCode::Char('j') | KeyCode::Down => Some(Action::NavigateDown),
        KeyCode::Char('k') | KeyCode::Up => Some(Action::NavigateUp),
        KeyCode::Char('g') => Some(Action::EnterPendingG),
        KeyCode::Char('G') => Some(Action::NavigateBottom),
        KeyCode::Enter => Some(Action::Select),
        KeyCode::Esc => Some(Action::Back),
        KeyCode::Tab => Some(Action::NextTab),
        KeyCode::BackTab => Some(Action::PrevTab),

        KeyCode::Char('l') if matches!(view, View::Detail(KindId::WorkflowExecution)) => {
            Some(Action::NextTab)
        }
        KeyCode::Char('h') if matches!(view, View::Detail(KindId::WorkflowExecution)) => {
            Some(Action::PrevTab)
        }
        KeyCode::Char('a') if matches!(view, View::Detail(KindId::WorkflowExecution)) => {
            Some(Action::OpenWorkflowActivities)
        }
        KeyCode::Char('w')
            if matches!(view, View::Collection(KindId::Schedule) | View::Detail(KindId::Schedule)) =>
        {
            Some(Action::OpenScheduleWorkflows)
        }
        KeyCode::Char(c) => {
            let kind = match view {
                View::Collection(kind) | View::Detail(kind) => *kind,
            };
            operation_for_key(kind, c).map(Action::RunOperation)
        }

        _ => None,
    }
}
