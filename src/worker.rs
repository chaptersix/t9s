use std::sync::Arc;

use tokio::sync::mpsc;

use crate::action::Action;
use crate::client::TemporalClient;

#[derive(Debug)]
pub enum CliRequest {
    LoadWorkflows {
        namespace: String,
        query: Option<String>,
        page_size: i32,
        next_page_token: Vec<u8>,
    },
    LoadMoreWorkflows {
        namespace: String,
        query: Option<String>,
        page_size: i32,
        next_page_token: Vec<u8>,
    },
    LoadWorkflowDetail {
        namespace: String,
        workflow_id: String,
        run_id: Option<String>,
    },
    LoadHistory {
        namespace: String,
        workflow_id: String,
        run_id: Option<String>,
    },
    LoadNamespaces,
    LoadWorkflowCount {
        namespace: String,
        query: Option<String>,
    },
    LoadSchedules {
        namespace: String,
        query: Option<String>,
    },
    LoadScheduleDetail {
        namespace: String,
        schedule_id: String,
    },
    CancelWorkflow {
        namespace: String,
        workflow_id: String,
        run_id: Option<String>,
    },
    TerminateWorkflow {
        namespace: String,
        workflow_id: String,
        run_id: Option<String>,
    },
    PauseSchedule {
        namespace: String,
        schedule_id: String,
        pause: bool,
    },
    TriggerSchedule {
        namespace: String,
        schedule_id: String,
    },
    DeleteSchedule {
        namespace: String,
        schedule_id: String,
    },
    DescribeTaskQueue {
        namespace: String,
        task_queue: String,
    },
    SignalWorkflow {
        namespace: String,
        workflow_id: String,
        run_id: Option<String>,
        signal_name: String,
        input: Option<String>,
    },
    LoadActivityExecutions {
        namespace: String,
        query: Option<String>,
        page_size: i32,
        next_page_token: Vec<u8>,
    },
    LoadMoreActivityExecutions {
        namespace: String,
        query: Option<String>,
        page_size: i32,
        next_page_token: Vec<u8>,
    },
    DescribeActivityExecution {
        namespace: String,
        activity_id: String,
        run_id: String,
    },
    CountActivityExecutions {
        namespace: String,
        query: Option<String>,
    },
    RequestCancelActivityExecution {
        namespace: String,
        activity_id: String,
        run_id: String,
    },
    TerminateActivityExecution {
        namespace: String,
        activity_id: String,
        run_id: String,
        reason: String,
    },
    DeleteActivityExecution {
        namespace: String,
        activity_id: String,
        run_id: String,
    },
    CheckActivitySupport {
        namespace: String,
    },
}

#[derive(Clone)]
pub struct CliHandle {
    tx: mpsc::UnboundedSender<CliRequest>,
}

impl CliHandle {
    pub fn send(&self, request: CliRequest) {
        let _ = self.tx.send(request);
    }
}

pub struct CliWorker {
    client: Arc<dyn TemporalClient>,
    rx: mpsc::UnboundedReceiver<CliRequest>,
    action_tx: mpsc::UnboundedSender<Action>,
}

impl CliWorker {
    pub fn new(
        client: Arc<dyn TemporalClient>,
        action_tx: mpsc::UnboundedSender<Action>,
    ) -> (Self, CliHandle) {
        let (tx, rx) = mpsc::unbounded_channel();
        let handle = CliHandle { tx };
        let worker = Self {
            client,
            rx,
            action_tx,
        };
        (worker, handle)
    }

    pub async fn run(mut self) {
        while let Some(request) = self.rx.recv().await {
            let action = self.process(request).await;
            if self.action_tx.send(action).is_err() {
                break;
            }
        }
    }

    async fn process(&self, request: CliRequest) -> Action {
        match request {
            CliRequest::LoadWorkflows {
                namespace,
                query,
                page_size,
                next_page_token,
            } => {
                match self
                    .client
                    .list_workflows(&namespace, query.as_deref(), page_size, next_page_token)
                    .await
                {
                    Ok((workflows, token)) => Action::WorkflowsLoaded(workflows, token),
                    Err(e) => Action::Error(format!("failed to load workflows: {}", e)),
                }
            }
            CliRequest::LoadMoreWorkflows {
                namespace,
                query,
                page_size,
                next_page_token,
            } => {
                match self
                    .client
                    .list_workflows(&namespace, query.as_deref(), page_size, next_page_token)
                    .await
                {
                    Ok((workflows, token)) => Action::MoreWorkflowsLoaded(workflows, token),
                    Err(e) => Action::Error(format!("failed to load workflows: {}", e)),
                }
            }
            CliRequest::LoadWorkflowDetail {
                namespace,
                workflow_id,
                run_id,
            } => {
                match self
                    .client
                    .describe_workflow(&namespace, &workflow_id, run_id.as_deref())
                    .await
                {
                    Ok(detail) => Action::WorkflowDetailLoaded(Box::new(detail)),
                    Err(e) => Action::Error(format!("failed to load workflow detail: {}", e)),
                }
            }
            CliRequest::LoadHistory {
                namespace,
                workflow_id,
                run_id,
            } => {
                match self
                    .client
                    .get_history(&namespace, &workflow_id, run_id.as_deref())
                    .await
                {
                    Ok(events) => Action::HistoryLoaded(events),
                    Err(e) => Action::Error(format!("failed to load history: {}", e)),
                }
            }
            CliRequest::LoadNamespaces => match self.client.list_namespaces().await {
                Ok(namespaces) => Action::NamespacesLoaded(namespaces),
                Err(e) => Action::Error(format!("failed to load namespaces: {}", e)),
            },
            CliRequest::LoadWorkflowCount { namespace, query } => {
                match self
                    .client
                    .count_workflows(&namespace, query.as_deref())
                    .await
                {
                    Ok(count) => Action::WorkflowCountLoaded(count),
                    Err(e) => Action::Error(format!("failed to count workflows: {}", e)),
                }
            }
            CliRequest::LoadSchedules { namespace, query } => {
                match self
                    .client
                    .list_schedules(&namespace, query.as_deref())
                    .await
                {
                    Ok(schedules) => Action::SchedulesLoaded(schedules),
                    Err(e) => Action::Error(format!("failed to load schedules: {}", e)),
                }
            }
            CliRequest::LoadScheduleDetail {
                namespace,
                schedule_id,
            } => {
                match self
                    .client
                    .describe_schedule(&namespace, &schedule_id)
                    .await
                {
                    Ok(schedule) => Action::ScheduleDetailLoaded(Box::new(schedule)),
                    Err(e) => Action::Error(format!("failed to load schedule detail: {}", e)),
                }
            }
            CliRequest::CancelWorkflow {
                namespace,
                workflow_id,
                run_id,
            } => {
                match self
                    .client
                    .cancel_workflow(&namespace, &workflow_id, run_id.as_deref())
                    .await
                {
                    Ok(()) => Action::Refresh,
                    Err(e) => Action::Error(format!("failed to cancel workflow: {}", e)),
                }
            }
            CliRequest::TerminateWorkflow {
                namespace,
                workflow_id,
                run_id,
            } => {
                match self
                    .client
                    .terminate_workflow(
                        &namespace,
                        &workflow_id,
                        run_id.as_deref(),
                        "terminated via t9s",
                    )
                    .await
                {
                    Ok(()) => Action::Refresh,
                    Err(e) => Action::Error(format!("failed to terminate workflow: {}", e)),
                }
            }
            CliRequest::PauseSchedule {
                namespace,
                schedule_id,
                pause,
            } => {
                match self
                    .client
                    .patch_schedule(&namespace, &schedule_id, pause)
                    .await
                {
                    Ok(()) => Action::Refresh,
                    Err(e) => Action::Error(format!("failed to update schedule: {}", e)),
                }
            }
            CliRequest::TriggerSchedule {
                namespace,
                schedule_id,
            } => match self.client.trigger_schedule(&namespace, &schedule_id).await {
                Ok(()) => Action::Refresh,
                Err(e) => Action::Error(format!("failed to trigger schedule: {}", e)),
            },
            CliRequest::DeleteSchedule {
                namespace,
                schedule_id,
            } => match self.client.delete_schedule(&namespace, &schedule_id).await {
                Ok(()) => Action::Refresh,
                Err(e) => Action::Error(format!("failed to delete schedule: {}", e)),
            },
            CliRequest::DescribeTaskQueue {
                namespace,
                task_queue,
            } => {
                match self
                    .client
                    .describe_task_queue(&namespace, &task_queue)
                    .await
                {
                    Ok(tq) => Action::TaskQueueDetailLoaded(Box::new(tq)),
                    Err(e) => Action::Error(format!("failed to describe task queue: {}", e)),
                }
            }
            CliRequest::LoadActivityExecutions {
                namespace,
                query,
                page_size,
                next_page_token,
            } => {
                match self
                    .client
                    .list_activity_executions(
                        &namespace,
                        query.as_deref(),
                        page_size,
                        next_page_token,
                    )
                    .await
                {
                    Ok((activities, token)) => Action::ActivityExecutionsLoaded(activities, token),
                    Err(e) => Action::Error(format!("failed to load activities: {}", e)),
                }
            }
            CliRequest::LoadMoreActivityExecutions {
                namespace,
                query,
                page_size,
                next_page_token,
            } => {
                match self
                    .client
                    .list_activity_executions(
                        &namespace,
                        query.as_deref(),
                        page_size,
                        next_page_token,
                    )
                    .await
                {
                    Ok((activities, token)) => {
                        Action::MoreActivityExecutionsLoaded(activities, token)
                    }
                    Err(e) => Action::Error(format!("failed to load more activities: {}", e)),
                }
            }
            CliRequest::DescribeActivityExecution {
                namespace,
                activity_id,
                run_id,
            } => {
                match self
                    .client
                    .describe_activity_execution(&namespace, &activity_id, &run_id)
                    .await
                {
                    Ok(detail) => Action::ActivityExecutionDetailLoaded(Box::new(detail)),
                    Err(e) => Action::Error(format!("failed to load activity detail: {}", e)),
                }
            }
            CliRequest::CountActivityExecutions { namespace, query } => {
                match self
                    .client
                    .count_activity_executions(&namespace, query.as_deref())
                    .await
                {
                    Ok(count) => Action::ActivityExecutionCountLoaded(count),
                    Err(e) => Action::Error(format!("failed to count activities: {}", e)),
                }
            }
            CliRequest::RequestCancelActivityExecution {
                namespace,
                activity_id,
                run_id,
            } => {
                match self
                    .client
                    .request_cancel_activity_execution(&namespace, &activity_id, &run_id)
                    .await
                {
                    Ok(()) => Action::Refresh,
                    Err(e) => Action::Error(format!("failed to cancel activity: {}", e)),
                }
            }
            CliRequest::TerminateActivityExecution {
                namespace,
                activity_id,
                run_id,
                reason,
            } => {
                match self
                    .client
                    .terminate_activity_execution(&namespace, &activity_id, &run_id, &reason)
                    .await
                {
                    Ok(()) => Action::Refresh,
                    Err(e) => Action::Error(format!("failed to terminate activity: {}", e)),
                }
            }
            CliRequest::DeleteActivityExecution {
                namespace,
                activity_id,
                run_id,
            } => {
                match self
                    .client
                    .delete_activity_execution(&namespace, &activity_id, &run_id)
                    .await
                {
                    Ok(()) => Action::Refresh,
                    Err(e) => Action::Error(format!("failed to delete activity: {}", e)),
                }
            }
            CliRequest::CheckActivitySupport { namespace } => {
                match self.client.check_activity_support(&namespace).await {
                    Ok(supported) => Action::ActivitiesSupported(supported),
                    Err(e) => Action::Error(format!("failed to check activity support: {}", e)),
                }
            }
            CliRequest::SignalWorkflow {
                namespace,
                workflow_id,
                run_id,
                signal_name,
                input,
            } => {
                match self
                    .client
                    .signal_workflow(
                        &namespace,
                        &workflow_id,
                        run_id.as_deref(),
                        &signal_name,
                        input.as_deref(),
                    )
                    .await
                {
                    Ok(()) => Action::Refresh,
                    Err(e) => Action::Error(format!("failed to signal workflow: {}", e)),
                }
            }
        }
    }
}
