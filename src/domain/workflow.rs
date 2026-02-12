use chrono::{DateTime, Utc};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkflowStatus {
    Running,
    Completed,
    Failed,
    Canceled,
    Terminated,
    TimedOut,
    ContinuedAsNew,
}

impl WorkflowStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Running => "Running",
            Self::Completed => "Completed",
            Self::Failed => "Failed",
            Self::Canceled => "Canceled",
            Self::Terminated => "Terminated",
            Self::TimedOut => "TimedOut",
            Self::ContinuedAsNew => "ContinuedAsNew",
        }
    }

    pub fn symbol(&self) -> &'static str {
        match self {
            Self::Running => "●",
            Self::Completed => "✓",
            Self::Failed => "✗",
            Self::Canceled => "⊘",
            Self::Terminated => "⊗",
            Self::TimedOut => "⏱",
            Self::ContinuedAsNew => "↻",
        }
    }
}

impl std::fmt::Display for WorkflowStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[derive(Debug, Clone)]
pub struct WorkflowSummary {
    pub workflow_id: String,
    pub run_id: String,
    pub workflow_type: String,
    pub status: WorkflowStatus,
    pub start_time: DateTime<Utc>,
    pub close_time: Option<DateTime<Utc>>,
    pub task_queue: String,
}

#[derive(Debug, Clone)]
pub struct FailureInfo {
    pub message: String,
    pub failure_type: String,
    pub stack_trace: Option<String>,
    pub cause: Option<Box<FailureInfo>>,
}

#[derive(Debug, Clone)]
pub struct WorkflowDetail {
    pub summary: WorkflowSummary,
    pub input: Option<serde_json::Value>,
    pub output: Option<serde_json::Value>,
    pub failure: Option<FailureInfo>,
    pub history_length: u64,
    pub memo: HashMap<String, serde_json::Value>,
    pub search_attributes: HashMap<String, serde_json::Value>,
    pub pending_activities: Vec<super::PendingActivity>,
}
