use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Frame;

use crate::app::App;
use crate::kinds::detail_tabs_for_kind;
use crate::theme;

pub fn render(app: &App, frame: &mut Frame, area: Rect) {
    let detail = match &app.activity_execution_detail {
        crate::app::LoadState::Loaded(d) => d,
        crate::app::LoadState::Loading | crate::app::LoadState::NotLoaded => {
            frame.render_widget(
                Paragraph::new(" Loading activity detail...")
                    .style(Style::default().fg(theme::TEXT_MUTED)),
                area,
            );
            return;
        }
        crate::app::LoadState::Error(err) => {
            frame.render_widget(
                Paragraph::new(format!(" Failed to load activity detail: {}", err))
                    .style(Style::default().fg(theme::RED)),
                area,
            );
            return;
        }
    };

    let layout = Layout::vertical([Constraint::Length(1), Constraint::Fill(1)]).split(area);

    let tabs = detail_tabs_for_kind(crate::kinds::KindId::ActivityExecution).unwrap_or(&[]);
    let mut tab_spans: Vec<Span> = vec![Span::raw(" ")];
    for (i, tab) in tabs.iter().enumerate() {
        let style = if i == app.activity_detail_tab {
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

    let scroll = app.detail_scroll;
    match app.activity_detail_tab {
        0 => render_summary(detail, frame, layout[1], scroll),
        1 => render_io(detail, frame, layout[1], scroll),
        2 => render_task_queue(app, detail, frame, layout[1], scroll),
        _ => {}
    }
}

fn render_summary(
    detail: &crate::domain::ActivityExecutionDetail,
    frame: &mut Frame,
    area: Rect,
    scroll: u16,
) {
    let summary = &detail.summary;
    let schedule_time = summary
        .schedule_time
        .map(|t| format_time(&t))
        .unwrap_or_else(|| "-".to_string());
    let close_time = summary
        .close_time
        .map(|t| format_time(&t))
        .unwrap_or_else(|| "-".to_string());
    let last_started = detail
        .last_started_time
        .map(|t| format_time(&t))
        .unwrap_or_else(|| "-".to_string());
    let last_heartbeat = detail
        .last_heartbeat_time
        .map(|t| format_time(&t))
        .unwrap_or_else(|| "-".to_string());
    let attempt = detail.attempt.to_string();
    let schedule_to_close = format_duration(detail.schedule_to_close_timeout);
    let start_to_close = format_duration(detail.start_to_close_timeout);
    let heartbeat_timeout = format_duration(detail.heartbeat_timeout);

    let mut lines = vec![
        field_line("Activity ID", &summary.activity_id),
        field_line("Run ID", &summary.run_id),
        field_line("Type", &summary.activity_type),
        field_line("Status", summary.status.as_str()),
        field_line("Task Queue", &summary.task_queue),
        field_line("Scheduled", &schedule_time),
        field_line("Close Time", &close_time),
        field_line("Attempt", &attempt),
        field_line("Retry State", &detail.retry_state),
        field_line("Last Started", &last_started),
        field_line("Last Heartbeat", &last_heartbeat),
        field_line("Schedule->Close", &schedule_to_close),
        field_line("Start->Close", &start_to_close),
        field_line("Heartbeat", &heartbeat_timeout),
    ];

    if let Some(last_failure) = &detail.last_failure_message {
        lines.push(Line::from(""));
        lines.push(field_line("Last Failure", last_failure));
    }

    if let Some(deployment) = &detail.deployment_info {
        lines.push(field_line("Deployment", deployment));
    }

    frame.render_widget(
        Paragraph::new(lines)
            .block(Block::default().borders(Borders::NONE))
            .wrap(Wrap { trim: true })
            .scroll((scroll, 0)),
        area,
    );
}

fn render_io(
    detail: &crate::domain::ActivityExecutionDetail,
    frame: &mut Frame,
    area: Rect,
    scroll: u16,
) {
    let mut lines = vec![];

    lines.push(Line::from(Span::styled(
        " Input:",
        Style::default()
            .fg(theme::PURPLE)
            .add_modifier(Modifier::BOLD),
    )));
    render_json_value(&mut lines, detail.input.as_ref());
    lines.push(Line::from(""));

    lines.push(Line::from(Span::styled(
        " Output:",
        Style::default()
            .fg(theme::GREEN)
            .add_modifier(Modifier::BOLD),
    )));
    render_json_value(&mut lines, detail.output.as_ref());

    if detail.failure.is_some() {
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            " Failure:",
            Style::default().fg(theme::RED).add_modifier(Modifier::BOLD),
        )));
        render_json_value(&mut lines, detail.failure.as_ref());
    }

    frame.render_widget(
        Paragraph::new(lines)
            .block(Block::default().borders(Borders::NONE))
            .wrap(Wrap { trim: false })
            .scroll((scroll, 0)),
        area,
    );
}

fn render_task_queue(
    app: &App,
    detail: &crate::domain::ActivityExecutionDetail,
    frame: &mut Frame,
    area: Rect,
    scroll: u16,
) {
    match &app.activity_execution_task_queue {
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

            frame.render_widget(
                Paragraph::new(lines)
                    .block(Block::default().borders(Borders::NONE))
                    .wrap(Wrap { trim: true })
                    .scroll((scroll, 0)),
                area,
            );
        }
        crate::app::LoadState::Loading => {
            frame.render_widget(
                Paragraph::new(" Loading task queue info...")
                    .style(Style::default().fg(theme::TEXT_MUTED)),
                area,
            );
        }
        _ => {
            frame.render_widget(
                Paragraph::new(format!(
                    " Task queue: {} (press Tab or 'l' to load)",
                    detail.summary.task_queue
                ))
                .style(Style::default().fg(theme::TEXT_MUTED)),
                area,
            );
        }
    }
}

fn render_json_value(lines: &mut Vec<Line<'_>>, value: Option<&serde_json::Value>) {
    if let Some(value) = value {
        let formatted = serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string());
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

fn format_time(dt: &chrono::DateTime<chrono::Utc>) -> String {
    let local = dt.with_timezone(&chrono::Local);
    local.format("%Y-%m-%d %H:%M:%S").to_string()
}

fn format_duration(d: Option<std::time::Duration>) -> String {
    d.map(|v| {
        if v.subsec_nanos() == 0 {
            format!("{}s", v.as_secs())
        } else {
            format!("{:.3}s", v.as_secs_f64())
        }
    })
    .unwrap_or_else(|| "-".to_string())
}
