use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::app::{App, InputMode};
use crate::input::commands::matching_commands;

pub fn render(app: &App, frame: &mut Frame, area: Rect) {
    let (prefix, style) = match app.input_mode {
        InputMode::Command => (":", Style::default().fg(Color::Yellow)),
        InputMode::Search => ("/", Style::default().fg(Color::Green)),
        _ => return,
    };

    let mut spans = vec![
        Span::styled(prefix, style),
        Span::styled(&app.input_buffer, Style::default().fg(Color::White)),
    ];

    // Ghost completion text for command mode
    if app.input_mode == InputMode::Command && !app.input_buffer.is_empty() {
        let input_cmd = app.input_buffer.split_whitespace().next().unwrap_or("");
        // Only show ghost if we're still typing the command (no space yet)
        if !app.input_buffer.contains(' ') {
            let matches = matching_commands(input_cmd);
            if let Some(cmd) = matches.first() {
                let ghost = if cmd.name.starts_with(input_cmd) && cmd.name.len() > input_cmd.len() {
                    &cmd.name[input_cmd.len()..]
                } else {
                    ""
                };
                if !ghost.is_empty() {
                    spans.push(Span::styled(ghost, Style::default().fg(Color::DarkGray)));
                }
            }
        }
    }

    spans.push(Span::styled("_", Style::default().fg(Color::DarkGray)));

    let line = Line::from(spans);
    let widget = Paragraph::new(line).style(Style::default().bg(Color::Rgb(30, 30, 30)));
    frame.render_widget(widget, area);
}

pub fn render_suggestions(app: &App, frame: &mut Frame, area: Rect) {
    if app.input_mode != InputMode::Command {
        return;
    }

    let input_cmd = app.input_buffer.split_whitespace().next().unwrap_or("");
    if input_cmd.is_empty() {
        // Show all commands when input is empty
        let mut spans: Vec<Span> = vec![Span::styled(" ", Style::default())];
        for cmd in crate::input::commands::COMMANDS {
            spans.push(Span::styled(
                format!(":{}", cmd.name),
                Style::default().fg(Color::Cyan),
            ));
            spans.push(Span::styled(
                format!(" {} ", cmd.description),
                Style::default().fg(Color::DarkGray),
            ));
            spans.push(Span::styled(" | ", Style::default().fg(Color::Rgb(50, 50, 50))));
        }
        spans.pop(); // remove trailing separator
        let line = Line::from(spans);
        let widget = Paragraph::new(line).style(Style::default().bg(Color::Rgb(25, 25, 25)));
        frame.render_widget(widget, area);
        return;
    }

    // Don't show suggestions if user has already typed a complete command + space
    if app.input_buffer.contains(' ') {
        let widget = Paragraph::new("").style(Style::default().bg(Color::Rgb(25, 25, 25)));
        frame.render_widget(widget, area);
        return;
    }

    let matches = matching_commands(input_cmd);
    if matches.is_empty() {
        let widget = Paragraph::new(Line::from(Span::styled(
            " No matching commands",
            Style::default().fg(Color::DarkGray),
        )))
        .style(Style::default().bg(Color::Rgb(25, 25, 25)));
        frame.render_widget(widget, area);
        return;
    }

    let mut spans: Vec<Span> = vec![Span::styled(" ", Style::default())];
    for (i, cmd) in matches.iter().enumerate() {
        let cmd_style = if i == 0 {
            Style::default().fg(Color::Cyan)
        } else {
            Style::default().fg(Color::DarkGray)
        };
        spans.push(Span::styled(format!(":{}", cmd.name), cmd_style));
        for alias in cmd.aliases {
            spans.push(Span::styled(
                format!("|{}", alias),
                Style::default().fg(Color::Rgb(80, 80, 80)),
            ));
        }
        spans.push(Span::styled(
            format!(" {} ", cmd.description),
            Style::default().fg(Color::Rgb(100, 100, 100)),
        ));
        if i < matches.len() - 1 {
            spans.push(Span::styled("  ", Style::default()));
        }
    }

    let line = Line::from(spans);
    let widget = Paragraph::new(line).style(Style::default().bg(Color::Rgb(25, 25, 25)));
    frame.render_widget(widget, area);
}
