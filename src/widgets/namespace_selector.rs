use ratatui::layout::{Constraint, Flex, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::widgets::{Block, Borders, Cell, Clear, Row, Table};
use ratatui::Frame;

use crate::app::App;

pub fn render(app: &mut App, frame: &mut Frame, area: Rect) {
    let height = (app.namespaces.len() as u16 + 3).min(area.height.saturating_sub(4));
    let modal_area = centered_rect(40, height, area);
    frame.render_widget(Clear, modal_area);

    let rows: Vec<Row> = app
        .namespaces
        .iter()
        .map(|ns| {
            let indicator = if ns.name == app.namespace { "* " } else { "  " };
            Row::new(vec![
                Cell::from(format!("{}{}", indicator, ns.name)),
            ])
        })
        .collect();

    let widths = [Constraint::Fill(1)];

    let table = Table::new(rows, widths)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::Cyan))
                .title(" Select Namespace (Enter to select, Esc to cancel) "),
        )
        .row_highlight_style(
            Style::default()
                .bg(Color::Rgb(40, 40, 60))
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("▸ ");

    frame.render_stateful_widget(table, modal_area, &mut app.namespace_selector_state);
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
