use crate::domain::*;
use crate::kinds::OperationId;

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

    // Operations
    RunOperation(OperationId),

    // UI
    OpenCommandInput,
    OpenSearch,
    CloseOverlay,
    SubmitCommandInput(String),
    SubmitSearch(String),
    UpdateInputBuffer(String),
    ToggleHelp,
    SwitchNamespace(String),

    // Tab navigation (for detail views)
    NextTab,
    PrevTab,

    // Nested navigation
    OpenScheduleWorkflows,
    OpenWorkflowActivities,

    // Data responses
    WorkflowsLoaded(Vec<WorkflowSummary>, Vec<u8>),
    MoreWorkflowsLoaded(Vec<WorkflowSummary>, Vec<u8>),
    WorkflowDetailLoaded(Box<WorkflowDetail>),
    HistoryLoaded(Vec<HistoryEvent>),
    NamespacesLoaded(Vec<Namespace>),
    SchedulesLoaded(Vec<Schedule>),
    ScheduleDetailLoaded(Box<Schedule>),
    WorkflowCountLoaded(u64),
    TaskQueueDetailLoaded(Box<TaskQueueInfo>),
    ActivityExecutionsLoaded(Vec<ActivityExecutionSummary>, Vec<u8>),
    MoreActivityExecutionsLoaded(Vec<ActivityExecutionSummary>, Vec<u8>),
    ActivityExecutionDetailLoaded(Box<ActivityExecutionDetail>),
    ActivityExecutionCountLoaded(u64),
    ActivitiesSupported(bool),

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
    Activities,
    TaskQueues,
}

impl ViewType {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Workflows => "Workflows",
            Self::Schedules => "Schedules",
            Self::Activities => "Activities",
            Self::TaskQueues => "Task Queues",
        }
    }
}
