use std::collections::HashMap;
use std::time::{Duration, Instant};

use ratatui::widgets::TableState;

use crate::action::{Action, ViewType};
use crate::domain::*;
use crate::kinds::{detail_tab_count, operation_effect_spec, operation_spec, KindId, OperationId};
use crate::nav::{
    parse_deep_link, Location, RouteSegment, SchedulesRoute, UriError, WorkflowsRoute,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum View {
    Collection(KindId),
    Detail(KindId),
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
    Operation(OperationConfirm),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationConfirm {
    pub kind: KindId,
    pub op: OperationId,
    pub target: OperationTarget,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OperationTarget {
    Workflow {
        workflow_id: String,
        run_id: Option<String>,
    },
    Schedule {
        schedule_id: String,
    },
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
    LoadMoreWorkflows,
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
    pub search_queries: HashMap<KindId, String>,

    // Polling
    pub polling_enabled: bool,
    pub polling_interval: Duration,
    pub base_polling_interval: Duration,
    pub last_refresh: Option<Instant>,
    pub error_count: u32,

    // Pagination
    pub loading_more: bool,

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
            view: View::Collection(KindId::WorkflowExecution),
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
            search_queries: HashMap::new(),

            loading_more: false,

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
                self.maybe_load_more()
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
                self.maybe_load_more()
            }
            Action::PageUp => {
                if self.is_detail_view() {
                    self.detail_scroll =
                        self.detail_scroll.saturating_sub(self.page_height() as u16);
                } else {
                    for _ in 0..self.page_height() {
                        self.navigate_up();
                    }
                }
                vec![]
            }
            Action::PageDown => {
                if self.is_detail_view() {
                    self.detail_scroll =
                        self.detail_scroll.saturating_add(self.page_height() as u16);
                } else {
                    for _ in 0..self.page_height() {
                        self.navigate_down();
                    }
                }
                self.maybe_load_more()
            }
            Action::Select => self.handle_select(),
            Action::Back => self.handle_back(),

            // View switching
            Action::SwitchView(view_type) => {
                self.active_tab = view_type.clone();
                match view_type {
                    ViewType::Workflows => {
                        self.view = View::Collection(KindId::WorkflowExecution);
                        vec![Effect::LoadWorkflows]
                    }
                    ViewType::Schedules => {
                        self.view = View::Collection(KindId::Schedule);
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

            // Operations
            Action::RunOperation(op_id) => self.run_operation(op_id),

            // UI
            Action::OpenCommandInput => {
                self.input_mode = InputMode::Command;
                self.input_buffer.clear();
                vec![]
            }
            Action::OpenSearch => {
                self.input_mode = InputMode::Search;
                self.input_buffer = self.current_search_query().unwrap_or_default();
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
                self.input_buffer = buf;
                vec![]
            }
            Action::SubmitSearch(query) => {
                self.input_mode = InputMode::Normal;
                let kind = self.current_kind_id();
                if query.is_empty() {
                    self.search_queries.remove(&kind);
                } else {
                    self.search_queries.insert(kind, query);
                }
                self.input_buffer.clear();
                match kind {
                    KindId::WorkflowExecution => {
                        vec![Effect::LoadWorkflows, Effect::LoadWorkflowCount]
                    }
                    KindId::Schedule => vec![Effect::LoadSchedules],
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
                self.search_queries.clear();
                match self.current_kind_id() {
                    KindId::WorkflowExecution => {
                        self.view = View::Collection(KindId::WorkflowExecution);
                        vec![Effect::LoadWorkflows, Effect::LoadWorkflowCount]
                    }
                    KindId::Schedule => {
                        self.view = View::Collection(KindId::Schedule);
                        vec![Effect::LoadSchedules]
                    }
                }
            }
            Action::NextTab => {
                if self.view == View::Detail(KindId::WorkflowExecution) {
                    let tab_count = detail_tab_count(KindId::WorkflowExecution).max(1);
                    self.workflow_detail_tab = (self.workflow_detail_tab + 1) % tab_count;
                    self.detail_scroll = 0;
                    return self.load_workflow_tab_data();
                }
                vec![]
            }
            Action::PrevTab => {
                if self.view == View::Detail(KindId::WorkflowExecution) {
                    let tab_count = detail_tab_count(KindId::WorkflowExecution).max(1);
                    self.workflow_detail_tab = if self.workflow_detail_tab == 0 {
                        tab_count - 1
                    } else {
                        self.workflow_detail_tab - 1
                    };
                    self.detail_scroll = 0;
                    return self.load_workflow_tab_data();
                }
                vec![]
            }
            Action::OpenScheduleWorkflows => {
                if let Some(schedule) = self.selected_schedule_summary() {
                    let location = Location::new(
                        self.namespace.clone(),
                        vec![RouteSegment::Schedules(SchedulesRoute::Workflows {
                            schedule_id: schedule.schedule_id.clone(),
                            query: None,
                        })],
                    );
                    return self.apply_location(location);
                }
                vec![]
            }
            Action::OpenWorkflowActivities => {
                if let Some(workflow) = self.selected_workflow_summary() {
                    let location = Location::new(
                        self.namespace.clone(),
                        vec![RouteSegment::Workflows(WorkflowsRoute::Activities {
                            workflow_id: workflow.workflow_id.clone(),
                            activity_id: None,
                        })],
                    );
                    return self.apply_location(location);
                }
                vec![]
            }

            // Data responses
            Action::WorkflowsLoaded(workflows, next_page_token) => {
                self.workflows = LoadState::Loaded(workflows);
                self.next_page_token = next_page_token;
                self.loading_more = false;
                self.connection_status = ConnectionStatus::Connected;
                self.reset_backoff();
                self.last_refresh = Some(Instant::now());
                if self.workflow_table_state.selected().is_none() {
                    self.workflow_table_state.select_first();
                }
                vec![]
            }
            Action::MoreWorkflowsLoaded(workflows, next_page_token) => {
                if let LoadState::Loaded(ref mut existing) = self.workflows {
                    existing.extend(workflows);
                }
                self.next_page_token = next_page_token;
                self.loading_more = false;
                self.connection_status = ConnectionStatus::Connected;
                self.reset_backoff();
                vec![]
            }
            Action::WorkflowDetailLoaded(mut detail) => {
                // Preserve input/output/failure extracted from history
                if let Some(ref existing) = self.selected_workflow {
                    if detail.input.is_none() {
                        detail.input = existing.input.clone();
                    }
                    if detail.output.is_none() {
                        detail.output = existing.output.clone();
                    }
                    if detail.failure.is_none() {
                        detail.failure = existing.failure.clone();
                    }
                    if detail.history_length == 0 && existing.history_length > 0 {
                        detail.history_length = existing.history_length;
                    }
                }
                self.selected_workflow = Some(*detail);
                vec![]
            }
            Action::HistoryLoaded(events) => {
                // Extract input/output/failure from history events
                if let Some(ref mut detail) = self.selected_workflow {
                    for event in &events {
                        if event.event_type.contains("WorkflowExecutionStarted")
                            && !event.event_type.contains("Child")
                        {
                            if let Some(input) = event.details.get("input") {
                                detail.input = Some(input.clone());
                            }
                        }
                        if event.event_type.contains("WorkflowExecutionCompleted")
                            && !event.event_type.contains("Child")
                        {
                            if let Some(result) = event.details.get("result") {
                                detail.output = Some(result.clone());
                            }
                        }
                        if event.event_type.contains("WorkflowExecutionFailed")
                            && !event.event_type.contains("Child")
                        {
                            if let Some(failure) = event.details.get("failure") {
                                detail.failure = Some(FailureInfo {
                                    message: failure
                                        .get("message")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    failure_type: failure
                                        .get("source")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    stack_trace: failure
                                        .get("stack_trace")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string()),
                                    cause: None,
                                });
                            }
                        }
                    }
                    detail.history_length = events.len() as u64;
                }
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
            View::Collection(KindId::WorkflowExecution) => {
                if let Some(workflows) = self.workflows.data() {
                    if let Some(idx) = self.workflow_table_state.selected() {
                        if let Some(wf) = workflows.get(idx) {
                            self.view = View::Detail(KindId::WorkflowExecution);
                            self.workflow_detail_tab = 0;
                            self.workflow_history = LoadState::Loading;
                            self.task_queue_detail = LoadState::NotLoaded;
                            self.detail_scroll = 0;
                            return vec![
                                Effect::LoadWorkflowDetail(
                                    wf.workflow_id.clone(),
                                    Some(wf.run_id.clone()),
                                ),
                                Effect::LoadHistory(
                                    wf.workflow_id.clone(),
                                    Some(wf.run_id.clone()),
                                ),
                            ];
                        }
                    }
                }
                vec![]
            }
            View::Collection(KindId::Schedule) => {
                if let Some(schedules) = self.schedules.data() {
                    if let Some(idx) = self.schedule_table_state.selected() {
                        if let Some(sch) = schedules.get(idx) {
                            self.view = View::Detail(KindId::Schedule);
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
            View::Detail(KindId::WorkflowExecution) => {
                self.view = View::Collection(KindId::WorkflowExecution);
                self.selected_workflow = None;
                self.workflow_history = LoadState::NotLoaded;
                vec![]
            }
            View::Detail(KindId::Schedule) => {
                self.view = View::Collection(KindId::Schedule);
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
                self.view = View::Collection(KindId::WorkflowExecution);
                vec![Effect::LoadWorkflows]
            }
            "schedules" | "sch" => {
                self.active_tab = ViewType::Schedules;
                self.view = View::Collection(KindId::Schedule);
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
                        self.last_error =
                            Some(("no workflow selected".to_string(), Instant::now()));
                    }
                } else {
                    self.last_error = Some((
                        "usage: :signal <name> [json-input]".to_string(),
                        Instant::now(),
                    ));
                }
                vec![]
            }
            "open" | "goto" => {
                if let Some(uri) = args {
                    match parse_deep_link(uri) {
                        Ok(location) => return self.apply_location(location),
                        Err(err) => {
                            self.last_error = Some((
                                format!("invalid uri: {}", format_uri_error(err)),
                                Instant::now(),
                            ));
                            vec![]
                        }
                    }
                } else {
                    self.last_error = Some((
                        "usage: :open temporal://tui/namespaces/<ns>/...".to_string(),
                        Instant::now(),
                    ));
                    vec![]
                }
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
            View::Collection(KindId::WorkflowExecution) => {
                vec![Effect::LoadWorkflows, Effect::LoadWorkflowCount]
            }
            View::Detail(KindId::WorkflowExecution) => {
                if let Some(ref wf) = self.selected_workflow {
                    vec![Effect::LoadWorkflowDetail(
                        wf.summary.workflow_id.clone(),
                        Some(wf.summary.run_id.clone()),
                    )]
                } else {
                    vec![]
                }
            }
            View::Collection(KindId::Schedule) => vec![Effect::LoadSchedules],
            View::Detail(KindId::Schedule) => {
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
            View::Collection(KindId::WorkflowExecution) => {
                let workflows = self.workflows.data()?;
                let idx = self.workflow_table_state.selected()?;
                workflows.get(idx)
            }
            View::Detail(KindId::WorkflowExecution) => {
                self.selected_workflow.as_ref().map(|d| &d.summary)
            }
            _ => None,
        }
    }

    fn selected_schedule_summary(&self) -> Option<&Schedule> {
        match self.view {
            View::Collection(KindId::Schedule) => {
                let schedules = self.schedules.data()?;
                let idx = self.schedule_table_state.selected()?;
                schedules.get(idx)
            }
            View::Detail(KindId::Schedule) => self.selected_schedule.as_ref(),
            _ => None,
        }
    }

    fn navigate_up(&mut self) {
        match self.view {
            View::Collection(KindId::WorkflowExecution) => {
                self.workflow_table_state.select_previous();
            }
            View::Collection(KindId::Schedule) => {
                self.schedule_table_state.select_previous();
            }
            _ => {}
        }
    }

    fn navigate_down(&mut self) {
        let len = match self.view {
            View::Collection(KindId::WorkflowExecution) => {
                self.workflows.data().map(|w| w.len()).unwrap_or(0)
            }
            View::Collection(KindId::Schedule) => {
                self.schedules.data().map(|s| s.len()).unwrap_or(0)
            }
            _ => return,
        };

        if len == 0 {
            return;
        }

        match self.view {
            View::Collection(KindId::WorkflowExecution) => {
                self.workflow_table_state.select_next();
            }
            View::Collection(KindId::Schedule) => {
                self.schedule_table_state.select_next();
            }
            _ => {}
        }
    }

    fn navigate_top(&mut self) {
        self.input_mode = InputMode::Normal;
        match self.view {
            View::Collection(KindId::WorkflowExecution) => {
                self.workflow_table_state.select_first();
            }
            View::Collection(KindId::Schedule) => {
                self.schedule_table_state.select_first();
            }
            _ => {}
        }
    }

    fn navigate_bottom(&mut self) {
        match self.view {
            View::Collection(KindId::WorkflowExecution) => {
                self.workflow_table_state.select_last();
            }
            View::Collection(KindId::Schedule) => {
                self.schedule_table_state.select_last();
            }
            _ => {}
        }
    }

    fn is_detail_view(&self) -> bool {
        matches!(self.view, View::Detail(_))
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

    pub fn location(&self) -> Location {
        let segments = match self.view {
            View::Collection(KindId::WorkflowExecution) => {
                vec![RouteSegment::Workflows(WorkflowsRoute::Collection {
                    query: self.search_queries.get(&KindId::WorkflowExecution).cloned(),
                })]
            }
            View::Detail(KindId::WorkflowExecution) => {
                if let Some(ref detail) = self.selected_workflow {
                    vec![RouteSegment::Workflows(WorkflowsRoute::Detail {
                        workflow_id: detail.summary.workflow_id.clone(),
                        run_id: Some(detail.summary.run_id.clone()),
                        tab: None,
                    })]
                } else {
                    vec![RouteSegment::Workflows(WorkflowsRoute::Collection {
                        query: self.search_queries.get(&KindId::WorkflowExecution).cloned(),
                    })]
                }
            }
            View::Collection(KindId::Schedule) => {
                vec![RouteSegment::Schedules(SchedulesRoute::Collection {
                    query: self.search_queries.get(&KindId::Schedule).cloned(),
                })]
            }
            View::Detail(KindId::Schedule) => {
                if let Some(ref schedule) = self.selected_schedule {
                    vec![RouteSegment::Schedules(SchedulesRoute::Detail {
                        schedule_id: schedule.schedule_id.clone(),
                    })]
                } else {
                    vec![RouteSegment::Schedules(SchedulesRoute::Collection {
                        query: self.search_queries.get(&KindId::Schedule).cloned(),
                    })]
                }
            }
        };

        Location::new(self.namespace.clone(), segments)
    }

    fn apply_location(&mut self, location: Location) -> Vec<Effect> {
        let namespace = location.namespace.clone();
        let namespace_changed = self.namespace != namespace;
        if namespace_changed {
            self.namespace = namespace;
            self.workflows = LoadState::NotLoaded;
            self.schedules = LoadState::NotLoaded;
            self.workflow_history = LoadState::NotLoaded;
            self.task_queue_detail = LoadState::NotLoaded;
            self.workflow_table_state = TableState::default();
            self.schedule_table_state = TableState::default();
            self.selected_workflow = None;
            self.selected_schedule = None;
            self.workflow_detail_tab = 0;
            self.detail_scroll = 0;
            self.next_page_token = vec![];
            self.loading_more = false;
            self.search_queries.clear();
        }

        let Some(segment) = location.leaf() else {
            self.last_error = Some(("invalid uri: missing route".to_string(), Instant::now()));
            return vec![];
        };

        match segment {
            RouteSegment::Workflows(route) => match route {
                WorkflowsRoute::Collection { query } => {
                    self.set_kind_query(KindId::WorkflowExecution, query.clone());
                    self.active_tab = ViewType::Workflows;
                    self.view = View::Collection(KindId::WorkflowExecution);
                    vec![Effect::LoadWorkflows, Effect::LoadWorkflowCount]
                }
                WorkflowsRoute::Detail {
                    workflow_id,
                    run_id,
                    tab,
                } => {
                    self.active_tab = ViewType::Workflows;
                    self.view = View::Detail(KindId::WorkflowExecution);
                    self.workflow_detail_tab =
                        tab.as_deref().map(workflow_tab_from_param).unwrap_or(0);
                    self.detail_scroll = 0;
                    self.workflow_history = LoadState::Loading;
                    self.task_queue_detail = LoadState::NotLoaded;
                    vec![
                        Effect::LoadWorkflowDetail(workflow_id.clone(), run_id.clone()),
                        Effect::LoadHistory(workflow_id.clone(), run_id.clone()),
                    ]
                }
                WorkflowsRoute::Activities { workflow_id, .. } => {
                    self.active_tab = ViewType::Workflows;
                    self.view = View::Detail(KindId::WorkflowExecution);
                    self.workflow_detail_tab = 3;
                    self.detail_scroll = 0;
                    self.workflow_history = LoadState::Loading;
                    self.task_queue_detail = LoadState::NotLoaded;
                    vec![
                        Effect::LoadWorkflowDetail(workflow_id.clone(), None),
                        Effect::LoadHistory(workflow_id.clone(), None),
                    ]
                }
            },
            RouteSegment::Schedules(route) => match route {
                SchedulesRoute::Collection { query } => {
                    self.set_kind_query(KindId::Schedule, query.clone());
                    self.active_tab = ViewType::Schedules;
                    self.view = View::Collection(KindId::Schedule);
                    vec![Effect::LoadSchedules]
                }
                SchedulesRoute::Detail { schedule_id } => {
                    self.active_tab = ViewType::Schedules;
                    self.view = View::Detail(KindId::Schedule);
                    self.detail_scroll = 0;
                    vec![Effect::LoadScheduleDetail(schedule_id.clone())]
                }
                SchedulesRoute::Workflows { schedule_id, query } => {
                    let combined = combine_schedule_workflow_query(schedule_id, query.as_deref());
                    self.set_kind_query(KindId::WorkflowExecution, Some(combined));
                    self.active_tab = ViewType::Workflows;
                    self.view = View::Collection(KindId::WorkflowExecution);
                    vec![Effect::LoadWorkflows, Effect::LoadWorkflowCount]
                }
            },
        }
    }

    pub fn search_query_for_kind(&self, kind: KindId) -> Option<String> {
        self.search_queries.get(&kind).cloned()
    }

    fn current_search_query(&self) -> Option<String> {
        self.search_query_for_kind(self.current_kind_id())
    }

    fn current_kind_id(&self) -> KindId {
        match self.view {
            View::Collection(kind) | View::Detail(kind) => kind,
        }
    }

    fn set_kind_query(&mut self, kind: KindId, query: Option<String>) {
        if let Some(query) = query {
            self.search_queries.insert(kind, query);
        } else {
            self.search_queries.remove(&kind);
        }
    }

    fn run_operation(&mut self, op_id: OperationId) -> Vec<Effect> {
        let kind = self.current_kind_id();
        let Some(spec) = operation_spec(kind, op_id) else {
            return vec![];
        };
        let Some(effect_spec) = operation_effect_spec(op_id, kind) else {
            return vec![];
        };

        match kind {
            KindId::WorkflowExecution => {
                let Some(wf) = self.selected_workflow_summary() else {
                    self.last_error = Some(("no workflow selected".to_string(), Instant::now()));
                    return vec![];
                };
                let target = OperationTarget::Workflow {
                    workflow_id: wf.workflow_id.clone(),
                    run_id: Some(wf.run_id.clone()),
                };
                if spec.requires_confirm {
                    self.overlay = Overlay::Confirm(ConfirmAction::Operation(OperationConfirm {
                        kind,
                        op: op_id,
                        target,
                    }));
                    vec![]
                } else {
                    (effect_spec.to_effects)(&target, self)
                }
            }
            KindId::Schedule => {
                let Some(sch) = self.selected_schedule_summary() else {
                    self.last_error = Some(("no schedule selected".to_string(), Instant::now()));
                    return vec![];
                };
                let target = OperationTarget::Schedule {
                    schedule_id: sch.schedule_id.clone(),
                };
                if spec.requires_confirm {
                    self.overlay = Overlay::Confirm(ConfirmAction::Operation(OperationConfirm {
                        kind,
                        op: op_id,
                        target,
                    }));
                    vec![]
                } else {
                    (effect_spec.to_effects)(&target, self)
                }
            }
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

    fn maybe_load_more(&mut self) -> Vec<Effect> {
        if self.view != View::Collection(KindId::WorkflowExecution)
            || self.loading_more
            || self.next_page_token.is_empty()
        {
            return vec![];
        }
        if let Some(workflows) = self.workflows.data() {
            if let Some(selected) = self.workflow_table_state.selected() {
                if selected + 5 >= workflows.len() {
                    self.loading_more = true;
                    return vec![Effect::LoadMoreWorkflows];
                }
            }
        }
        vec![]
    }

    fn page_height(&self) -> usize {
        20 // approximate; could be made dynamic
    }
}

fn workflow_tab_from_param(tab: &str) -> usize {
    match tab.to_lowercase().as_str() {
        "summary" => 0,
        "io" | "input" | "output" | "input-output" | "input_output" => 1,
        "history" => 2,
        "pending" | "pending-activities" | "pending_activities" | "activities" => 3,
        "task-queue" | "task_queue" | "taskqueue" => 4,
        _ => 0,
    }
}

fn combine_schedule_workflow_query(schedule_id: &str, extra: Option<&str>) -> String {
    let base = format!(
        "TemporalScheduledById = '{}'",
        escape_single_quotes(schedule_id)
    );
    let Some(extra) = extra else {
        return base;
    };

    let trimmed = extra.trim();
    if trimmed.is_empty() {
        return base;
    }

    format!("({}) AND ({})", base, trimmed)
}

fn escape_single_quotes(input: &str) -> String {
    input.replace('\'', "\\'")
}

fn format_uri_error(err: UriError) -> &'static str {
    match err {
        UriError::InvalidScheme => "invalid scheme",
        UriError::InvalidAuthority => "invalid authority",
        UriError::MissingNamespace => "missing namespace",
        UriError::InvalidPath => "invalid path",
        UriError::UnsupportedRoute => "unsupported route",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_schedule_workflows_location_sets_query() {
        let mut app = App::new("default".to_string());
        app.selected_schedule = Some(Schedule {
            schedule_id: "nightly".to_string(),
            workflow_type: "SyncWorkflow".to_string(),
            state: ScheduleState::Active,
            spec_description: String::new(),
            next_run: None,
            recent_action_count: 0,
            notes: String::new(),
        });

        let location = Location::new(
            "default".to_string(),
            vec![RouteSegment::Schedules(SchedulesRoute::Workflows {
                schedule_id: "nightly".to_string(),
                query: Some("ExecutionStatus = 'Failed'".to_string()),
            })],
        );

        let effects = app.apply_location(location);

        assert!(matches!(
            app.view,
            View::Collection(KindId::WorkflowExecution)
        ));
        assert!(effects
            .iter()
            .any(|effect| matches!(effect, Effect::LoadWorkflows)));
        assert!(effects
            .iter()
            .any(|effect| matches!(effect, Effect::LoadWorkflowCount)));
        let query = app
            .search_query_for_kind(KindId::WorkflowExecution)
            .expect("query set");
        assert_eq!(
            query,
            "(TemporalScheduledById = 'nightly') AND (ExecutionStatus = 'Failed')"
        );
    }
}
