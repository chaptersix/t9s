use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::widgets::{Block, Borders, Cell, Row, Table};
use ratatui::Frame;

use crate::app::App;
use crate::domain::WorkflowStatus;

pub fn render(app: &mut App, frame: &mut Frame, area: Rect) {
    let workflows = match app.workflows.data() {
        Some(wfs) => wfs,
        None => {
            let loading = ratatui::widgets::Paragraph::new(if app.workflows.is_loading() {
                " Loading workflows..."
            } else {
                " No workflows loaded"
            })
            .style(Style::default().fg(Color::DarkGray));
            frame.render_widget(loading, area);
            return;
        }
    };

    let header = Row::new(vec![
        Cell::from(" Status"),
        Cell::from("Workflow ID"),
        Cell::from("Type"),
        Cell::from("Started"),
        Cell::from("Task Queue"),
    ])
    .style(
        Style::default()
            .fg(Color::Cyan)
            .add_modifier(Modifier::BOLD),
    )
    .height(1);

    let rows: Vec<Row> = workflows
        .iter()
        .map(|wf| {
            let status_style = status_color(&wf.status);
            Row::new(vec![
                Cell::from(format!(" {} {}", wf.status.symbol(), wf.status.as_str()))
                    .style(status_style),
                Cell::from(wf.workflow_id.as_str()),
                Cell::from(wf.workflow_type.as_str()),
                Cell::from(format_time(&wf.start_time)),
                Cell::from(wf.task_queue.as_str()),
            ])
        })
        .collect();

    let widths = [
        ratatui::layout::Constraint::Length(18),
        ratatui::layout::Constraint::Percentage(30),
        ratatui::layout::Constraint::Percentage(20),
        ratatui::layout::Constraint::Length(20),
        ratatui::layout::Constraint::Percentage(20),
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

    frame.render_stateful_widget(table, area, &mut app.workflow_table_state);
}

fn status_color(status: &WorkflowStatus) -> Style {
    match status {
        WorkflowStatus::Running => Style::default().fg(Color::Green),
        WorkflowStatus::Completed => Style::default().fg(Color::Blue),
        WorkflowStatus::Failed => Style::default().fg(Color::Red),
        WorkflowStatus::Canceled => Style::default().fg(Color::Yellow),
        WorkflowStatus::Terminated => Style::default().fg(Color::Magenta),
        WorkflowStatus::TimedOut => Style::default().fg(Color::Red),
        WorkflowStatus::ContinuedAsNew => Style::default().fg(Color::Cyan),
    }
}

fn format_time(dt: &chrono::DateTime<chrono::Utc>) -> String {
    let local = dt.with_timezone(&chrono::Local);
    local.format("%Y-%m-%d %H:%M:%S").to_string()
}
