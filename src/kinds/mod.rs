#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum KindId {
    WorkflowExecution,
    Schedule,
    ActivityExecution,
}

impl KindId {
    pub fn label(&self) -> &'static str {
        match self {
            Self::WorkflowExecution => "Workflows",
            Self::Schedule => "Schedules",
            Self::ActivityExecution => "Activities",
        }
    }
}

#[derive(Debug, Clone)]
pub struct KindSpec {
    pub id: KindId,
    pub label: &'static str,
    pub collection: &'static CollectionSpec,
    pub detail: Option<&'static DetailSpec>,
    pub operations: &'static [OperationSpec],
}

#[derive(Debug, Clone, Copy)]
pub struct CollectionSpec {
    pub header: &'static [&'static str],
    pub widths: fn() -> Vec<ratatui::layout::Constraint>,
    pub rows: fn(&crate::app::App) -> Option<Vec<ratatui::widgets::Row<'static>>>,
    pub is_loading: fn(&crate::app::App) -> bool,
    pub loading_label: &'static str,
    pub empty_label: &'static str,
    pub table_state: fn(&mut crate::app::App) -> &mut ratatui::widgets::TableState,
}

#[derive(Debug, Clone, Copy)]
pub struct DetailSpec {
    pub render: fn(&crate::app::App, &mut ratatui::Frame, ratatui::layout::Rect),
}

pub struct OperationEffectSpec {
    pub op: OperationId,
    pub kind: KindId,
    pub to_effects: fn(&crate::app::OperationTarget, &crate::app::App) -> Vec<crate::app::Effect>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OperationId {
    CancelWorkflow,
    TerminateWorkflow,
    PauseSchedule,
    TriggerSchedule,
    DeleteSchedule,
    CancelActivityExecution,
    TerminateActivityExecution,
    DeleteActivityExecution,
}

#[derive(Debug, Clone, Copy)]
pub struct OperationSpec {
    pub id: OperationId,
    pub label: &'static str,
    pub key: char,
    pub requires_confirm: bool,
}

static KIND_SPECS: &[KindSpec] = &[
    KindSpec {
        id: KindId::WorkflowExecution,
        label: "Workflows",
        collection: &WORKFLOW_COLLECTION,
        detail: Some(&WORKFLOW_DETAIL),
        operations: WORKFLOW_OPS,
    },
    KindSpec {
        id: KindId::Schedule,
        label: "Schedules",
        collection: &SCHEDULE_COLLECTION,
        detail: Some(&SCHEDULE_DETAIL),
        operations: SCHEDULE_OPS,
    },
    KindSpec {
        id: KindId::ActivityExecution,
        label: "Activities",
        collection: &ACTIVITY_COLLECTION,
        detail: Some(&ACTIVITY_DETAIL),
        operations: ACTIVITY_OPS,
    },
];

pub fn registry() -> &'static [KindSpec] {
    KIND_SPECS
}

pub fn kind_spec(kind: KindId) -> &'static KindSpec {
    KIND_SPECS
        .iter()
        .find(|spec| spec.id == kind)
        .expect("KindSpec missing")
}

pub fn collection_spec(kind: KindId) -> &'static CollectionSpec {
    kind_spec(kind).collection
}

pub fn detail_spec(kind: KindId) -> Option<&'static DetailSpec> {
    kind_spec(kind).detail
}

pub fn operation_effect_spec(
    op: OperationId,
    kind: KindId,
) -> Option<&'static OperationEffectSpec> {
    OPERATION_EFFECTS
        .iter()
        .find(|spec| spec.op == op && spec.kind == kind)
}

pub fn operation_for_key(kind: KindId, key: char) -> Option<OperationId> {
    kind_spec(kind)
        .operations
        .iter()
        .find(|op| op.key == key)
        .map(|op| op.id)
}

pub fn operation_spec(kind: KindId, op_id: OperationId) -> Option<&'static OperationSpec> {
    kind_spec(kind).operations.iter().find(|op| op.id == op_id)
}

pub fn detail_tabs_for_kind(kind: KindId) -> Option<&'static [&'static str]> {
    match kind {
        KindId::WorkflowExecution => Some(WORKFLOW_DETAIL_TABS),
        KindId::Schedule => None,
        KindId::ActivityExecution => Some(ACTIVITY_DETAIL_TABS),
    }
}

pub fn detail_tab_count(kind: KindId) -> usize {
    detail_tabs_for_kind(kind)
        .map(|tabs| tabs.len())
        .unwrap_or(0)
}

static WORKFLOW_OPS: &[OperationSpec] = &[
    OperationSpec {
        id: OperationId::CancelWorkflow,
        label: "Cancel workflow",
        key: 'c',
        requires_confirm: true,
    },
    OperationSpec {
        id: OperationId::TerminateWorkflow,
        label: "Terminate workflow",
        key: 't',
        requires_confirm: true,
    },
];

static SCHEDULE_OPS: &[OperationSpec] = &[
    OperationSpec {
        id: OperationId::PauseSchedule,
        label: "Pause/unpause schedule",
        key: 'p',
        requires_confirm: false,
    },
    OperationSpec {
        id: OperationId::TriggerSchedule,
        label: "Trigger schedule",
        key: 'T',
        requires_confirm: true,
    },
    OperationSpec {
        id: OperationId::DeleteSchedule,
        label: "Delete schedule",
        key: 'd',
        requires_confirm: true,
    },
];

static ACTIVITY_OPS: &[OperationSpec] = &[
    OperationSpec {
        id: OperationId::CancelActivityExecution,
        label: "Cancel activity",
        key: 'c',
        requires_confirm: true,
    },
    OperationSpec {
        id: OperationId::TerminateActivityExecution,
        label: "Terminate activity",
        key: 't',
        requires_confirm: true,
    },
    OperationSpec {
        id: OperationId::DeleteActivityExecution,
        label: "Delete activity",
        key: 'd',
        requires_confirm: true,
    },
];

static WORKFLOW_DETAIL_TABS: &[&str] = &[
    "Summary",
    "Input/Output",
    "History",
    "Pending Activities",
    "Task Queue",
];

static ACTIVITY_DETAIL_TABS: &[&str] = &["Summary", "Input/Output", "Task Queue"];

static OPERATION_EFFECTS: &[OperationEffectSpec] = &[
    OperationEffectSpec {
        op: OperationId::CancelWorkflow,
        kind: KindId::WorkflowExecution,
        to_effects: workflow_cancel_effects,
    },
    OperationEffectSpec {
        op: OperationId::TerminateWorkflow,
        kind: KindId::WorkflowExecution,
        to_effects: workflow_terminate_effects,
    },
    OperationEffectSpec {
        op: OperationId::TriggerSchedule,
        kind: KindId::Schedule,
        to_effects: schedule_trigger_effects,
    },
    OperationEffectSpec {
        op: OperationId::DeleteSchedule,
        kind: KindId::Schedule,
        to_effects: schedule_delete_effects,
    },
    OperationEffectSpec {
        op: OperationId::PauseSchedule,
        kind: KindId::Schedule,
        to_effects: schedule_pause_effects,
    },
    OperationEffectSpec {
        op: OperationId::CancelActivityExecution,
        kind: KindId::ActivityExecution,
        to_effects: activity_cancel_effects,
    },
    OperationEffectSpec {
        op: OperationId::TerminateActivityExecution,
        kind: KindId::ActivityExecution,
        to_effects: activity_terminate_effects,
    },
    OperationEffectSpec {
        op: OperationId::DeleteActivityExecution,
        kind: KindId::ActivityExecution,
        to_effects: activity_delete_effects,
    },
];

static WORKFLOW_DETAIL: DetailSpec = DetailSpec {
    render: crate::widgets::workflow_detail::render,
};

static SCHEDULE_DETAIL: DetailSpec = DetailSpec {
    render: crate::widgets::schedule_detail::render,
};

static ACTIVITY_DETAIL: DetailSpec = DetailSpec {
    render: crate::widgets::activity_execution_detail::render,
};

static WORKFLOW_COLLECTION: CollectionSpec = CollectionSpec {
    header: &[" Status", "Workflow ID", "Type", "Started", "Task Queue"],
    widths: workflow_widths,
    rows: workflow_rows,
    is_loading: workflow_is_loading,
    loading_label: " Loading workflows...",
    empty_label: " No workflows loaded",
    table_state: workflow_table_state,
};

static SCHEDULE_COLLECTION: CollectionSpec = CollectionSpec {
    header: &[
        " State",
        "Schedule ID",
        "Workflow Type",
        "Next Run",
        "Actions",
    ],
    widths: schedule_widths,
    rows: schedule_rows,
    is_loading: schedule_is_loading,
    loading_label: " Loading schedules...",
    empty_label: " No schedules loaded",
    table_state: schedule_table_state,
};

static ACTIVITY_COLLECTION: CollectionSpec = CollectionSpec {
    header: &[
        " Status",
        "Activity ID",
        "Type",
        "Scheduled",
        "Close Time",
        "Task Queue",
    ],
    widths: activity_widths,
    rows: activity_rows,
    is_loading: activity_is_loading,
    loading_label: " Loading activities...",
    empty_label: " No activities loaded",
    table_state: activity_table_state,
};

fn workflow_rows(app: &crate::app::App) -> Option<Vec<ratatui::widgets::Row<'static>>> {
    let workflows = app.workflows.data()?;
    Some(
        workflows
            .iter()
            .map(|wf| {
                let status_style = workflow_status_color(&wf.status);
                ratatui::widgets::Row::new(vec![
                    ratatui::widgets::Cell::from(format!(
                        " {} {}",
                        wf.status.symbol(),
                        wf.status.as_str()
                    ))
                    .style(status_style),
                    ratatui::widgets::Cell::from(wf.workflow_id.clone()),
                    ratatui::widgets::Cell::from(wf.workflow_type.clone()),
                    ratatui::widgets::Cell::from(format_time(&wf.start_time)),
                    ratatui::widgets::Cell::from(wf.task_queue.clone()),
                ])
            })
            .collect(),
    )
}

fn schedule_rows(app: &crate::app::App) -> Option<Vec<ratatui::widgets::Row<'static>>> {
    let schedules = app.schedules.data()?;
    Some(
        schedules
            .iter()
            .map(|sch| {
                let state_style = match sch.state {
                    crate::domain::ScheduleState::Active => {
                        ratatui::style::Style::default().fg(crate::theme::GREEN)
                    }
                    crate::domain::ScheduleState::Paused => {
                        ratatui::style::Style::default().fg(crate::theme::YELLOW)
                    }
                };
                ratatui::widgets::Row::new(vec![
                    ratatui::widgets::Cell::from(format!(" {}", sch.state.as_str()))
                        .style(state_style),
                    ratatui::widgets::Cell::from(sch.schedule_id.clone()),
                    ratatui::widgets::Cell::from(sch.workflow_type.clone()),
                    ratatui::widgets::Cell::from(
                        sch.next_run
                            .map(|t| {
                                let local = t.with_timezone(&chrono::Local);
                                local.format("%Y-%m-%d %H:%M:%S").to_string()
                            })
                            .unwrap_or_else(|| "-".to_string()),
                    ),
                    ratatui::widgets::Cell::from(sch.recent_action_count.to_string()),
                ])
            })
            .collect(),
    )
}

fn activity_rows(app: &crate::app::App) -> Option<Vec<ratatui::widgets::Row<'static>>> {
    let activities = app.activity_executions.data()?;
    Some(
        activities
            .iter()
            .map(|act| {
                let status_style = activity_status_color(&act.status);
                ratatui::widgets::Row::new(vec![
                    ratatui::widgets::Cell::from(format!(
                        " {} {}",
                        act.status.symbol(),
                        act.status.as_str()
                    ))
                    .style(status_style),
                    ratatui::widgets::Cell::from(act.activity_id.clone()),
                    ratatui::widgets::Cell::from(act.activity_type.clone()),
                    ratatui::widgets::Cell::from(
                        act.schedule_time
                            .as_ref()
                            .map(format_time)
                            .unwrap_or_else(|| "-".to_string()),
                    ),
                    ratatui::widgets::Cell::from(
                        act.close_time
                            .as_ref()
                            .map(format_time)
                            .unwrap_or_else(|| "-".to_string()),
                    ),
                    ratatui::widgets::Cell::from(act.task_queue.clone()),
                ])
            })
            .collect(),
    )
}

fn workflow_is_loading(app: &crate::app::App) -> bool {
    app.workflows.is_loading()
}

fn schedule_is_loading(app: &crate::app::App) -> bool {
    app.schedules.is_loading()
}

fn activity_is_loading(app: &crate::app::App) -> bool {
    app.activity_executions.is_loading()
}

fn workflow_table_state(app: &mut crate::app::App) -> &mut ratatui::widgets::TableState {
    &mut app.workflow_table_state
}

fn schedule_table_state(app: &mut crate::app::App) -> &mut ratatui::widgets::TableState {
    &mut app.schedule_table_state
}

fn activity_table_state(app: &mut crate::app::App) -> &mut ratatui::widgets::TableState {
    &mut app.activity_execution_table_state
}

fn workflow_widths() -> Vec<ratatui::layout::Constraint> {
    vec![
        ratatui::layout::Constraint::Length(18),
        ratatui::layout::Constraint::Percentage(30),
        ratatui::layout::Constraint::Percentage(20),
        ratatui::layout::Constraint::Length(20),
        ratatui::layout::Constraint::Percentage(20),
    ]
}

fn schedule_widths() -> Vec<ratatui::layout::Constraint> {
    vec![
        ratatui::layout::Constraint::Length(12),
        ratatui::layout::Constraint::Percentage(30),
        ratatui::layout::Constraint::Percentage(25),
        ratatui::layout::Constraint::Length(20),
        ratatui::layout::Constraint::Length(10),
    ]
}

fn activity_widths() -> Vec<ratatui::layout::Constraint> {
    vec![
        ratatui::layout::Constraint::Length(16),
        ratatui::layout::Constraint::Percentage(28),
        ratatui::layout::Constraint::Percentage(20),
        ratatui::layout::Constraint::Length(20),
        ratatui::layout::Constraint::Length(20),
        ratatui::layout::Constraint::Percentage(24),
    ]
}

fn workflow_status_color(status: &crate::domain::WorkflowStatus) -> ratatui::style::Style {
    match status {
        crate::domain::WorkflowStatus::Running => {
            ratatui::style::Style::default().fg(crate::theme::GREEN)
        }
        crate::domain::WorkflowStatus::Completed => {
            ratatui::style::Style::default().fg(crate::theme::BLUE)
        }
        crate::domain::WorkflowStatus::Failed => {
            ratatui::style::Style::default().fg(crate::theme::RED)
        }
        crate::domain::WorkflowStatus::Canceled => {
            ratatui::style::Style::default().fg(crate::theme::YELLOW)
        }
        crate::domain::WorkflowStatus::Terminated => {
            ratatui::style::Style::default().fg(crate::theme::MAGENTA)
        }
        crate::domain::WorkflowStatus::TimedOut => {
            ratatui::style::Style::default().fg(crate::theme::RED)
        }
        crate::domain::WorkflowStatus::ContinuedAsNew => {
            ratatui::style::Style::default().fg(crate::theme::CYAN)
        }
    }
}

fn activity_status_color(status: &crate::domain::ActivityExecutionStatus) -> ratatui::style::Style {
    match status {
        crate::domain::ActivityExecutionStatus::Running => {
            ratatui::style::Style::default().fg(crate::theme::GREEN)
        }
        crate::domain::ActivityExecutionStatus::Completed => {
            ratatui::style::Style::default().fg(crate::theme::BLUE)
        }
        crate::domain::ActivityExecutionStatus::Failed => {
            ratatui::style::Style::default().fg(crate::theme::RED)
        }
        crate::domain::ActivityExecutionStatus::Canceled => {
            ratatui::style::Style::default().fg(crate::theme::YELLOW)
        }
        crate::domain::ActivityExecutionStatus::Terminated => {
            ratatui::style::Style::default().fg(crate::theme::MAGENTA)
        }
        crate::domain::ActivityExecutionStatus::TimedOut => {
            ratatui::style::Style::default().fg(crate::theme::RED)
        }
    }
}

fn format_time(dt: &chrono::DateTime<chrono::Utc>) -> String {
    let local = dt.with_timezone(&chrono::Local);
    local.format("%Y-%m-%d %H:%M:%S").to_string()
}

fn workflow_cancel_effects(
    target: &crate::app::OperationTarget,
    _app: &crate::app::App,
) -> Vec<crate::app::Effect> {
    match target {
        crate::app::OperationTarget::Workflow {
            workflow_id,
            run_id,
        } => vec![crate::app::Effect::CancelWorkflow(
            workflow_id.clone(),
            run_id.clone(),
        )],
        _ => vec![],
    }
}

fn workflow_terminate_effects(
    target: &crate::app::OperationTarget,
    _app: &crate::app::App,
) -> Vec<crate::app::Effect> {
    match target {
        crate::app::OperationTarget::Workflow {
            workflow_id,
            run_id,
        } => vec![crate::app::Effect::TerminateWorkflow(
            workflow_id.clone(),
            run_id.clone(),
        )],
        _ => vec![],
    }
}

fn schedule_trigger_effects(
    target: &crate::app::OperationTarget,
    _app: &crate::app::App,
) -> Vec<crate::app::Effect> {
    match target {
        crate::app::OperationTarget::Schedule { schedule_id } => {
            vec![crate::app::Effect::TriggerSchedule(schedule_id.clone())]
        }
        _ => vec![],
    }
}

fn schedule_delete_effects(
    target: &crate::app::OperationTarget,
    _app: &crate::app::App,
) -> Vec<crate::app::Effect> {
    match target {
        crate::app::OperationTarget::Schedule { schedule_id } => {
            vec![crate::app::Effect::DeleteSchedule(schedule_id.clone())]
        }
        _ => vec![],
    }
}

fn schedule_pause_effects(
    target: &crate::app::OperationTarget,
    app: &crate::app::App,
) -> Vec<crate::app::Effect> {
    let crate::app::OperationTarget::Schedule { schedule_id } = target else {
        return vec![];
    };
    let Some(schedule) = app.selected_schedule.as_ref() else {
        return vec![];
    };
    if schedule.schedule_id != *schedule_id {
        return vec![];
    }
    let pause = schedule.state != crate::domain::ScheduleState::Paused;
    vec![crate::app::Effect::PauseSchedule(
        schedule_id.clone(),
        pause,
    )]
}

fn activity_cancel_effects(
    target: &crate::app::OperationTarget,
    _app: &crate::app::App,
) -> Vec<crate::app::Effect> {
    match target {
        crate::app::OperationTarget::ActivityExecution {
            activity_id,
            run_id,
        } => vec![crate::app::Effect::RequestCancelActivityExecution(
            activity_id.clone(),
            run_id.clone(),
        )],
        _ => vec![],
    }
}

fn activity_terminate_effects(
    target: &crate::app::OperationTarget,
    _app: &crate::app::App,
) -> Vec<crate::app::Effect> {
    match target {
        crate::app::OperationTarget::ActivityExecution {
            activity_id,
            run_id,
        } => vec![crate::app::Effect::TerminateActivityExecution(
            activity_id.clone(),
            run_id.clone(),
        )],
        _ => vec![],
    }
}

fn activity_delete_effects(
    target: &crate::app::OperationTarget,
    _app: &crate::app::App,
) -> Vec<crate::app::Effect> {
    match target {
        crate::app::OperationTarget::ActivityExecution {
            activity_id,
            run_id,
        } => vec![crate::app::Effect::DeleteActivityExecution(
            activity_id.clone(),
            run_id.clone(),
        )],
        _ => vec![],
    }
}
