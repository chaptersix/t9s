use ratatui::layout::{Constraint, Flex, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};
use ratatui::Frame;

use crate::app::View;
use crate::theme;

pub fn render(view: &View, frame: &mut Frame, area: Rect) {
    let mut lines = vec![];

    let is_list = matches!(view, View::WorkflowList | View::ScheduleList);
    let is_detail = matches!(view, View::WorkflowDetail | View::ScheduleDetail);
    let is_workflow = matches!(view, View::WorkflowList | View::WorkflowDetail);
    let is_schedule = matches!(view, View::ScheduleList | View::ScheduleDetail);

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
    if is_workflow {
        lines.push(binding(":signal <name>", "Signal selected workflow"));
    }
    lines.push(binding(":q", "Quit"));

    if is_workflow {
        lines.push(Line::from(""));
        lines.push(section("Workflow Actions"));
        lines.push(binding("c", "Cancel workflow"));
        lines.push(binding("t", "Terminate workflow"));
        if is_detail {
            lines.push(binding("h / l", "Switch detail tabs"));
        }
    }

    if is_schedule {
        lines.push(Line::from(""));
        lines.push(section("Schedule Actions"));
        lines.push(binding("p", "Pause/unpause schedule"));
        lines.push(binding("T (shift+t)", "Trigger schedule"));
        lines.push(binding("d", "Delete schedule"));
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

fn binding<'a>(key: &'a str, desc: &'a str) -> Line<'a> {
    Line::from(vec![
        Span::styled(format!("    {:<22}", key), Style::default().fg(theme::YELLOW)),
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
