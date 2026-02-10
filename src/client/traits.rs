use async_trait::async_trait;
use thiserror::Error;

use crate::domain::*;

#[derive(Error, Debug)]
pub enum ClientError {
    #[error("connection error: {0}")]
    ConnectionError(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("request failed: {0}")]
    RequestFailed(String),
    #[error("parse error: {0}")]
    ParseError(String),
    #[error("config error: {0}")]
    ConfigError(String),
    #[error("timeout")]
    Timeout,
}

pub type ClientResult<T> = Result<T, ClientError>;

#[async_trait]
pub trait TemporalClient: Send + Sync {
    async fn list_namespaces(&self) -> ClientResult<Vec<Namespace>>;

    async fn list_workflows(
        &self,
        namespace: &str,
        query: Option<&str>,
        page_size: i32,
        next_page_token: Vec<u8>,
    ) -> ClientResult<(Vec<WorkflowSummary>, Vec<u8>)>;

    async fn describe_workflow(
        &self,
        namespace: &str,
        workflow_id: &str,
        run_id: Option<&str>,
    ) -> ClientResult<WorkflowDetail>;

    async fn get_history(
        &self,
        namespace: &str,
        workflow_id: &str,
        run_id: Option<&str>,
    ) -> ClientResult<Vec<HistoryEvent>>;

    async fn count_workflows(
        &self,
        namespace: &str,
        query: Option<&str>,
    ) -> ClientResult<u64>;

    async fn cancel_workflow(
        &self,
        namespace: &str,
        workflow_id: &str,
        run_id: Option<&str>,
    ) -> ClientResult<()>;

    async fn terminate_workflow(
        &self,
        namespace: &str,
        workflow_id: &str,
        run_id: Option<&str>,
        reason: &str,
    ) -> ClientResult<()>;

    async fn signal_workflow(
        &self,
        namespace: &str,
        workflow_id: &str,
        run_id: Option<&str>,
        signal_name: &str,
        input: Option<&str>,
    ) -> ClientResult<()>;

    async fn list_schedules(
        &self,
        namespace: &str,
    ) -> ClientResult<Vec<Schedule>>;

    async fn describe_schedule(
        &self,
        namespace: &str,
        schedule_id: &str,
    ) -> ClientResult<Schedule>;

    async fn patch_schedule(
        &self,
        namespace: &str,
        schedule_id: &str,
        pause: bool,
    ) -> ClientResult<()>;

    async fn trigger_schedule(
        &self,
        namespace: &str,
        schedule_id: &str,
    ) -> ClientResult<()>;

    async fn delete_schedule(
        &self,
        namespace: &str,
        schedule_id: &str,
    ) -> ClientResult<()>;

    async fn describe_task_queue(
        &self,
        namespace: &str,
        task_queue: &str,
    ) -> ClientResult<TaskQueueInfo>;
}
