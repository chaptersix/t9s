use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::widgets::{Block, Borders, Cell, Row, Table};
use ratatui::Frame;

use crate::app::App;
use crate::domain::ScheduleState;

pub fn render(app: &mut App, frame: &mut Frame, area: Rect) {
    let schedules = match app.schedules.data() {
        Some(s) => s,
        None => {
            let loading = ratatui::widgets::Paragraph::new(if app.schedules.is_loading() {
                " Loading schedules..."
            } else {
                " No schedules loaded"
            })
            .style(Style::default().fg(Color::DarkGray));
            frame.render_widget(loading, area);
            return;
        }
    };

    let header = Row::new(vec![
        Cell::from(" State"),
        Cell::from("Schedule ID"),
        Cell::from("Workflow Type"),
        Cell::from("Next Run"),
        Cell::from("Actions"),
    ])
    .style(
        Style::default()
            .fg(Color::Cyan)
            .add_modifier(Modifier::BOLD),
    )
    .height(1);

    let rows: Vec<Row> = schedules
        .iter()
        .map(|sch| {
            let state_style = match sch.state {
                ScheduleState::Active => Style::default().fg(Color::Green),
                ScheduleState::Paused => Style::default().fg(Color::Yellow),
            };
            Row::new(vec![
                Cell::from(format!(" {}", sch.state.as_str())).style(state_style),
                Cell::from(sch.schedule_id.as_str()),
                Cell::from(sch.workflow_type.as_str()),
                Cell::from(
                    sch.next_run
                        .map(|t| {
                            let local = t.with_timezone(&chrono::Local);
                            local.format("%Y-%m-%d %H:%M:%S").to_string()
                        })
                        .unwrap_or_else(|| "-".to_string()),
                ),
                Cell::from(sch.recent_action_count.to_string()),
            ])
        })
        .collect();

    let widths = [
        ratatui::layout::Constraint::Length(12),
        ratatui::layout::Constraint::Percentage(30),
        ratatui::layout::Constraint::Percentage(25),
        ratatui::layout::Constraint::Length(20),
        ratatui::layout::Constraint::Length(10),
    ];

    let table = Table::new(rows, widths)
        .header(header)
        .block(Block::default().borders(Borders::NONE))
        .row_highlight_style(
            Style::default()
                .bg(Color::Rgb(40, 40, 60))
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("▸ ");

    frame.render_stateful_widget(table, area, &mut app.schedule_table_state);
}
