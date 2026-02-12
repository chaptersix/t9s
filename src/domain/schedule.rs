use chrono::{DateTime, Utc};

#[derive(Debug, Clone)]
pub struct Schedule {
    pub schedule_id: String,
    pub workflow_type: String,
    pub state: ScheduleState,
    pub spec_description: String,
    pub next_run: Option<DateTime<Utc>>,
    pub recent_action_count: u64,
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScheduleState {
    Active,
    Paused,
}

impl ScheduleState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "Active",
            Self::Paused => "Paused",
        }
    }
}

impl std::fmt::Display for ScheduleState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
