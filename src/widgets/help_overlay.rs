use ratatui::layout::{Constraint, Flex, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph};
use ratatui::Frame;

pub fn render(frame: &mut Frame, area: Rect) {
    let modal_area = centered_rect(60, 32, area);
    frame.render_widget(Clear, modal_area);

    let lines = vec![
        Line::from(""),
        section("Navigation"),
        binding("j / k / Up / Down", "Navigate up/down"),
        binding("gg / G", "Go to top / bottom"),
        binding("Ctrl+D / Ctrl+U", "Page down / up"),
        binding("Enter", "Select / drill in"),
        binding("Esc", "Back"),
        Line::from(""),
        section("Views"),
        binding("1", "Workflows"),
        binding("2", "Schedules"),
        binding(": (colon)", "Command mode"),
        binding("/ (slash)", "Search"),
        Line::from(""),
        section("Commands"),
        binding(":wf", "Switch to workflows"),
        binding(":sch", "Switch to schedules"),
        binding(":ns <name>", "Switch namespace"),
        binding(":signal <name>", "Signal selected workflow"),
        binding(":q", "Quit"),
        Line::from(""),
        section("Workflow Actions"),
        binding("c", "Cancel workflow"),
        binding("t", "Terminate workflow"),
        binding("h / l", "Switch detail tabs"),
        Line::from(""),
        section("Schedule Actions"),
        binding("p", "Pause/unpause schedule"),
        binding("T (shift+t)", "Trigger schedule"),
        binding("d", "Delete schedule"),
        Line::from(""),
        section("General"),
        binding("Ctrl+R", "Refresh"),
        binding("?", "Toggle this help"),
    ];

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan))
        .title(" Help (? to close) ");

    let paragraph = Paragraph::new(lines).block(block);
    frame.render_widget(paragraph, modal_area);
}

fn section(title: &str) -> Line<'_> {
    Line::from(Span::styled(
        format!("  {}", title),
        Style::default()
            .fg(Color::Cyan)
            .add_modifier(Modifier::BOLD),
    ))
}

fn binding<'a>(key: &'a str, desc: &'a str) -> Line<'a> {
    Line::from(vec![
        Span::styled(format!("    {:<22}", key), Style::default().fg(Color::Yellow)),
        Span::styled(desc, Style::default().fg(Color::White)),
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
