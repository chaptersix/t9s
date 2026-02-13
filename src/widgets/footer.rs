use ratatui::layout::Rect;
use ratatui::style::Style;
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::app::{App, InputMode, View};
use crate::kinds::{kind_spec, KindId};
use crate::theme;

pub fn render(app: &App, frame: &mut Frame, area: Rect) {
    let hints = match app.input_mode {
        InputMode::Command => vec![hint("Esc", "cancel"), hint("Enter", "execute")],
        InputMode::Search => vec![hint("Esc", "cancel"), hint("Enter", "apply")],
        InputMode::PendingG => vec![hint("g", "top")],
        InputMode::Normal => match app.view {
            View::Collection(kind) => build_collection_hints(kind),
            View::Detail(KindId::WorkflowExecution) => {
                build_detail_hints(KindId::WorkflowExecution)
            }
            View::Detail(kind) => build_detail_hints(kind),
        },
    };

    let mut spans: Vec<Span> = vec![Span::raw(" ")];
    for (i, (key, desc)) in hints.iter().enumerate() {
        if i > 0 {
            spans.push(Span::styled("  ", Style::default()));
        }
        spans.push(Span::styled(
            key.as_str(),
            Style::default().fg(theme::PURPLE),
        ));
        spans.push(Span::styled(
            format!(":{}", desc),
            Style::default().fg(theme::TEXT_MUTED),
        ));
    }

    let line = Line::from(spans);
    let widget = Paragraph::new(line).style(Style::default().bg(theme::BG_SURFACE));
    frame.render_widget(widget, area);
}

fn hint(key: &str, desc: &str) -> (String, String) {
    (key.to_string(), desc.to_string())
}

fn build_collection_hints(kind: KindId) -> Vec<(String, String)> {
    let mut hints = vec![
        hint("j/k", "nav"),
        hint("Enter", "select"),
        hint("/", "search"),
        hint(":", "cmd"),
    ];
    hints.extend(operation_hints(kind));
    if kind == KindId::Schedule {
        hints.push(hint("w", "workflows"));
    }
    hints.push(hint("?", "help"));
    hints.push(hint("q", "quit"));
    hints
}

fn build_detail_hints(kind: KindId) -> Vec<(String, String)> {
    let mut hints = vec![hint("j/k", "scroll"), hint("Esc", "back")];
    if kind == KindId::WorkflowExecution {
        hints.insert(0, hint("h/l", "tabs"));
        hints.insert(1, hint("a", "activities"));
    }
    hints.extend(operation_hints(kind));
    if kind == KindId::Schedule {
        hints.push(hint("w", "workflows"));
    }
    hints.push(hint("?", "help"));
    hints
}

fn operation_hints(kind: KindId) -> Vec<(String, String)> {
    kind_spec(kind)
        .operations
        .iter()
        .map(|op| (op.key.to_string(), op.label.to_string()))
        .collect()
}
