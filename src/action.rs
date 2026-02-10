use crate::domain::*;

#[derive(Debug, Clone)]
pub enum Action {
    // Navigation
    NavigateUp,
    NavigateDown,
    NavigateTop,
    NavigateBottom,
    PageUp,
    PageDown,
    Select,
    Back,

    // View switching
    SwitchView(ViewType),

    // Vim chord
    EnterPendingG,

    // Workflow actions
    CancelWorkflow,
    TerminateWorkflow,

    // Schedule actions
    PauseSchedule,
    TriggerSchedule,
    DeleteSchedule,

    // UI
    OpenCommandInput,
    OpenSearch,
    CloseOverlay,
    SubmitCommandInput(String),
    UpdateInputBuffer(String),
    ToggleHelp,
    SwitchNamespace(String),

    // Tab navigation (for detail views)
    NextTab,
    PrevTab,

    // Data responses
    WorkflowsLoaded(Vec<WorkflowSummary>, Vec<u8>),
    WorkflowDetailLoaded(Box<WorkflowDetail>),
    HistoryLoaded(Vec<HistoryEvent>),
    NamespacesLoaded(Vec<Namespace>),
    SchedulesLoaded(Vec<Schedule>),
    ScheduleDetailLoaded(Box<Schedule>),
    WorkflowCountLoaded(u64),
    TaskQueueDetailLoaded(Box<TaskQueueInfo>),

    // App control
    Refresh,
    Quit,
    Tick,
    Error(String),
    ClearError,
    TogglePolling,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ViewType {
    Workflows,
    Schedules,
    TaskQueues,
}

impl ViewType {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Workflows => "Workflows",
            Self::Schedules => "Schedules",
            Self::TaskQueues => "Task Queues",
        }
    }
}
