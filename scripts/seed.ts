#!/usr/bin/env bun
/**
 * Seed script - creates sample workflows in Temporal dev server
 *
 * Usage: bun run scripts/seed.ts
 *
 * Requires: temporal server start-dev
 */

import { $ } from "bun";

const TASK_QUEUE = "seed-task-queue";

interface WorkflowSeed {
  type: string;
  id: string;
  input?: unknown;
}

const WORKFLOWS: WorkflowSeed[] = [
  // Order processing workflows
  { type: "OrderWorkflow", id: "order-12345", input: { orderId: "12345", amount: 99.99, customer: "alice@example.com" } },
  { type: "OrderWorkflow", id: "order-67890", input: { orderId: "67890", amount: 149.50, customer: "bob@example.com" } },
  { type: "OrderWorkflow", id: "order-11111", input: { orderId: "11111", amount: 25.00, customer: "charlie@example.com" } },

  // Payment workflows
  { type: "PaymentWorkflow", id: "payment-abc123", input: { paymentId: "abc123", amount: 99.99, method: "credit_card" } },
  { type: "PaymentWorkflow", id: "payment-def456", input: { paymentId: "def456", amount: 200.00, method: "paypal" } },

  // Notification workflows
  { type: "NotificationWorkflow", id: "notify-user-001", input: { userId: "user-001", type: "welcome", channel: "email" } },
  { type: "NotificationWorkflow", id: "notify-user-002", input: { userId: "user-002", type: "order_shipped", channel: "sms" } },

  // Data processing workflows
  { type: "DataPipelineWorkflow", id: "pipeline-daily-2024", input: { date: "2024-01-15", source: "s3://data-lake/raw", destination: "warehouse" } },
  { type: "DataPipelineWorkflow", id: "pipeline-hourly-001", input: { hour: "14", metrics: ["cpu", "memory", "disk"] } },

  // User workflows
  { type: "UserOnboardingWorkflow", id: "onboard-alice", input: { userId: "alice", email: "alice@example.com", plan: "pro" } },
  { type: "UserOnboardingWorkflow", id: "onboard-bob", input: { userId: "bob", email: "bob@example.com", plan: "free" } },

  // Background jobs
  { type: "ReportGeneratorWorkflow", id: "report-monthly-jan", input: { month: "January", year: 2024, format: "pdf" } },
  { type: "CleanupWorkflow", id: "cleanup-old-sessions", input: { olderThanDays: 30, dryRun: false } },

  // Long running workflows
  { type: "SubscriptionWorkflow", id: "sub-enterprise-001", input: { customerId: "enterprise-001", plan: "enterprise", billingCycle: "annual" } },
  { type: "MonitoringWorkflow", id: "monitor-prod-cluster", input: { cluster: "prod-us-east-1", checkInterval: "5m" } },
];

async function checkTemporalConnection(): Promise<boolean> {
  try {
    const result = await $`temporal operator namespace describe default`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function startWorkflow(workflow: WorkflowSeed): Promise<boolean> {
  try {
    const inputJson = JSON.stringify(workflow.input ?? {});

    await $`temporal workflow start \
      --type ${workflow.type} \
      --task-queue ${TASK_QUEUE} \
      --workflow-id ${workflow.id} \
      --input ${inputJson}`.quiet();

    console.log(`✓ Started ${workflow.type}: ${workflow.id}`);
    return true;
  } catch (error) {
    // Workflow might already exist
    if (String(error).includes("already started")) {
      console.log(`○ Already exists: ${workflow.id}`);
      return true;
    }
    console.error(`✗ Failed to start ${workflow.id}:`, error);
    return false;
  }
}

async function createSchedules(): Promise<void> {
  console.log("\n📅 Creating schedules...\n");

  const schedules = [
    {
      id: "daily-cleanup",
      interval: "24h",
      type: "CleanupWorkflow",
      input: { olderThanDays: 7 },
    },
    {
      id: "hourly-metrics",
      interval: "1h",
      type: "MetricsCollectorWorkflow",
      input: { metrics: ["all"] },
    },
    {
      id: "five-minute-health-check",
      interval: "5m",
      type: "HealthCheckWorkflow",
      input: { targets: ["api", "db", "cache"] },
    },
  ];

  for (const schedule of schedules) {
    try {
      const inputJson = JSON.stringify(schedule.input);

      // Use array form to avoid shell escaping issues
      const args = [
        "schedule", "create",
        "--schedule-id", schedule.id,
        "--interval", schedule.interval,
        "--type", schedule.type,
        "--task-queue", TASK_QUEUE,
        "--workflow-id", `${schedule.id}-run`,
        "--input", inputJson,
      ];

      const proc = Bun.spawn(["temporal", ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;

      if (exitCode === 0) {
        console.log(`✓ Created schedule: ${schedule.id}`);
      } else {
        const stderr = await new Response(proc.stderr).text();
        if (stderr.includes("already exists") || stderr.includes("already registered")) {
          console.log(`○ Schedule already exists: ${schedule.id}`);
        } else {
          console.error(`✗ Failed to create schedule ${schedule.id}: ${stderr}`);
        }
      }
    } catch (error) {
      if (String(error).includes("already exists")) {
        console.log(`○ Schedule already exists: ${schedule.id}`);
      } else {
        console.error(`✗ Failed to create schedule ${schedule.id}:`, error);
      }
    }
  }
}

async function terminateSomeWorkflows(): Promise<void> {
  console.log("\n🛑 Terminating some workflows for variety...\n");

  const toTerminate = ["order-11111", "notify-user-002"];

  for (const workflowId of toTerminate) {
    try {
      await $`temporal workflow terminate --workflow-id ${workflowId} --reason "Seed script - creating terminated state"`.quiet();
      console.log(`✓ Terminated: ${workflowId}`);
    } catch (error) {
      console.log(`○ Could not terminate ${workflowId} (may already be closed)`);
    }
  }
}

async function cancelSomeWorkflows(): Promise<void> {
  console.log("\n⏹ Canceling some workflows for variety...\n");

  const toCancel = ["pipeline-hourly-001"];

  for (const workflowId of toCancel) {
    try {
      await $`temporal workflow cancel --workflow-id ${workflowId}`.quiet();
      console.log(`✓ Canceled: ${workflowId}`);
    } catch (error) {
      console.log(`○ Could not cancel ${workflowId} (may already be closed)`);
    }
  }
}

async function main(): Promise<void> {
  console.log("🌱 Temporal TUI Seed Script\n");
  console.log("Checking Temporal connection...\n");

  const connected = await checkTemporalConnection();
  if (!connected) {
    console.error("❌ Cannot connect to Temporal. Make sure the dev server is running:");
    console.error("   temporal server start-dev");
    process.exit(1);
  }

  console.log("✓ Connected to Temporal\n");
  console.log("📦 Creating workflows...\n");

  let successCount = 0;
  for (const workflow of WORKFLOWS) {
    const success = await startWorkflow(workflow);
    if (success) successCount++;
    // Small delay to spread out start times
    await Bun.sleep(100);
  }

  console.log(`\n✓ Created ${successCount}/${WORKFLOWS.length} workflows`);

  // Create some variety in workflow states
  await Bun.sleep(500);
  await terminateSomeWorkflows();
  await cancelSomeWorkflows();

  // Create schedules
  await createSchedules();

  console.log("\n✅ Seeding complete!");
  console.log("\nYou can now run the TUI to see the workflows:");
  console.log("   bun run dev");
}

main().catch(console.error);
