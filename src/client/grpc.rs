use async_trait::async_trait;
use chrono::{DateTime, TimeZone, Utc};
use tonic::metadata::AsciiMetadataValue;
use tonic::service::Interceptor;
use tonic::transport::{Channel, ClientTlsConfig, Endpoint};
use tonic::{Request, Status};

use super::{ClientError, ClientResult, TemporalClient};
use crate::domain::*;
use crate::proto::{self, WorkflowServiceClient};

#[derive(Clone)]
struct ApiKeyInterceptor {
    api_key: Option<AsciiMetadataValue>,
    namespace: Option<AsciiMetadataValue>,
}

impl Interceptor for ApiKeyInterceptor {
    fn call(&mut self, mut request: Request<()>) -> Result<Request<()>, Status> {
        if let Some(ref token) = self.api_key {
            request.metadata_mut().insert("authorization", token.clone());
        }
        if let Some(ref ns) = self.namespace {
            request
                .metadata_mut()
                .insert("temporal-namespace", ns.clone());
        }
        Ok(request)
    }
}

type InterceptedClient =
    WorkflowServiceClient<tonic::service::interceptor::InterceptedService<Channel, ApiKeyInterceptor>>;

pub struct GrpcTemporalClient {
    client: InterceptedClient,
    #[allow(dead_code)]
    namespace: String,
}

impl GrpcTemporalClient {
    pub async fn connect(
        address: &str,
        namespace: String,
        api_key: Option<String>,
        tls_cert: Option<String>,
        tls_key: Option<String>,
    ) -> ClientResult<Self> {
        tracing::info!("Connecting to Temporal at {}", address);

        let is_localhost = address.starts_with("localhost")
            || address.starts_with("127.0.0.1")
            || address.starts_with("[::1]");

        let use_tls = !is_localhost || api_key.is_some();

        let scheme = if use_tls { "https" } else { "http" };
        let endpoint_url = format!("{}://{}", scheme, address);

        let mut endpoint = Endpoint::from_shared(endpoint_url.clone())
            .map_err(|e| ClientError::ConnectionError(format!("invalid endpoint: {}", e)))?;

        if use_tls {
            let mut tls_config = ClientTlsConfig::new().with_native_roots();

            // mTLS client certificates
            if let (Some(cert_path), Some(key_path)) = (tls_cert, tls_key) {
                let cert = std::fs::read(&cert_path)
                    .map_err(|e| ClientError::ConfigError(format!("failed to read TLS cert {}: {}", cert_path, e)))?;
                let key = std::fs::read(&key_path)
                    .map_err(|e| ClientError::ConfigError(format!("failed to read TLS key {}: {}", key_path, e)))?;
                let identity = tonic::transport::Identity::from_pem(cert, key);
                tls_config = tls_config.identity(identity);
            }

            endpoint = endpoint
                .tls_config(tls_config)
                .map_err(|e| ClientError::ConnectionError(format!("TLS config error: {}", e)))?;
        }

        let channel = endpoint.connect().await.map_err(|e| {
            tracing::error!("Connection failed to {}: {}", endpoint_url, e);
            ClientError::ConnectionError(format!("failed to connect: {}", e))
        })?;

        tracing::info!("Connected to Temporal successfully");

        let interceptor = ApiKeyInterceptor {
            api_key: api_key.as_ref().and_then(|key| {
                format!("Bearer {}", key).parse::<AsciiMetadataValue>().ok()
            }),
            namespace: namespace.parse::<AsciiMetadataValue>().ok(),
        };

        let client = WorkflowServiceClient::with_interceptor(channel, interceptor);

        Ok(Self { client, namespace })
    }

    fn make_request<T>(&self, inner: T) -> Request<T> {
        Request::new(inner)
    }

    fn wf_execution(workflow_id: &str, run_id: Option<&str>) -> proto::temporal::api::common::v1::WorkflowExecution {
        proto::temporal::api::common::v1::WorkflowExecution {
            workflow_id: workflow_id.to_string(),
            run_id: run_id.unwrap_or("").to_string(),
        }
    }
}

#[async_trait]
impl TemporalClient for GrpcTemporalClient {
    async fn list_namespaces(&self) -> ClientResult<Vec<Namespace>> {
        let inner = proto::ListNamespacesRequest {
            page_size: 100,
            next_page_token: vec![],
            namespace_filter: None,
        };

        let response = self
            .client
            .clone()
            .list_namespaces(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        let namespaces = response
            .into_inner()
            .namespaces
            .into_iter()
            .filter_map(|desc| {
                let info = desc.namespace_info?;
                let config = desc.config;
                Some(Namespace {
                    name: info.name,
                    state: format!("{:?}", info.state),
                    description: info.description,
                    owner_email: info.owner_email,
                    retention: config
                        .and_then(|c| c.workflow_execution_retention_ttl)
                        .map(|d| std::time::Duration::new(d.seconds as u64, d.nanos as u32)),
                })
            })
            .collect();

        Ok(namespaces)
    }

    async fn list_workflows(
        &self,
        namespace: &str,
        query: Option<&str>,
        page_size: i32,
        next_page_token: Vec<u8>,
    ) -> ClientResult<(Vec<WorkflowSummary>, Vec<u8>)> {
        let inner = proto::ListWorkflowExecutionsRequest {
            namespace: namespace.to_string(),
            page_size,
            next_page_token,
            query: query.unwrap_or("").to_string(),
        };

        let response = self
            .client
            .clone()
            .list_workflow_executions(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        let resp = response.into_inner();
        let workflows = resp
            .executions
            .into_iter()
            .map(workflow_info_to_summary)
            .collect::<Result<Vec<_>, _>>()?;

        Ok((workflows, resp.next_page_token))
    }

    async fn describe_workflow(
        &self,
        namespace: &str,
        workflow_id: &str,
        run_id: Option<&str>,
    ) -> ClientResult<WorkflowDetail> {
        let inner = proto::DescribeWorkflowExecutionRequest {
            namespace: namespace.to_string(),
            execution: Some(Self::wf_execution(workflow_id, run_id)),
        };

        let response = self
            .client
            .clone()
            .describe_workflow_execution(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        let resp = response.into_inner();
        let info = resp
            .workflow_execution_info
            .ok_or_else(|| ClientError::ParseError("missing workflow execution info".into()))?;

        let history_length = info.history_length as u64;
        let summary = workflow_info_to_summary(info)?;

        let pending_activities = resp
            .pending_activities
            .into_iter()
            .map(|pa| PendingActivity {
                activity_id: pa.activity_id,
                activity_type: pa.activity_type.map(|t| t.name).unwrap_or_default(),
                state: match pa.state {
                    1 => PendingActivityState::Scheduled,
                    2 => PendingActivityState::Started,
                    3 => PendingActivityState::CancelRequested,
                    _ => PendingActivityState::Scheduled,
                },
                attempt: pa.attempt,
                scheduled_time: pa.scheduled_time.map(|t| timestamp_to_datetime(&t)),
                last_started_time: pa.last_started_time.map(|t| timestamp_to_datetime(&t)),
                last_heartbeat_time: pa.last_heartbeat_time.map(|t| timestamp_to_datetime(&t)),
                last_failure_message: pa.last_failure.map(|f| f.message),
            })
            .collect();

        Ok(WorkflowDetail {
            summary,
            input: None,
            output: None,
            failure: None,
            history_length,
            memo: std::collections::HashMap::new(),
            search_attributes: std::collections::HashMap::new(),
            pending_activities,
        })
    }

    async fn get_history(
        &self,
        namespace: &str,
        workflow_id: &str,
        run_id: Option<&str>,
    ) -> ClientResult<Vec<HistoryEvent>> {
        let mut all_events = Vec::new();
        let mut next_page_token = vec![];

        loop {
            let inner = proto::GetWorkflowExecutionHistoryRequest {
                namespace: namespace.to_string(),
                execution: Some(Self::wf_execution(workflow_id, run_id)),
                maximum_page_size: 200,
                next_page_token: next_page_token.clone(),
                wait_new_event: false,
                history_event_filter_type: 0,
                skip_archival: false,
            };

            let response = self
                .client
                .clone()
                .get_workflow_execution_history(self.make_request(inner))
                .await
                .map_err(grpc_error)?;

            let resp = response.into_inner();
            if let Some(history) = resp.history {
                for e in history.events {
                    let details = extract_event_details(&e);
                    all_events.push(HistoryEvent {
                        event_id: e.event_id,
                        event_type: event_type_name(e.event_type),
                        timestamp: e
                            .event_time
                            .map(|t| timestamp_to_datetime(&t))
                            .unwrap_or_else(Utc::now),
                        details,
                    });
                }
            }

            if resp.next_page_token.is_empty() {
                break;
            }
            next_page_token = resp.next_page_token;
        }

        Ok(all_events)
    }

    async fn count_workflows(
        &self,
        namespace: &str,
        query: Option<&str>,
    ) -> ClientResult<u64> {
        let inner = proto::CountWorkflowExecutionsRequest {
            namespace: namespace.to_string(),
            query: query.unwrap_or("").to_string(),
        };

        let response = self
            .client
            .clone()
            .count_workflow_executions(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        Ok(response.into_inner().count as u64)
    }

    async fn cancel_workflow(
        &self,
        namespace: &str,
        workflow_id: &str,
        run_id: Option<&str>,
    ) -> ClientResult<()> {
        let inner = proto::RequestCancelWorkflowExecutionRequest {
            namespace: namespace.to_string(),
            workflow_execution: Some(Self::wf_execution(workflow_id, run_id)),
            identity: "t9s".to_string(),
            request_id: uuid::Uuid::new_v4().to_string(),
            first_execution_run_id: String::new(),
            reason: String::new(),
            links: vec![],
        };

        self.client
            .clone()
            .request_cancel_workflow_execution(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        Ok(())
    }

    async fn terminate_workflow(
        &self,
        namespace: &str,
        workflow_id: &str,
        run_id: Option<&str>,
        reason: &str,
    ) -> ClientResult<()> {
        let inner = proto::TerminateWorkflowExecutionRequest {
            namespace: namespace.to_string(),
            workflow_execution: Some(Self::wf_execution(workflow_id, run_id)),
            reason: reason.to_string(),
            identity: "t9s".to_string(),
            details: None,
            first_execution_run_id: String::new(),
            links: vec![],
        };

        self.client
            .clone()
            .terminate_workflow_execution(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        Ok(())
    }

    async fn signal_workflow(
        &self,
        namespace: &str,
        workflow_id: &str,
        run_id: Option<&str>,
        signal_name: &str,
        input: Option<&str>,
    ) -> ClientResult<()> {
        let signal_input = input.map(|i| proto::temporal::api::common::v1::Payloads {
            payloads: vec![proto::temporal::api::common::v1::Payload {
                metadata: std::collections::HashMap::new(),
                data: i.as_bytes().to_vec(),
                external_payloads: vec![],
            }],
        });

        #[allow(deprecated)]
        let inner = proto::SignalWorkflowExecutionRequest {
            namespace: namespace.to_string(),
            workflow_execution: Some(Self::wf_execution(workflow_id, run_id)),
            signal_name: signal_name.to_string(),
            input: signal_input,
            identity: "t9s".to_string(),
            request_id: uuid::Uuid::new_v4().to_string(),
            control: String::new(),
            header: None,
            links: vec![],
        };

        self.client
            .clone()
            .signal_workflow_execution(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        Ok(())
    }

    async fn list_schedules(
        &self,
        namespace: &str,
    ) -> ClientResult<Vec<Schedule>> {
        let inner = proto::ListSchedulesRequest {
            namespace: namespace.to_string(),
            maximum_page_size: 100,
            next_page_token: vec![],
            query: String::new(),
        };

        let response = self
            .client
            .clone()
            .list_schedules(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        let schedules = response
            .into_inner()
            .schedules
            .into_iter()
            .map(|entry| {
                let info = entry.info.as_ref();
                Schedule {
                    schedule_id: entry.schedule_id,
                    workflow_type: info
                        .and_then(|i| i.workflow_type.as_ref())
                        .map(|t| t.name.clone())
                        .unwrap_or_default(),
                    state: if info.map(|i| i.paused).unwrap_or(false) {
                        ScheduleState::Paused
                    } else {
                        ScheduleState::Active
                    },
                    spec_description: String::new(),
                    next_run: info
                        .and_then(|i| i.future_action_times.first())
                        .map(timestamp_to_datetime),
                    recent_action_count: info
                        .map(|i| i.recent_actions.len() as u64)
                        .unwrap_or(0),
                    notes: info
                        .map(|i| i.notes.clone())
                        .unwrap_or_default(),
                }
            })
            .collect();

        Ok(schedules)
    }

    async fn describe_schedule(
        &self,
        namespace: &str,
        schedule_id: &str,
    ) -> ClientResult<Schedule> {
        let inner = proto::DescribeScheduleRequest {
            namespace: namespace.to_string(),
            schedule_id: schedule_id.to_string(),
        };

        let response = self
            .client
            .clone()
            .describe_schedule(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        let resp = response.into_inner();
        let info = resp.info;
        let schedule = resp.schedule;

        Ok(Schedule {
            schedule_id: schedule_id.to_string(),
            workflow_type: schedule
                .as_ref()
                .and_then(|s| s.action.as_ref())
                .and_then(|a| a.action.as_ref())
                .and_then(|a| match a {
                    proto::temporal::api::schedule::v1::schedule_action::Action::StartWorkflow(wf) => {
                        wf.workflow_type.as_ref().map(|t| t.name.clone())
                    }
                })
                .unwrap_or_default(),
            state: {
                let paused = schedule
                    .as_ref()
                    .and_then(|s| s.state.as_ref())
                    .map(|s| s.paused)
                    .unwrap_or(false);
                if paused {
                    ScheduleState::Paused
                } else {
                    ScheduleState::Active
                }
            },
            spec_description: String::new(),
            next_run: info
                .as_ref()
                .and_then(|i| i.future_action_times.first())
                .map(timestamp_to_datetime),
            recent_action_count: info
                .as_ref()
                .map(|i| i.recent_actions.len() as u64)
                .unwrap_or(0),
            notes: schedule
                .as_ref()
                .and_then(|s| s.state.as_ref())
                .map(|s| s.notes.clone())
                .unwrap_or_default(),
        })
    }

    async fn patch_schedule(
        &self,
        namespace: &str,
        schedule_id: &str,
        pause: bool,
    ) -> ClientResult<()> {
        let inner = proto::PatchScheduleRequest {
            namespace: namespace.to_string(),
            schedule_id: schedule_id.to_string(),
            patch: Some(proto::temporal::api::schedule::v1::SchedulePatch {
                pause: if pause { "paused by t9s".to_string() } else { String::new() },
                unpause: if !pause { "unpaused by t9s".to_string() } else { String::new() },
                ..Default::default()
            }),
            identity: "t9s".to_string(),
            request_id: uuid::Uuid::new_v4().to_string(),
        };

        self.client
            .clone()
            .patch_schedule(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        Ok(())
    }

    async fn trigger_schedule(
        &self,
        namespace: &str,
        schedule_id: &str,
    ) -> ClientResult<()> {
        let inner = proto::PatchScheduleRequest {
            namespace: namespace.to_string(),
            schedule_id: schedule_id.to_string(),
            patch: Some(proto::temporal::api::schedule::v1::SchedulePatch {
                trigger_immediately: Some(
                    proto::temporal::api::schedule::v1::TriggerImmediatelyRequest {
                        overlap_policy: 0,
                        scheduled_time: None,
                    },
                ),
                ..Default::default()
            }),
            identity: "t9s".to_string(),
            request_id: uuid::Uuid::new_v4().to_string(),
        };

        self.client
            .clone()
            .patch_schedule(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        Ok(())
    }

    async fn delete_schedule(
        &self,
        namespace: &str,
        schedule_id: &str,
    ) -> ClientResult<()> {
        let inner = proto::DeleteScheduleRequest {
            namespace: namespace.to_string(),
            schedule_id: schedule_id.to_string(),
            identity: "t9s".to_string(),
        };

        self.client
            .clone()
            .delete_schedule(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        Ok(())
    }

    async fn describe_task_queue(
        &self,
        namespace: &str,
        task_queue: &str,
    ) -> ClientResult<TaskQueueInfo> {
        #[allow(deprecated)]
        let inner = proto::DescribeTaskQueueRequest {
            namespace: namespace.to_string(),
            task_queue: Some(proto::temporal::api::taskqueue::v1::TaskQueue {
                name: task_queue.to_string(),
                kind: 0,
                normal_name: String::new(),
            }),
            task_queue_type: 1, // WORKFLOW
            include_task_queue_status: true,
            api_mode: 0,
            versions: None,
            task_queue_types: vec![],
            report_stats: true,
            report_config: false,
            report_pollers: true,
            report_task_reachability: false,
        };

        let response = self
            .client
            .clone()
            .describe_task_queue(self.make_request(inner))
            .await
            .map_err(grpc_error)?;

        let resp = response.into_inner();
        let pollers = resp
            .pollers
            .into_iter()
            .map(|p| Poller {
                identity: p.identity,
                last_access_time: p.last_access_time.map(|t| timestamp_to_datetime(&t)),
                rate_per_second: p.rate_per_second,
            })
            .collect();

        Ok(TaskQueueInfo {
            name: task_queue.to_string(),
            pollers,
        })
    }
}

fn grpc_error(status: Status) -> ClientError {
    match status.code() {
        tonic::Code::NotFound => ClientError::NotFound(status.message().to_string()),
        tonic::Code::DeadlineExceeded => ClientError::Timeout,
        tonic::Code::Unavailable => ClientError::ConnectionError(status.message().to_string()),
        _ => ClientError::RequestFailed(format!("{}: {}", status.code(), status.message())),
    }
}

fn workflow_info_to_summary(
    info: proto::temporal::api::workflow::v1::WorkflowExecutionInfo,
) -> ClientResult<WorkflowSummary> {
    let execution = info
        .execution
        .ok_or_else(|| ClientError::ParseError("missing execution".into()))?;

    let workflow_type = info
        .r#type
        .map(|t| t.name)
        .unwrap_or_else(|| "Unknown".to_string());

    let status = proto_status_to_domain(info.status);

    let start_time = info
        .start_time
        .map(|t| timestamp_to_datetime(&t))
        .unwrap_or_else(Utc::now);

    let close_time = info.close_time.map(|t| timestamp_to_datetime(&t));

    let task_queue = info.task_queue;

    Ok(WorkflowSummary {
        workflow_id: execution.workflow_id,
        run_id: execution.run_id,
        workflow_type,
        status,
        start_time,
        close_time,
        task_queue,
    })
}

fn timestamp_to_datetime(ts: &prost_types::Timestamp) -> DateTime<Utc> {
    Utc.timestamp_opt(ts.seconds, ts.nanos as u32)
        .single()
        .unwrap_or_else(Utc::now)
}

fn proto_status_to_domain(status: i32) -> WorkflowStatus {
    use crate::proto::temporal::api::enums::v1::WorkflowExecutionStatus;

    match WorkflowExecutionStatus::try_from(status) {
        Ok(WorkflowExecutionStatus::Running) => WorkflowStatus::Running,
        Ok(WorkflowExecutionStatus::Completed) => WorkflowStatus::Completed,
        Ok(WorkflowExecutionStatus::Failed) => WorkflowStatus::Failed,
        Ok(WorkflowExecutionStatus::Canceled) => WorkflowStatus::Canceled,
        Ok(WorkflowExecutionStatus::Terminated) => WorkflowStatus::Terminated,
        Ok(WorkflowExecutionStatus::ContinuedAsNew) => WorkflowStatus::ContinuedAsNew,
        Ok(WorkflowExecutionStatus::TimedOut) => WorkflowStatus::TimedOut,
        _ => WorkflowStatus::Running,
    }
}

fn event_type_name(event_type: i32) -> String {
    use crate::proto::temporal::api::enums::v1::EventType;
    match EventType::try_from(event_type) {
        Ok(et) => format!("{:?}", et),
        Err(_) => format!("Unknown({})", event_type),
    }
}

fn decode_payloads(payloads: &Option<proto::temporal::api::common::v1::Payloads>) -> serde_json::Value {
    let Some(payloads) = payloads else {
        return serde_json::Value::Null;
    };
    let values: Vec<serde_json::Value> = payloads.payloads.iter().map(decode_payload).collect();
    if values.len() == 1 {
        values.into_iter().next().unwrap()
    } else {
        serde_json::Value::Array(values)
    }
}

fn decode_payload(payload: &proto::temporal::api::common::v1::Payload) -> serde_json::Value {
    let encoding = payload
        .metadata
        .get("encoding")
        .map(|v| String::from_utf8_lossy(v).to_string())
        .unwrap_or_default();

    match encoding.as_str() {
        "json/plain" => serde_json::from_slice(&payload.data).unwrap_or_else(|_| {
            serde_json::Value::String(String::from_utf8_lossy(&payload.data).to_string())
        }),
        "binary/null" => serde_json::Value::Null,
        _ => {
            if let Ok(s) = std::str::from_utf8(&payload.data) {
                // Try parsing as JSON first
                serde_json::from_str(s).unwrap_or_else(|_| serde_json::Value::String(s.to_string()))
            } else {
                serde_json::Value::String(format!("<binary {} bytes>", payload.data.len()))
            }
        }
    }
}

fn decode_failure(failure: &Option<proto::temporal::api::failure::v1::Failure>) -> serde_json::Value {
    let Some(f) = failure else {
        return serde_json::Value::Null;
    };
    let mut map = serde_json::Map::new();
    if !f.message.is_empty() {
        map.insert("message".into(), serde_json::Value::String(f.message.clone()));
    }
    if !f.source.is_empty() {
        map.insert("source".into(), serde_json::Value::String(f.source.clone()));
    }
    if !f.stack_trace.is_empty() {
        map.insert("stack_trace".into(), serde_json::Value::String(f.stack_trace.clone()));
    }
    if let Some(ref cause) = f.cause {
        map.insert("cause".into(), decode_failure(&Some(*cause.clone())));
    }
    serde_json::Value::Object(map)
}

fn extract_event_details(
    event: &proto::temporal::api::history::v1::HistoryEvent,
) -> serde_json::Value {
    use proto::temporal::api::history::v1::history_event::Attributes;

    let Some(ref attrs) = event.attributes else {
        return serde_json::json!({});
    };

    match attrs {
        Attributes::WorkflowExecutionStartedEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            if let Some(ref wt) = a.workflow_type {
                map.insert("workflow_type".into(), serde_json::Value::String(wt.name.clone()));
            }
            if let Some(ref tq) = a.task_queue {
                map.insert("task_queue".into(), serde_json::Value::String(tq.name.clone()));
            }
            let input = decode_payloads(&a.input);
            if !input.is_null() {
                map.insert("input".into(), input);
            }
            serde_json::Value::Object(map)
        }
        Attributes::WorkflowExecutionCompletedEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            let result = decode_payloads(&a.result);
            if !result.is_null() {
                map.insert("result".into(), result);
            }
            serde_json::Value::Object(map)
        }
        Attributes::WorkflowExecutionFailedEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            let failure = decode_failure(&a.failure);
            if !failure.is_null() {
                map.insert("failure".into(), failure);
            }
            serde_json::Value::Object(map)
        }
        Attributes::ActivityTaskScheduledEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            if let Some(ref at) = a.activity_type {
                map.insert("activity_type".into(), serde_json::Value::String(at.name.clone()));
            }
            if let Some(ref tq) = a.task_queue {
                map.insert("task_queue".into(), serde_json::Value::String(tq.name.clone()));
            }
            let input = decode_payloads(&a.input);
            if !input.is_null() {
                map.insert("input".into(), input);
            }
            serde_json::Value::Object(map)
        }
        Attributes::ActivityTaskCompletedEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            let result = decode_payloads(&a.result);
            if !result.is_null() {
                map.insert("result".into(), result);
            }
            serde_json::Value::Object(map)
        }
        Attributes::ActivityTaskFailedEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            let failure = decode_failure(&a.failure);
            if !failure.is_null() {
                map.insert("failure".into(), failure);
            }
            serde_json::Value::Object(map)
        }
        Attributes::TimerStartedEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            map.insert("timer_id".into(), serde_json::Value::String(a.timer_id.clone()));
            if let Some(ref d) = a.start_to_fire_timeout {
                map.insert(
                    "start_to_fire_timeout".into(),
                    serde_json::Value::String(format!("{}s", d.seconds)),
                );
            }
            serde_json::Value::Object(map)
        }
        Attributes::TimerFiredEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            map.insert("timer_id".into(), serde_json::Value::String(a.timer_id.clone()));
            serde_json::Value::Object(map)
        }
        Attributes::WorkflowExecutionSignaledEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            map.insert("signal_name".into(), serde_json::Value::String(a.signal_name.clone()));
            let input = decode_payloads(&a.input);
            if !input.is_null() {
                map.insert("input".into(), input);
            }
            serde_json::Value::Object(map)
        }
        Attributes::WorkflowExecutionTerminatedEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            if !a.reason.is_empty() {
                map.insert("reason".into(), serde_json::Value::String(a.reason.clone()));
            }
            serde_json::Value::Object(map)
        }
        Attributes::WorkflowExecutionCanceledEventAttributes(_) => {
            serde_json::json!({})
        }
        Attributes::ChildWorkflowExecutionStartedEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            if let Some(ref wt) = a.workflow_type {
                map.insert("workflow_type".into(), serde_json::Value::String(wt.name.clone()));
            }
            if let Some(ref exec) = a.workflow_execution {
                map.insert("workflow_id".into(), serde_json::Value::String(exec.workflow_id.clone()));
            }
            serde_json::Value::Object(map)
        }
        Attributes::ChildWorkflowExecutionCompletedEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            let result = decode_payloads(&a.result);
            if !result.is_null() {
                map.insert("result".into(), result);
            }
            serde_json::Value::Object(map)
        }
        Attributes::ChildWorkflowExecutionFailedEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            let failure = decode_failure(&a.failure);
            if !failure.is_null() {
                map.insert("failure".into(), failure);
            }
            serde_json::Value::Object(map)
        }
        Attributes::StartChildWorkflowExecutionInitiatedEventAttributes(a) => {
            let mut map = serde_json::Map::new();
            if let Some(ref wt) = a.workflow_type {
                map.insert("workflow_type".into(), serde_json::Value::String(wt.name.clone()));
            }
            map.insert("workflow_id".into(), serde_json::Value::String(a.workflow_id.clone()));
            let input = decode_payloads(&a.input);
            if !input.is_null() {
                map.insert("input".into(), input);
            }
            serde_json::Value::Object(map)
        }
        _ => serde_json::json!({}),
    }
}
