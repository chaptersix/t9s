use ratatui::layout::Rect;
use ratatui::style::Style;
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::app::{App, InputMode, View};
use crate::theme;

pub fn render(app: &App, frame: &mut Frame, area: Rect) {
    let hints = match app.input_mode {
        InputMode::Command => vec![
            hint("Esc", "cancel"),
            hint("Enter", "execute"),
        ],
        InputMode::Search => vec![
            hint("Esc", "cancel"),
            hint("Enter", "apply"),
        ],
        InputMode::PendingG => vec![
            hint("g", "top"),
        ],
        InputMode::Normal => match app.view {
            View::WorkflowList => vec![
                hint("j/k", "nav"),
                hint("Enter", "select"),
                hint("/", "search"),
                hint(":", "cmd"),
                hint("c", "cancel"),
                hint("t", "terminate"),
                hint("?", "help"),
                hint("q", "quit"),
            ],
            View::WorkflowDetail => vec![
                hint("h/l", "tabs"),
                hint("j/k", "scroll"),
                hint("Esc", "back"),
                hint("c", "cancel"),
                hint("t", "terminate"),
                hint("?", "help"),
            ],
            View::ScheduleList => vec![
                hint("j/k", "nav"),
                hint("Enter", "select"),
                hint("p", "pause"),
                hint("T", "trigger"),
                hint("d", "delete"),
                hint(":", "cmd"),
                hint("?", "help"),
                hint("q", "quit"),
            ],
            View::ScheduleDetail => vec![
                hint("j/k", "scroll"),
                hint("Esc", "back"),
                hint("p", "pause"),
                hint("T", "trigger"),
                hint("d", "delete"),
                hint("?", "help"),
            ],
        },
    };

    let mut spans: Vec<Span> = vec![Span::raw(" ")];
    for (i, (key, desc)) in hints.iter().enumerate() {
        if i > 0 {
            spans.push(Span::styled("  ", Style::default()));
        }
        spans.push(Span::styled(*key, Style::default().fg(theme::PURPLE)));
        spans.push(Span::styled(
            format!(":{}", desc),
            Style::default().fg(theme::TEXT_MUTED),
        ));
    }

    let line = Line::from(spans);
    let widget = Paragraph::new(line).style(Style::default().bg(theme::BG_SURFACE));
    frame.render_widget(widget, area);
}

fn hint(key: &'static str, desc: &'static str) -> (&'static str, &'static str) {
    (key, desc)
}
