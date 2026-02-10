use std::time::{Duration, Instant};

use ratatui::widgets::TableState;

use crate::action::{Action, ViewType};
use crate::domain::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum View {
    WorkflowList,
    WorkflowDetail,
    ScheduleList,
    ScheduleDetail,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InputMode {
    Normal,
    Command,
    Search,
    PendingG,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Overlay {
    None,
    Help,
    NamespaceSelector,
    Confirm(ConfirmAction),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfirmAction {
    CancelWorkflow(String, Option<String>),
    TerminateWorkflow(String, Option<String>),
    DeleteSchedule(String),
    TriggerSchedule(String),
}

#[derive(Debug, Clone)]
pub enum LoadState<T> {
    NotLoaded,
    Loading,
    Loaded(T),
    Error(String),
}

impl<T> LoadState<T> {
    pub fn data(&self) -> Option<&T> {
        match self {
            Self::Loaded(data) => Some(data),
            _ => None,
        }
    }

    pub fn is_loading(&self) -> bool {
        matches!(self, Self::Loading)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

#[derive(Debug, Clone)]
pub enum Effect {
    LoadWorkflows,
    LoadWorkflowDetail(String, Option<String>),
    LoadHistory(String, Option<String>),
    LoadNamespaces,
    LoadSchedules,
    LoadScheduleDetail(String),
    LoadWorkflowCount,
    CancelWorkflow(String, Option<String>),
    TerminateWorkflow(String, Option<String>),
    PauseSchedule(String, bool),
    TriggerSchedule(String),
    DeleteSchedule(String),
    LoadTaskQueueDetail(String),
    SignalWorkflow(String, Option<String>, String, Option<String>),
    Quit,
}

pub struct App {
    // View state
    pub view: View,
    pub input_mode: InputMode,
    pub overlay: Overlay,

    // Connection
    pub namespace: String,
    pub namespaces: Vec<Namespace>,
    pub connection_status: ConnectionStatus,

    // Workflow data
    pub workflows: LoadState<Vec<WorkflowSummary>>,
    pub workflow_count: Option<u64>,
    pub selected_workflow: Option<WorkflowDetail>,
    pub workflow_history: LoadState<Vec<HistoryEvent>>,
    pub workflow_table_state: TableState,
    pub workflow_detail_tab: usize,

    // Schedule data
    pub schedules: LoadState<Vec<Schedule>>,
    pub selected_schedule: Option<Schedule>,
    pub schedule_table_state: TableState,

    // Task queue data (loaded in workflow detail)
    pub task_queue_detail: LoadState<TaskQueueInfo>,

    // Namespace selector
    pub namespace_selector_state: TableState,

    // Detail scroll
    pub detail_scroll: u16,

    // Input
    pub input_buffer: String,
    pub search_query: Option<String>,

    // Polling
    pub polling_enabled: bool,
    pub polling_interval: Duration,
    pub base_polling_interval: Duration,
    pub last_refresh: Option<Instant>,
    pub error_count: u32,

    // App
    pub should_quit: bool,
    pub last_error: Option<(String, Instant)>,
    pub active_tab: ViewType,
    pub page_size: i32,
    pub next_page_token: Vec<u8>,
}

impl App {
    pub fn new(namespace: String) -> Self {
        Self {
            view: View::WorkflowList,
            input_mode: InputMode::Normal,
            overlay: Overlay::None,

            namespace,
            namespaces: vec![],
            connection_status: ConnectionStatus::Connecting,

            workflows: LoadState::NotLoaded,
            workflow_count: None,
            selected_workflow: None,
            workflow_history: LoadState::NotLoaded,
            workflow_table_state: TableState::default(),
            workflow_detail_tab: 0,

            schedules: LoadState::NotLoaded,
            selected_schedule: None,
            schedule_table_state: TableState::default(),

            task_queue_detail: LoadState::NotLoaded,

            namespace_selector_state: TableState::default(),
            detail_scroll: 0,

            input_buffer: String::new(),
            search_query: None,

            polling_enabled: true,
            polling_interval: Duration::from_secs(3),
            base_polling_interval: Duration::from_secs(3),
            last_refresh: None,
            error_count: 0,

            should_quit: false,
            last_error: None,
            active_tab: ViewType::Workflows,
            page_size: 50,
            next_page_token: vec![],
        }
    }

    pub fn update(&mut self, action: Action) -> Vec<Effect> {
        // Clear stale error toasts
        if let Some((_, at)) = &self.last_error {
            if at.elapsed() > Duration::from_secs(5) {
                self.last_error = None;
            }
        }

        match action {
            // Navigation
            Action::NavigateUp => {
                if self.is_detail_view() {
                    self.detail_scroll = self.detail_scroll.saturating_sub(1);
                } else {
                    self.navigate_up();
                }
                vec![]
            }
            Action::NavigateDown => {
                if self.is_detail_view() {
                    self.detail_scroll = self.detail_scroll.saturating_add(1);
                } else {
                    self.navigate_down();
                }
                vec![]
            }
            Action::NavigateTop => {
                if self.is_detail_view() {
                    self.detail_scroll = 0;
                } else {
                    self.navigate_top();
                }
                vec![]
            }
            Action::NavigateBottom => {
                if self.is_detail_view() {
                    self.detail_scroll = u16::MAX;
                } else {
                    self.navigate_bottom();
                }
                vec![]
            }
            Action::PageUp => {
                if self.is_detail_view() {
                    self.detail_scroll = self.detail_scroll.saturating_sub(self.page_height() as u16);
                } else {
                    for _ in 0..self.page_height() {
                        self.navigate_up();
                    }
                }
                vec![]
            }
            Action::PageDown => {
                if self.is_detail_view() {
                    self.detail_scroll = self.detail_scroll.saturating_add(self.page_height() as u16);
                } else {
                    for _ in 0..self.page_height() {
                        self.navigate_down();
                    }
                }
                vec![]
            }
            Action::Select => self.handle_select(),
            Action::Back => self.handle_back(),

            // View switching
            Action::SwitchView(view_type) => {
                self.active_tab = view_type.clone();
                match view_type {
                    ViewType::Workflows => {
                        self.view = View::WorkflowList;
                        vec![Effect::LoadWorkflows]
                    }
                    ViewType::Schedules => {
                        self.view = View::ScheduleList;
                        vec![Effect::LoadSchedules]
                    }
                    ViewType::TaskQueues => {
                        // No standalone task queue view; TQ info is in workflow detail
                        vec![]
                    }
                }
            }

            // Vim chord
            Action::EnterPendingG => {
                self.input_mode = InputMode::PendingG;
                vec![]
            }

            // Workflow actions
            Action::CancelWorkflow => {
                if let Some(wf) = self.selected_workflow_summary() {
                    self.overlay = Overlay::Confirm(ConfirmAction::CancelWorkflow(
                        wf.workflow_id.clone(),
                        Some(wf.run_id.clone()),
                    ));
                }
                vec![]
            }
            Action::TerminateWorkflow => {
                if let Some(wf) = self.selected_workflow_summary() {
                    self.overlay = Overlay::Confirm(ConfirmAction::TerminateWorkflow(
                        wf.workflow_id.clone(),
                        Some(wf.run_id.clone()),
                    ));
                }
                vec![]
            }

            // Schedule actions
            Action::PauseSchedule => {
                if let Some(sch) = self.selected_schedule_summary() {
                    let pause = sch.state != ScheduleState::Paused;
                    return vec![Effect::PauseSchedule(sch.schedule_id.clone(), pause)];
                }
                vec![]
            }
            Action::TriggerSchedule => {
                if let Some(sch) = self.selected_schedule_summary() {
                    self.overlay = Overlay::Confirm(ConfirmAction::TriggerSchedule(
                        sch.schedule_id.clone(),
                    ));
                }
                vec![]
            }
            Action::DeleteSchedule => {
                if let Some(sch) = self.selected_schedule_summary() {
                    self.overlay = Overlay::Confirm(ConfirmAction::DeleteSchedule(
                        sch.schedule_id.clone(),
                    ));
                }
                vec![]
            }

            // UI
            Action::OpenCommandInput => {
                self.input_mode = InputMode::Command;
                self.input_buffer.clear();
                vec![]
            }
            Action::OpenSearch => {
                self.input_mode = InputMode::Search;
                self.input_buffer = self.search_query.clone().unwrap_or_default();
                vec![]
            }
            Action::CloseOverlay => {
                if self.overlay != Overlay::None {
                    self.overlay = Overlay::None;
                } else if self.input_mode != InputMode::Normal {
                    self.input_mode = InputMode::Normal;
                    self.input_buffer.clear();
                }
                vec![]
            }
            Action::SubmitCommandInput(cmd) => {
                self.input_mode = InputMode::Normal;
                let effects = self.execute_command(&cmd);
                self.input_buffer.clear();
                effects
            }
            Action::UpdateInputBuffer(buf) => {
                self.input_buffer = buf.clone();
                if self.input_mode == InputMode::Search {
                    if buf.is_empty() {
                        self.search_query = None;
                    } else {
                        self.search_query = Some(buf);
                    }
                    vec![Effect::LoadWorkflows]
                } else {
                    vec![]
                }
            }
            Action::ToggleHelp => {
                self.overlay = if self.overlay == Overlay::Help {
                    Overlay::None
                } else {
                    Overlay::Help
                };
                vec![]
            }
            Action::SwitchNamespace(ns) => {
                self.namespace = ns;
                self.overlay = Overlay::None;
                self.workflows = LoadState::NotLoaded;
                self.schedules = LoadState::NotLoaded;
                self.workflow_table_state = TableState::default();
                self.schedule_table_state = TableState::default();
                self.selected_workflow = None;
                self.selected_schedule = None;
                self.search_query = None;
                match self.view {
                    View::WorkflowList | View::WorkflowDetail => {
                        self.view = View::WorkflowList;
                        vec![Effect::LoadWorkflows, Effect::LoadWorkflowCount]
                    }
                    View::ScheduleList | View::ScheduleDetail => {
                        self.view = View::ScheduleList;
                        vec![Effect::LoadSchedules]
                    }
                }
            }
            Action::NextTab => {
                if self.view == View::WorkflowDetail {
                    self.workflow_detail_tab = (self.workflow_detail_tab + 1).min(4);
                    self.detail_scroll = 0;
                    return self.load_workflow_tab_data();
                }
                vec![]
            }
            Action::PrevTab => {
                if self.view == View::WorkflowDetail {
                    self.workflow_detail_tab = self.workflow_detail_tab.saturating_sub(1);
                    self.detail_scroll = 0;
                    return self.load_workflow_tab_data();
                }
                vec![]
            }

            // Data responses
            Action::WorkflowsLoaded(workflows, next_page_token) => {
                self.workflows = LoadState::Loaded(workflows);
                self.next_page_token = next_page_token;
                self.connection_status = ConnectionStatus::Connected;
                self.reset_backoff();
                self.last_refresh = Some(Instant::now());
                if self.workflow_table_state.selected().is_none() {
                    self.workflow_table_state.select_first();
                }
                vec![]
            }
            Action::WorkflowDetailLoaded(detail) => {
                self.selected_workflow = Some(*detail);
                vec![]
            }
            Action::HistoryLoaded(events) => {
                self.workflow_history = LoadState::Loaded(events);
                vec![]
            }
            Action::NamespacesLoaded(namespaces) => {
                self.namespaces = namespaces;
                if self.namespace_selector_state.selected().is_none() {
                    self.namespace_selector_state.select_first();
                }
                vec![]
            }
            Action::SchedulesLoaded(schedules) => {
                self.schedules = LoadState::Loaded(schedules);
                self.last_refresh = Some(Instant::now());
                if self.schedule_table_state.selected().is_none() {
                    self.schedule_table_state.select_first();
                }
                vec![]
            }
            Action::ScheduleDetailLoaded(schedule) => {
                self.selected_schedule = Some(*schedule);
                vec![]
            }
            Action::WorkflowCountLoaded(count) => {
                self.workflow_count = Some(count);
                vec![]
            }
            Action::TaskQueueDetailLoaded(tq) => {
                self.task_queue_detail = LoadState::Loaded(*tq);
                vec![]
            }

            // App control
            Action::Refresh => self.refresh_current_view(),
            Action::Quit => {
                self.should_quit = true;
                vec![Effect::Quit]
            }
            Action::Tick => {
                if self.polling_enabled {
                    let should_poll = self
                        .last_refresh
                        .map(|t| t.elapsed() >= self.polling_interval)
                        .unwrap_or(true);
                    if should_poll {
                        return self.refresh_current_view();
                    }
                }
                vec![]
            }
            Action::Error(msg) => {
                self.last_error = Some((msg.clone(), Instant::now()));
                self.error_count += 1;
                self.apply_backoff();
                if self.connection_status == ConnectionStatus::Connected {
                    self.connection_status = ConnectionStatus::Error(msg);
                }
                vec![]
            }
            Action::ClearError => {
                self.last_error = None;
                vec![]
            }
            Action::TogglePolling => {
                self.polling_enabled = !self.polling_enabled;
                vec![]
            }
        }
    }

    fn handle_select(&mut self) -> Vec<Effect> {
        match self.view {
            View::WorkflowList => {
                if let Some(workflows) = self.workflows.data() {
                    if let Some(idx) = self.workflow_table_state.selected() {
                        if let Some(wf) = workflows.get(idx) {
                            self.view = View::WorkflowDetail;
                            self.workflow_detail_tab = 0;
                            self.workflow_history = LoadState::NotLoaded;
                            self.task_queue_detail = LoadState::NotLoaded;
                            self.detail_scroll = 0;
                            return vec![Effect::LoadWorkflowDetail(
                                wf.workflow_id.clone(),
                                Some(wf.run_id.clone()),
                            )];
                        }
                    }
                }
                vec![]
            }
            View::ScheduleList => {
                if let Some(schedules) = self.schedules.data() {
                    if let Some(idx) = self.schedule_table_state.selected() {
                        if let Some(sch) = schedules.get(idx) {
                            self.view = View::ScheduleDetail;
                            self.detail_scroll = 0;
                            return vec![Effect::LoadScheduleDetail(sch.schedule_id.clone())];
                        }
                    }
                }
                vec![]
            }
            _ => vec![],
        }
    }

    fn handle_back(&mut self) -> Vec<Effect> {
        match self.view {
            View::WorkflowDetail => {
                self.view = View::WorkflowList;
                self.selected_workflow = None;
                self.workflow_history = LoadState::NotLoaded;
                vec![]
            }
            View::ScheduleDetail => {
                self.view = View::ScheduleList;
                self.selected_schedule = None;
                vec![]
            }
            _ => vec![],
        }
    }

    fn execute_command(&mut self, cmd: &str) -> Vec<Effect> {
        let parts: Vec<&str> = cmd.trim().splitn(2, ' ').collect();
        let command = parts[0].to_lowercase();
        let args = parts.get(1).map(|s| s.trim());

        match command.as_str() {
            "workflows" | "wf" => {
                self.active_tab = ViewType::Workflows;
                self.view = View::WorkflowList;
                vec![Effect::LoadWorkflows]
            }
            "schedules" | "sch" => {
                self.active_tab = ViewType::Schedules;
                self.view = View::ScheduleList;
                vec![Effect::LoadSchedules]
            }
            "signal" | "sig" => {
                if let Some(signal_args) = args {
                    let signal_parts: Vec<&str> = signal_args.splitn(2, ' ').collect();
                    let signal_name = signal_parts[0].to_string();
                    let signal_input = signal_parts.get(1).map(|s| s.to_string());
                    if let Some(wf) = self.selected_workflow_summary() {
                        return vec![Effect::SignalWorkflow(
                            wf.workflow_id.clone(),
                            Some(wf.run_id.clone()),
                            signal_name,
                            signal_input,
                        )];
                    } else {
                        self.last_error = Some(("no workflow selected".to_string(), Instant::now()));
                    }
                } else {
                    self.last_error = Some(("usage: :signal <name> [json-input]".to_string(), Instant::now()));
                }
                vec![]
            }
            "namespace" | "ns" => {
                if let Some(ns_name) = args {
                    self.namespace = ns_name.to_string();
                    self.workflows = LoadState::NotLoaded;
                    self.schedules = LoadState::NotLoaded;
                    self.workflow_table_state = TableState::default();
                    self.schedule_table_state = TableState::default();
                    self.refresh_current_view()
                } else {
                    self.overlay = Overlay::NamespaceSelector;
                    vec![Effect::LoadNamespaces]
                }
            }
            "quit" | "q" => {
                self.should_quit = true;
                vec![Effect::Quit]
            }
            "help" | "h" => {
                self.overlay = Overlay::Help;
                vec![]
            }
            _ => {
                self.last_error = Some((format!("unknown command: {}", command), Instant::now()));
                vec![]
            }
        }
    }

    fn refresh_current_view(&mut self) -> Vec<Effect> {
        match self.view {
            View::WorkflowList => vec![Effect::LoadWorkflows, Effect::LoadWorkflowCount],
            View::WorkflowDetail => {
                if let Some(ref wf) = self.selected_workflow {
                    vec![Effect::LoadWorkflowDetail(
                        wf.summary.workflow_id.clone(),
                        Some(wf.summary.run_id.clone()),
                    )]
                } else {
                    vec![]
                }
            }
            View::ScheduleList => vec![Effect::LoadSchedules],
            View::ScheduleDetail => {
                if let Some(ref sch) = self.selected_schedule {
                    vec![Effect::LoadScheduleDetail(sch.schedule_id.clone())]
                } else {
                    vec![]
                }
            }
        }
    }

    fn selected_workflow_summary(&self) -> Option<&WorkflowSummary> {
        match self.view {
            View::WorkflowList => {
                let workflows = self.workflows.data()?;
                let idx = self.workflow_table_state.selected()?;
                workflows.get(idx)
            }
            View::WorkflowDetail => {
                self.selected_workflow.as_ref().map(|d| &d.summary)
            }
            _ => None,
        }
    }

    fn selected_schedule_summary(&self) -> Option<&Schedule> {
        match self.view {
            View::ScheduleList => {
                let schedules = self.schedules.data()?;
                let idx = self.schedule_table_state.selected()?;
                schedules.get(idx)
            }
            View::ScheduleDetail => self.selected_schedule.as_ref(),
            _ => None,
        }
    }

    fn navigate_up(&mut self) {
        match self.view {
            View::WorkflowList => {
                self.workflow_table_state.select_previous();
            }
            View::ScheduleList => {
                self.schedule_table_state.select_previous();
            }
            _ => {}
        }
    }

    fn navigate_down(&mut self) {
        let len = match self.view {
            View::WorkflowList => self.workflows.data().map(|w| w.len()).unwrap_or(0),
            View::ScheduleList => self.schedules.data().map(|s| s.len()).unwrap_or(0),
            _ => return,
        };

        if len == 0 {
            return;
        }

        match self.view {
            View::WorkflowList => {
                self.workflow_table_state.select_next();
            }
            View::ScheduleList => {
                self.schedule_table_state.select_next();
            }
            _ => {}
        }
    }

    fn navigate_top(&mut self) {
        self.input_mode = InputMode::Normal;
        match self.view {
            View::WorkflowList => {
                self.workflow_table_state.select_first();
            }
            View::ScheduleList => {
                self.schedule_table_state.select_first();
            }
            _ => {}
        }
    }

    fn navigate_bottom(&mut self) {
        match self.view {
            View::WorkflowList => {
                self.workflow_table_state.select_last();
            }
            View::ScheduleList => {
                self.schedule_table_state.select_last();
            }
            _ => {}
        }
    }

    fn is_detail_view(&self) -> bool {
        matches!(self.view, View::WorkflowDetail | View::ScheduleDetail)
    }

    fn load_workflow_tab_data(&mut self) -> Vec<Effect> {
        if let Some(ref wf) = self.selected_workflow {
            match self.workflow_detail_tab {
                2 => {
                    // History tab
                    vec![Effect::LoadHistory(
                        wf.summary.workflow_id.clone(),
                        Some(wf.summary.run_id.clone()),
                    )]
                }
                4 => {
                    // Task Queue tab
                    self.task_queue_detail = LoadState::Loading;
                    vec![Effect::LoadTaskQueueDetail(wf.summary.task_queue.clone())]
                }
                _ => vec![],
            }
        } else {
            vec![]
        }
    }

    fn reset_backoff(&mut self) {
        self.error_count = 0;
        self.polling_interval = self.base_polling_interval;
    }

    fn apply_backoff(&mut self) {
        let multiplier = 2u64.pow(self.error_count.min(5));
        let backoff_secs = self.base_polling_interval.as_secs() * multiplier;
        self.polling_interval = Duration::from_secs(backoff_secs.min(60));
    }

    fn page_height(&self) -> usize {
        20 // approximate; could be made dynamic
    }
}
