use chrono::{DateTime, Utc};

#[derive(Debug, Clone)]
pub struct TaskQueueInfo {
    pub name: String,
    pub pollers: Vec<Poller>,
}

#[derive(Debug, Clone)]
pub struct Poller {
    pub identity: String,
    pub last_access_time: Option<DateTime<Utc>>,
    pub rate_per_second: f64,
}
