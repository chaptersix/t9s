use std::collections::HashMap;

use tonic::transport::{Channel, Endpoint};

use t9s::proto::temporal::api::common::v1::{Payload, Payloads, WorkflowType};
use t9s::proto::temporal::api::schedule::v1::{
    schedule_action, Schedule, ScheduleAction, SchedulePolicies, ScheduleSpec, ScheduleState,
};
use t9s::proto::temporal::api::taskqueue::v1::TaskQueue;
use t9s::proto::temporal::api::workflow::v1::NewWorkflowExecutionInfo;
use t9s::proto::WorkflowServiceClient;
use t9s::proto::{CreateScheduleRequest, StartWorkflowExecutionRequest};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let address = std::env::var("TEMPORAL_ADDRESS").unwrap_or_else(|_| "localhost:7233".into());
    let namespace = std::env::var("TEMPORAL_NAMESPACE").unwrap_or_else(|_| "default".into());

    println!("Seeding Temporal at {} (namespace: {})", address, namespace);

    let endpoint_url = format!("http://{}", address);
    let endpoint = Endpoint::from_shared(endpoint_url)?;
    let channel: Channel = endpoint.connect().await?;
    let mut client = WorkflowServiceClient::new(channel);

    // Seed workflows
    let workflows = vec![
        ("order-processing", "OrderWorkflow", "orders-queue", json_payload(r#"{"orderId": "ORD-1001", "amount": 99.99}"#)),
        ("order-processing-2", "OrderWorkflow", "orders-queue", json_payload(r#"{"orderId": "ORD-1002", "amount": 249.50}"#)),
        ("order-processing-3", "OrderWorkflow", "orders-queue", json_payload(r#"{"orderId": "ORD-1003", "amount": 15.00}"#)),
        ("user-onboarding-alice", "UserOnboardingWorkflow", "users-queue", json_payload(r#"{"userId": "alice", "email": "alice@example.com"}"#)),
        ("user-onboarding-bob", "UserOnboardingWorkflow", "users-queue", json_payload(r#"{"userId": "bob", "email": "bob@example.com"}"#)),
        ("payment-charge-1001", "PaymentWorkflow", "payments-queue", json_payload(r#"{"chargeId": "CHG-1001", "amount": 99.99, "currency": "USD"}"#)),
        ("payment-charge-1002", "PaymentWorkflow", "payments-queue", json_payload(r#"{"chargeId": "CHG-1002", "amount": 249.50, "currency": "USD"}"#)),
        ("data-pipeline-daily", "DataPipelineWorkflow", "data-queue", json_payload(r#"{"source": "s3://data-lake/raw", "date": "2025-01-15"}"#)),
        ("data-pipeline-hourly", "DataPipelineWorkflow", "data-queue", json_payload(r#"{"source": "s3://data-lake/streaming", "date": "2025-01-15"}"#)),
        ("email-campaign-winter", "EmailCampaignWorkflow", "notifications-queue", json_payload(r#"{"campaignId": "CAMP-42", "template": "winter-sale", "recipients": 15000}"#)),
        ("notification-digest-1", "NotificationDigestWorkflow", "notifications-queue", json_payload(r#"{"userId": "alice", "channel": "email"}"#)),
        ("notification-digest-2", "NotificationDigestWorkflow", "notifications-queue", json_payload(r#"{"userId": "bob", "channel": "slack"}"#)),
        ("inventory-sync", "InventorySyncWorkflow", "inventory-queue", json_payload(r#"{"warehouseId": "WH-01", "sku_count": 450}"#)),
        ("inventory-recount", "InventoryRecountWorkflow", "inventory-queue", json_payload(r#"{"warehouseId": "WH-02"}"#)),
        ("report-generation-q4", "ReportWorkflow", "reports-queue", json_payload(r#"{"reportType": "quarterly", "quarter": "Q4", "year": 2024}"#)),
        ("report-generation-annual", "ReportWorkflow", "reports-queue", json_payload(r#"{"reportType": "annual", "year": 2024}"#)),
        ("subscription-renewal-42", "SubscriptionWorkflow", "billing-queue", json_payload(r#"{"subscriptionId": "SUB-42", "plan": "enterprise"}"#)),
        ("subscription-renewal-43", "SubscriptionWorkflow", "billing-queue", json_payload(r#"{"subscriptionId": "SUB-43", "plan": "starter"}"#)),
        ("etl-customer-import", "ETLWorkflow", "data-queue", json_payload(r#"{"source": "salesforce", "entity": "contacts", "batch_size": 1000}"#)),
        ("health-check-api", "HealthCheckWorkflow", "infra-queue", json_payload(r#"{"service": "api-gateway", "endpoint": "https://api.example.com/health"}"#)),
    ];

    for (wf_id, wf_type, task_queue, input) in &workflows {
        let req = StartWorkflowExecutionRequest {
            namespace: namespace.clone(),
            workflow_id: wf_id.to_string(),
            workflow_type: Some(WorkflowType {
                name: wf_type.to_string(),
            }),
            task_queue: Some(TaskQueue {
                name: task_queue.to_string(),
                ..Default::default()
            }),
            input: Some(input.clone()),
            identity: "t9s-seed".into(),
            request_id: uuid::Uuid::new_v4().to_string(),
            ..Default::default()
        };

        match client.start_workflow_execution(req).await {
            Ok(_) => println!("  workflow: {}", wf_id),
            Err(e) => eprintln!("  workflow {} failed: {}", wf_id, e.message()),
        }
    }

    // Seed schedules
    let schedules = vec![
        (
            "daily-data-pipeline",
            "DataPipelineWorkflow",
            "data-queue",
            "0 2 * * *",
            false,
            r#"{"source": "s3://data-lake/raw"}"#,
        ),
        (
            "hourly-health-check",
            "HealthCheckWorkflow",
            "infra-queue",
            "0 * * * *",
            false,
            r#"{"service": "api-gateway"}"#,
        ),
        (
            "weekly-report",
            "ReportWorkflow",
            "reports-queue",
            "0 9 * * 1",
            false,
            r#"{"reportType": "weekly"}"#,
        ),
        (
            "nightly-inventory-sync",
            "InventorySyncWorkflow",
            "inventory-queue",
            "0 3 * * *",
            true,
            r#"{"warehouseId": "WH-01"}"#,
        ),
        (
            "monthly-billing-run",
            "BillingWorkflow",
            "billing-queue",
            "0 6 1 * *",
            false,
            r#"{"type": "monthly-invoicing"}"#,
        ),
        (
            "daily-notification-digest",
            "NotificationDigestWorkflow",
            "notifications-queue",
            "0 18 * * *",
            false,
            r#"{"channel": "email"}"#,
        ),
        (
            "quarterly-audit",
            "AuditWorkflow",
            "reports-queue",
            "0 0 1 1,4,7,10 *",
            true,
            r#"{"type": "compliance-audit"}"#,
        ),
        (
            "hourly-etl-sync",
            "ETLWorkflow",
            "data-queue",
            "@hourly",
            false,
            r#"{"source": "salesforce", "entity": "leads"}"#,
        ),
    ];

    for (schedule_id, wf_type, task_queue, cron, paused, input_json) in &schedules {
        let req = CreateScheduleRequest {
            namespace: namespace.clone(),
            schedule_id: schedule_id.to_string(),
            schedule: Some(Schedule {
                spec: Some(ScheduleSpec {
                    cron_string: vec![cron.to_string()],
                    ..Default::default()
                }),
                action: Some(ScheduleAction {
                    action: Some(schedule_action::Action::StartWorkflow(
                        NewWorkflowExecutionInfo {
                            workflow_id: format!("{}-run", schedule_id),
                            workflow_type: Some(WorkflowType {
                                name: wf_type.to_string(),
                            }),
                            task_queue: Some(TaskQueue {
                                name: task_queue.to_string(),
                                ..Default::default()
                            }),
                            input: Some(json_payload(input_json)),
                            ..Default::default()
                        },
                    )),
                }),
                policies: Some(SchedulePolicies {
                    ..Default::default()
                }),
                state: Some(ScheduleState {
                    paused: *paused,
                    notes: if *paused {
                        "Paused by seed script".into()
                    } else {
                        String::new()
                    },
                    ..Default::default()
                }),
            }),
            identity: "t9s-seed".into(),
            request_id: uuid::Uuid::new_v4().to_string(),
            ..Default::default()
        };

        match client.create_schedule(req).await {
            Ok(_) => {
                let status = if *paused { " (paused)" } else { "" };
                println!("  schedule: {}{}", schedule_id, status);
            }
            Err(e) => eprintln!("  schedule {} failed: {}", schedule_id, e.message()),
        }
    }

    println!("Done! {} workflows, {} schedules", workflows.len(), schedules.len());
    Ok(())
}

fn json_payload(json: &str) -> Payloads {
    let mut metadata = HashMap::new();
    metadata.insert("encoding".into(), b"json/plain".to_vec());

    Payloads {
        payloads: vec![Payload {
            metadata,
            data: json.as_bytes().to_vec(),
            ..Default::default()
        }],
    }
}
