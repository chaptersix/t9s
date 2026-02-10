use chrono::{DateTime, Utc};

#[derive(Debug, Clone)]
pub struct PendingActivity {
    pub activity_id: String,
    pub activity_type: String,
    pub state: PendingActivityState,
    pub attempt: i32,
    pub scheduled_time: Option<DateTime<Utc>>,
    pub last_started_time: Option<DateTime<Utc>>,
    pub last_heartbeat_time: Option<DateTime<Utc>>,
    pub last_failure_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PendingActivityState {
    Scheduled,
    Started,
    CancelRequested,
}

impl PendingActivityState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Scheduled => "Scheduled",
            Self::Started => "Started",
            Self::CancelRequested => "CancelRequested",
        }
    }
}

impl std::fmt::Display for PendingActivityState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
