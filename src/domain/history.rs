use chrono::{DateTime, Utc};

#[derive(Debug, Clone)]
pub struct HistoryEvent {
    pub event_id: i64,
    pub event_type: String,
    pub timestamp: DateTime<Utc>,
    pub details: serde_json::Value,
}
