use ratatui::layout::{Constraint, Flex, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph, Wrap};
use ratatui::Frame;

use crate::app::{ConfirmAction, OperationConfirm, OperationTarget};
use crate::kinds::OperationId;
use crate::theme;

pub fn render(action: &ConfirmAction, frame: &mut Frame, area: Rect) {
    let message = match action {
        ConfirmAction::Operation(confirm) => confirm_message(confirm),
    };

    let modal_area = centered_rect(50, 7, area);

    frame.render_widget(Clear, modal_area);

    let lines = vec![
        Line::from(""),
        Line::from(Span::styled(
            format!("  {}", message),
            Style::default()
                .fg(theme::YELLOW)
                .add_modifier(Modifier::BOLD),
        )),
        Line::from(""),
        Line::from(vec![
            Span::styled("  y/Enter", Style::default().fg(theme::GREEN)),
            Span::raw(" confirm  "),
            Span::styled("n/Esc", Style::default().fg(theme::RED)),
            Span::raw(" cancel"),
        ]),
    ];

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme::YELLOW))
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

fn confirm_message(confirm: &OperationConfirm) -> String {
    let label = match confirm.op {
        OperationId::CancelWorkflow => "Cancel workflow",
        OperationId::TerminateWorkflow => "Terminate workflow",
        OperationId::TriggerSchedule => "Trigger schedule",
        OperationId::DeleteSchedule => "Delete schedule",
        OperationId::PauseSchedule => "Pause schedule",
    };

    match &confirm.target {
        OperationTarget::Workflow { workflow_id, .. } => {
            format!("{} {}?", label, workflow_id)
        }
        OperationTarget::Schedule { schedule_id } => format!("{} {}?", label, schedule_id),
    }
}
