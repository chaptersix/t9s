use ratatui::layout::{Constraint, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::widgets::{Block, Borders, Cell, Paragraph, Row, Table, TableState};
use ratatui::Frame;

use crate::kinds::{collection_spec, KindId};
use crate::theme;

pub struct CollectionTable {
    pub header: Row<'static>,
    pub rows: Option<Vec<Row<'static>>>,
    pub widths: Vec<Constraint>,
    pub loading_label: &'static str,
    pub empty_label: &'static str,
    pub is_loading: bool,
}

pub fn render_collection(
    frame: &mut Frame,
    area: Rect,
    state: &mut TableState,
    table: CollectionTable,
) {
    let rows = match table.rows {
        Some(rows) => rows,
        None => {
            let label = if table.is_loading {
                table.loading_label
            } else {
                table.empty_label
            };
            let loading = Paragraph::new(label).style(Style::default().fg(theme::TEXT_MUTED));
            frame.render_widget(loading, area);
            return;
        }
    };

    let table = Table::new(rows, table.widths)
        .header(table.header)
        .block(Block::default().borders(Borders::NONE))
        .row_highlight_style(
            Style::default()
                .bg(theme::BG_HIGHLIGHT)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("▸ ");

    frame.render_stateful_widget(table, area, state);
}

pub fn header_row(labels: &[&'static str]) -> Row<'static> {
    Row::new(
        labels
            .iter()
            .map(|label| Cell::from(*label))
            .collect::<Vec<_>>(),
    )
    .style(
        Style::default()
            .fg(theme::TEXT_DIM)
            .add_modifier(Modifier::BOLD),
    )
    .height(1)
}

pub fn render_kind_collection(
    app: &mut crate::app::App,
    frame: &mut Frame,
    area: Rect,
    kind: KindId,
) {
    let spec = collection_spec(kind);
    let table = CollectionTable {
        header: header_row(spec.header),
        rows: (spec.rows)(app),
        widths: (spec.widths)(),
        loading_label: spec.loading_label,
        empty_label: spec.empty_label,
        is_loading: (spec.is_loading)(app),
    };
    let state = (spec.table_state)(app);
    render_collection(frame, area, state, table);
}
