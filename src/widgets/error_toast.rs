use ratatui::layout::Rect;
use ratatui::style::Style;
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

use crate::app::App;
use crate::theme;

pub fn render(app: &App, frame: &mut Frame, area: Rect) {
    if let Some((ref msg, _)) = app.last_error {
        let toast_area = Rect {
            x: area.x,
            y: area.y + area.height.saturating_sub(2),
            width: area.width,
            height: 1,
        };

        let line = Line::from(vec![
            Span::styled(" ERROR ", Style::default().fg(theme::TEXT).bg(theme::RED)),
            Span::styled(format!(" {}", msg), Style::default().fg(theme::RED)),
        ]);

        frame.render_widget(Paragraph::new(line), toast_area);
    }
}
