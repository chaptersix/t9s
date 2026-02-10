use ratatui::layout::{Constraint, Flex, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph, Wrap};
use ratatui::Frame;

use crate::app::ConfirmAction;

pub fn render(action: &ConfirmAction, frame: &mut Frame, area: Rect) {
    let message = match action {
        ConfirmAction::CancelWorkflow(id, _) => format!("Cancel workflow {}?", id),
        ConfirmAction::TerminateWorkflow(id, _) => format!("Terminate workflow {}?", id),
        ConfirmAction::DeleteSchedule(id) => format!("Delete schedule {}?", id),
        ConfirmAction::TriggerSchedule(id) => format!("Trigger schedule {}?", id),
    };

    let modal_area = centered_rect(50, 7, area);

    frame.render_widget(Clear, modal_area);

    let lines = vec![
        Line::from(""),
        Line::from(Span::styled(
            format!("  {}", message),
            Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD),
        )),
        Line::from(""),
        Line::from(vec![
            Span::styled("  y/Enter", Style::default().fg(Color::Green)),
            Span::raw(" confirm  "),
            Span::styled("n/Esc", Style::default().fg(Color::Red)),
            Span::raw(" cancel"),
        ]),
    ];

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Yellow))
        .title(" Confirm ");

    let paragraph = Paragraph::new(lines).block(block).wrap(Wrap { trim: true });
    frame.render_widget(paragraph, modal_area);
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
