use ratatui::layout::{Constraint, Flex, Layout, Rect};
use ratatui::style::Style;
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};
use ratatui::Frame;

use crate::app::{App, View};
use crate::input::commands::{matching_commands, COMMANDS};
use crate::kinds::KindId;
use crate::theme;

pub fn render_command_modal(app: &App, frame: &mut Frame, area: Rect) {
    let input_cmd = app.input_buffer.split_whitespace().next().unwrap_or("");
    let matches = if input_cmd.is_empty() {
        COMMANDS.iter().collect::<Vec<_>>()
    } else if app.input_buffer.contains(' ') {
        vec![]
    } else {
        matching_commands(input_cmd)
    };

    let height = (matches.len() as u16 + 4).min(area.height.saturating_sub(4));
    let modal_area = centered_rect(60, height, area);
    frame.render_widget(Clear, modal_area);

    let mut lines = vec![];

    // Input line: `:` prefix + input text + ghost completion + cursor
    let mut input_spans = vec![
        Span::styled(":", Style::default().fg(theme::YELLOW)),
        Span::styled(&app.input_buffer, Style::default().fg(theme::TEXT)),
    ];
    if !app.input_buffer.is_empty() && !app.input_buffer.contains(' ') {
        if let Some(cmd) = matches.first() {
            if cmd.name.starts_with(input_cmd) && cmd.name.len() > input_cmd.len() {
                let ghost = &cmd.name[input_cmd.len()..];
                input_spans.push(Span::styled(ghost, Style::default().fg(theme::TEXT_MUTED)));
            }
        }
    }
    input_spans.push(Span::styled("_", Style::default().fg(theme::TEXT_MUTED)));
    lines.push(Line::from(input_spans));

    // Separator
    lines.push(Line::from(""));

    // Command suggestions
    for (i, cmd) in matches.iter().enumerate() {
        let style = if i == 0 {
            Style::default().fg(theme::PURPLE)
        } else {
            Style::default().fg(theme::TEXT_MUTED)
        };
        let mut spans = vec![Span::styled(format!(":{}", cmd.name), style)];
        for alias in cmd.aliases {
            spans.push(Span::styled(
                format!("  :{}", alias),
                Style::default().fg(theme::TEXT_MUTED),
            ));
        }
        spans.push(Span::styled(
            format!("  {}", cmd.description),
            Style::default().fg(theme::TEXT_DIM),
        ));
        lines.push(Line::from(spans));
    }

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme::YELLOW))
        .title(" Command ");

    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, modal_area);
}

pub fn render_search_modal(app: &App, frame: &mut Frame, area: Rect) {
    let modal_area = centered_rect(60, 10, area);
    frame.render_widget(Clear, modal_area);

    let mut lines = vec![
        // Input line: `/` prefix + input text + cursor
        Line::from(vec![
            Span::styled("/", Style::default().fg(theme::GREEN)),
            Span::styled(&app.input_buffer, Style::default().fg(theme::TEXT)),
            Span::styled("_", Style::default().fg(theme::TEXT_MUTED)),
        ]),
        // Separator
        Line::from(""),
        Line::from(Span::styled(
            "Examples:",
            Style::default().fg(theme::TEXT_DIM),
        )),
    ];

    for example in search_examples(app) {
        lines.push(Line::from(Span::styled(
            format!("  {}", example),
            Style::default().fg(theme::TEXT_MUTED),
        )));
    }

    lines.extend([
        Line::from(""),
        Line::from(Span::styled(
            "Enter to search | Esc to cancel",
            Style::default().fg(theme::TEXT_DIM),
        )),
    ]);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme::GREEN))
        .title(" Search ");

    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, modal_area);
}

fn search_examples(app: &App) -> Vec<&'static str> {
    match app.view {
        View::Collection(KindId::Schedule) | View::Detail(KindId::Schedule) => vec![
            "TemporalSchedulePaused = true",
            "ScheduleId = 'nightly-reconcile'",
            "WorkflowType = 'SyncWorkflow'",
        ],
        _ => vec![
            "WorkflowType = 'MyWorkflow'",
            "ExecutionStatus = 'Running'",
            "WorkflowId = 'order-123'",
        ],
    }
}

fn centered_rect(percent_x: u16, height: u16, area: Rect) -> Rect {
    let vertical = Layout::vertical([Constraint::Length(height)])
        .flex(Flex::Center)
        .split(area);
    let horizontal = Layout::horizontal([Constraint::Percentage(percent_x)])
        .flex(Flex::Center)
        .split(vertical[0]);
    horizontal[0]
}
