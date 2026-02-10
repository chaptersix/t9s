use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::action::ViewType;
use crate::app::{App, View};

pub fn render(app: &App, frame: &mut Frame, area: Rect) {
    let tabs = [ViewType::Workflows, ViewType::Schedules];

    let mut spans: Vec<Span> = vec![Span::raw(" ")];

    for (i, tab) in tabs.iter().enumerate() {
        let is_active = &app.active_tab == tab;
        let label = format!(" {} {} ", i + 1, tab.label());
        let style = if is_active {
            Style::default()
                .fg(Color::Black)
                .bg(Color::Cyan)
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(Color::DarkGray)
        };
        spans.push(Span::styled(label, style));
        spans.push(Span::raw(" "));
    }

    // Add breadcrumb for detail views
    match app.view {
        View::WorkflowDetail => {
            if let Some(ref wf) = app.selected_workflow {
                spans.push(Span::styled(" > ", Style::default().fg(Color::DarkGray)));
                spans.push(Span::styled(
                    &wf.summary.workflow_id,
                    Style::default().fg(Color::White),
                ));
            }
        }
        View::ScheduleDetail => {
            if let Some(ref sch) = app.selected_schedule {
                spans.push(Span::styled(" > ", Style::default().fg(Color::DarkGray)));
                spans.push(Span::styled(
                    &sch.schedule_id,
                    Style::default().fg(Color::White),
                ));
            }
        }
        _ => {}
    }

    let line = Line::from(spans);
    let widget = Paragraph::new(line).style(Style::default().bg(Color::Rgb(20, 20, 20)));
    frame.render_widget(widget, area);
}
