use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::app::{App, ConnectionStatus};

pub fn render(app: &App, frame: &mut Frame, area: Rect) {
    let connection_indicator = match &app.connection_status {
        ConnectionStatus::Connected => Span::styled("● Connected", Style::default().fg(Color::Green)),
        ConnectionStatus::Connecting => Span::styled("◌ Connecting...", Style::default().fg(Color::Yellow)),
        ConnectionStatus::Disconnected => Span::styled("○ Disconnected", Style::default().fg(Color::DarkGray)),
        ConnectionStatus::Error(msg) => Span::styled(
            format!("✗ {}", msg),
            Style::default().fg(Color::Red),
        ),
    };

    let namespace = Span::styled(
        format!("  ns:{}", app.namespace),
        Style::default().fg(Color::Cyan),
    );

    let polling = if !app.polling_enabled {
        Span::styled("  ⏸ paused", Style::default().fg(Color::Yellow))
    } else if app.error_count > 0 {
        Span::styled(
            format!("  ↻ backoff {}s", app.polling_interval.as_secs()),
            Style::default().fg(Color::Yellow),
        )
    } else {
        Span::styled("  ↻ polling", Style::default().fg(Color::DarkGray))
    };

    let count = if let Some(count) = app.workflow_count {
        Span::styled(
            format!("  [{} workflows]", count),
            Style::default().fg(Color::DarkGray),
        )
    } else {
        Span::raw("")
    };

    let line = Line::from(vec![connection_indicator, namespace, polling, count]);
    let widget = Paragraph::new(line).style(Style::default().bg(Color::Rgb(30, 30, 30)));
    frame.render_widget(widget, area);
}
