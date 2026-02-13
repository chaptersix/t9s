use ratatui::layout::Rect;
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::app::{App, ConnectionStatus};
use crate::kinds::KindId;
use crate::nav::{RouteSegment, SchedulesRoute, WorkflowsRoute};
use crate::theme;

pub fn render(app: &App, frame: &mut Frame, area: Rect) {
    let mut left_spans: Vec<Span> = vec![
        Span::styled(
            " t9s ",
            Style::default()
                .fg(theme::PURPLE)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled("| ", Style::default().fg(theme::TEXT_MUTED)),
    ];

    let location = app.location();
    let mut active_query = None;
    if let Some(segment) = location.leaf() {
        match segment {
            RouteSegment::Workflows(route) => {
                active_query = app.search_query_for_kind(KindId::WorkflowExecution);
                left_spans.push(Span::styled(
                    "Workflows",
                    Style::default()
                        .fg(theme::TEXT)
                        .add_modifier(Modifier::BOLD),
                ));
                if let WorkflowsRoute::Detail { workflow_id, .. }
                | WorkflowsRoute::Activities { workflow_id, .. } = route
                {
                    left_spans.push(Span::styled(" > ", Style::default().fg(theme::TEXT_MUTED)));
                    left_spans.push(Span::styled(
                        workflow_id,
                        Style::default().fg(theme::TEXT_DIM),
                    ));
                }
            }
            RouteSegment::Schedules(route) => {
                active_query = app.search_query_for_kind(KindId::Schedule);
                left_spans.push(Span::styled(
                    "Schedules",
                    Style::default()
                        .fg(theme::TEXT)
                        .add_modifier(Modifier::BOLD),
                ));
                if let SchedulesRoute::Detail { schedule_id }
                | SchedulesRoute::Workflows { schedule_id, .. } = route
                {
                    left_spans.push(Span::styled(" > ", Style::default().fg(theme::TEXT_MUTED)));
                    left_spans.push(Span::styled(
                        schedule_id,
                        Style::default().fg(theme::TEXT_DIM),
                    ));
                }
            }
        }
    }

    // Active search indicator
    if let Some(ref query) = active_query {
        left_spans.push(Span::styled("  /", Style::default().fg(theme::GREEN)));
        left_spans.push(Span::styled(
            query.as_str(),
            Style::default().fg(theme::TEXT),
        ));
    }

    // Build right-aligned status spans
    let mut right_spans: Vec<Span> = Vec::new();

    let connection_indicator = match &app.connection_status {
        ConnectionStatus::Connected => {
            Span::styled("● Connected", Style::default().fg(theme::GREEN))
        }
        ConnectionStatus::Connecting => {
            Span::styled("◌ Connecting...", Style::default().fg(theme::YELLOW))
        }
        ConnectionStatus::Disconnected => {
            Span::styled("○ Disconnected", Style::default().fg(theme::TEXT_MUTED))
        }
        ConnectionStatus::Error(msg) => {
            Span::styled(format!("✗ {}", msg), Style::default().fg(theme::RED))
        }
    };
    right_spans.push(connection_indicator);

    right_spans.push(Span::styled(
        format!("  ns:{}", app.namespace),
        Style::default().fg(theme::PURPLE),
    ));

    if !app.polling_enabled {
        right_spans.push(Span::styled(
            "  ⏸ paused",
            Style::default().fg(theme::YELLOW),
        ));
    } else if app.error_count > 0 {
        right_spans.push(Span::styled(
            format!("  ↻ backoff {}s", app.polling_interval.as_secs()),
            Style::default().fg(theme::YELLOW),
        ));
    } else {
        right_spans.push(Span::styled(
            "  ↻ polling",
            Style::default().fg(theme::TEXT_MUTED),
        ));
    }

    if let Some(count) = app.workflow_count {
        right_spans.push(Span::styled(
            format!("  [{} workflows]", count),
            Style::default().fg(theme::TEXT_MUTED),
        ));
    }

    right_spans.push(Span::raw(" "));

    // Calculate widths and fill gap with spaces
    let left_width: usize = left_spans.iter().map(|s| s.width()).sum();
    let right_width: usize = right_spans.iter().map(|s| s.width()).sum();
    let total_width = area.width as usize;
    let gap = total_width.saturating_sub(left_width + right_width);

    let mut spans = left_spans;
    spans.push(Span::raw(" ".repeat(gap)));
    spans.extend(right_spans);

    let line = Line::from(spans);
    let widget = Paragraph::new(line).style(Style::default().bg(theme::BG_BAR));
    frame.render_widget(widget, area);
}
