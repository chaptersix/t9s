use ratatui::layout::{Constraint, Flex, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};
use ratatui::Frame;

use crate::app::View;
use crate::kinds::{kind_spec, KindId};
use crate::theme;

pub fn render(view: &View, frame: &mut Frame, area: Rect) {
    let mut lines = vec![];

    let is_list = matches!(view, View::Collection(_));
    let is_detail = matches!(view, View::Detail(_));
    let is_workflow = matches!(
        view,
        View::Collection(KindId::WorkflowExecution) | View::Detail(KindId::WorkflowExecution)
    );
    let is_schedule = matches!(
        view,
        View::Collection(KindId::Schedule) | View::Detail(KindId::Schedule)
    );

    lines.push(Line::from(""));
    lines.push(section("Navigation"));
    lines.push(binding("j / k / Up / Down", "Navigate up/down"));
    lines.push(binding("gg / G", "Go to top / bottom"));
    lines.push(binding("Ctrl+D / Ctrl+U", "Page down / up"));
    if is_list {
        lines.push(binding("Enter", "Select / drill in"));
    }
    if is_detail {
        lines.push(binding("Esc", "Back to list"));
    }

    lines.push(Line::from(""));
    lines.push(section("Views"));
    lines.push(binding(": (colon)", "Command mode"));
    lines.push(binding(":wf", "Switch to workflows"));
    lines.push(binding(":sch", "Switch to schedules"));
    if is_list {
        lines.push(binding("/ (slash)", "Search"));
    }

    lines.push(Line::from(""));
    lines.push(section("Commands"));
    lines.push(binding(":ns <name>", "Switch namespace"));
    lines.push(binding(":open <uri>", "Open a deep link URI"));
    if is_workflow {
        lines.push(binding(":signal <name>", "Signal selected workflow"));
    }
    lines.push(binding(":q", "Quit"));

    if is_workflow {
        lines.push(Line::from(""));
        lines.push(section("Workflow Actions"));
        for op in kind_spec(KindId::WorkflowExecution).operations {
            lines.push(binding(&op.key.to_string(), op.label));
        }
        if is_detail {
            lines.push(binding("h / l", "Switch detail tabs"));
            lines.push(binding("a", "Pending activities"));
        }
    }

    if is_schedule {
        lines.push(Line::from(""));
        lines.push(section("Schedule Actions"));
        for op in kind_spec(KindId::Schedule).operations {
            let key = if op.key == 'T' {
                "T (shift+t)".to_string()
            } else {
                op.key.to_string()
            };
            lines.push(binding(&key, op.label));
        }
        lines.push(binding("w", "Schedule workflows"));
    }

    lines.push(Line::from(""));
    lines.push(section("General"));
    lines.push(binding("Ctrl+R", "Refresh"));
    lines.push(binding("?", "Toggle this help"));

    let height = (lines.len() as u16 + 2).min(area.height.saturating_sub(4));
    let modal_area = centered_rect(60, height, area);
    frame.render_widget(Clear, modal_area);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme::PURPLE))
        .title(" Help (? to close) ");

    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, modal_area);
}

fn section(title: &str) -> Line<'_> {
    Line::from(Span::styled(
        format!("  {}", title),
        Style::default()
            .fg(theme::PURPLE)
            .add_modifier(Modifier::BOLD),
    ))
}

fn binding(key: impl Into<String>, desc: impl Into<String>) -> Line<'static> {
    let key = key.into();
    let desc = desc.into();
    Line::from(vec![
        Span::styled(
            format!("    {:<22}", key),
            Style::default().fg(theme::YELLOW),
        ),
        Span::styled(desc, Style::default().fg(theme::TEXT)),
    ])
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
