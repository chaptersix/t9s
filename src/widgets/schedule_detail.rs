use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Frame;

use crate::app::App;

pub fn render(app: &App, frame: &mut Frame, area: Rect) {
    let schedule = match &app.selected_schedule {
        Some(s) => s,
        None => {
            let loading = Paragraph::new(" Loading schedule detail...")
                .style(Style::default().fg(Color::DarkGray));
            frame.render_widget(loading, area);
            return;
        }
    };

    let next_run = schedule
        .next_run
        .map(|t| {
            let local = t.with_timezone(&chrono::Local);
            local.format("%Y-%m-%d %H:%M:%S").to_string()
        })
        .unwrap_or_else(|| "-".to_string());
    let action_count = schedule.recent_action_count.to_string();

    let state_style = match schedule.state {
        crate::domain::ScheduleState::Active => Style::default().fg(Color::Green),
        crate::domain::ScheduleState::Paused => Style::default().fg(Color::Yellow),
    };

    let mut lines = vec![
        field_line("Schedule ID", &schedule.schedule_id),
        field_line("Workflow Type", &schedule.workflow_type),
        Line::from(vec![
            Span::styled(
                format!(" {:<20} ", "State"),
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(schedule.state.as_str(), state_style),
        ]),
        field_line("Next Run", &next_run),
        field_line("Recent Actions", &action_count),
    ];

    if !schedule.notes.is_empty() {
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            " Notes:",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )));
        for line in schedule.notes.lines() {
            lines.push(Line::from(format!("   {}", line)));
        }
    }

    let paragraph = Paragraph::new(lines)
        .block(Block::default().borders(Borders::NONE))
        .wrap(Wrap { trim: true })
        .scroll((app.detail_scroll, 0));
    frame.render_widget(paragraph, area);
}

fn field_line<'a>(label: &'a str, value: &'a str) -> Line<'a> {
    Line::from(vec![
        Span::styled(
            format!(" {:<20} ", label),
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(value.to_string(), Style::default().fg(Color::White)),
    ])
}
