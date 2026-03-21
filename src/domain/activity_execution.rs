use chrono::{DateTime, Utc};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActivityExecutionStatus {
    Running,
    Completed,
    Failed,
    Canceled,
    Terminated,
    TimedOut,
}

impl ActivityExecutionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Running => "Running",
            Self::Completed => "Completed",
            Self::Failed => "Failed",
            Self::Canceled => "Canceled",
            Self::Terminated => "Terminated",
            Self::TimedOut => "TimedOut",
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
        }
    }
}

#[derive(Debug, Clone)]
pub struct ActivityExecutionSummary {
    pub activity_id: String,
    pub run_id: String,
    pub activity_type: String,
    pub status: ActivityExecutionStatus,
    pub schedule_time: Option<DateTime<Utc>>,
    pub close_time: Option<DateTime<Utc>>,
    pub task_queue: String,
}

#[derive(Debug, Clone)]
pub struct ActivityExecutionDetail {
    pub summary: ActivityExecutionSummary,
    pub attempt: i32,
    pub retry_state: String,
    pub last_heartbeat_time: Option<DateTime<Utc>>,
    pub last_started_time: Option<DateTime<Utc>>,
    pub last_failure_message: Option<String>,
    pub schedule_to_close_timeout: Option<std::time::Duration>,
    pub start_to_close_timeout: Option<std::time::Duration>,
    pub heartbeat_timeout: Option<std::time::Duration>,
    pub input: Option<serde_json::Value>,
    pub output: Option<serde_json::Value>,
    pub failure: Option<serde_json::Value>,
    pub deployment_info: Option<String>,
}
