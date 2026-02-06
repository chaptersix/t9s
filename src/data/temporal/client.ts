/**
 * Temporal HTTP Client
 *
 * Connects to Temporal UI Server's HTTP API (gRPC-to-HTTP proxy)
 */

import type {
  WorkflowExecution,
  WorkflowDescription,
  HistoryEvent,
  Schedule,
  TaskQueueInfo,
  Namespace,
  ServerSettings,
  PaginatedResult,
  BatchJob,
  BatchOperation,
} from "./types";
import { TemporalApiError } from "./errors";

// Raw API response types (before transformation)
interface RawWorkflowExecution {
  execution: {
    workflowId: string;
    runId: string;
  };
  type: {
    name: string;
  };
  status: string;
  startTime: string;
  closeTime?: string;
  taskQueue: string;
  historyLength?: string;
  memo?: Record<string, unknown>;
  searchAttributes?: {
    indexedFields?: Record<string, unknown>;
  };
}

interface RawWorkflowDescription {
  workflowExecutionInfo?: {
    execution?: {
      workflowId?: string;
      runId?: string;
    };
    type?: {
      name?: string;
    };
    status?: string;
    startTime?: string;
    closeTime?: string;
    historyLength?: string;
    executionTime?: string;
    taskQueue?: string;
    memo?: { fields?: Record<string, unknown> };
    searchAttributes?: { indexedFields?: Record<string, unknown> };
    parentExecution?: {
      workflowId?: string;
      runId?: string;
    };
  };
  pendingActivities?: Array<{
    activityId?: string;
    activityType?: { name?: string };
    state?: string;
    attempt?: number;
    maximumAttempts?: number;
    heartbeatDetails?: unknown;
    lastFailure?: { message?: string };
    lastStartedTime?: string;
    scheduledTime?: string;
    expirationTime?: string;
  }>;
  pendingChildren?: Array<{
    workflowId?: string;
    runId?: string;
    workflowTypeName?: string;
    initiatedId?: string;
  }>;
}

interface RawSchedule {
  scheduleId: string;
  info?: {
    spec?: {
      structuredCalendar?: Array<{
        second?: { start?: number };
        minute?: { start?: number };
        hour?: { start?: number };
        dayOfMonth?: { start?: number };
        month?: { start?: number };
        dayOfWeek?: { start?: number };
      }>;
      interval?: Array<{
        interval?: string;
        phase?: string;
      }>;
      cronString?: string[];
    };
    workflowType?: { name?: string };
    recentActions?: Array<{ startTime?: string; actualTime?: string }>;
    nextActionTimes?: string[];
    numActions?: string;
    createdAt?: string;
    lastUpdatedAt?: string;
    paused?: boolean;
  };
  schedule?: {
    action?: {
      startWorkflow?: {
        workflowId?: string;
        workflowType?: { name?: string };
        taskQueue?: { name?: string };
        input?: { payloads?: unknown[] };
      };
    };
    spec?: unknown;
    state?: {
      paused?: boolean;
      notes?: string;
    };
  };
}

// Transform raw API response to our WorkflowExecution type
function transformWorkflowExecution(raw: RawWorkflowExecution): WorkflowExecution {
  // Convert status from WORKFLOW_EXECUTION_STATUS_RUNNING to RUNNING
  const status = raw.status.replace("WORKFLOW_EXECUTION_STATUS_", "");

  return {
    workflowId: raw.execution.workflowId,
    runId: raw.execution.runId,
    workflowType: raw.type.name,
    status,
    startTime: raw.startTime,
    closeTime: raw.closeTime,
    taskQueue: raw.taskQueue,
    historyLength: raw.historyLength ? parseInt(raw.historyLength, 10) : undefined,
    memo: raw.memo,
    searchAttributes: raw.searchAttributes?.indexedFields,
  };
}

// Transform raw workflow description API response to our WorkflowDescription type
function transformWorkflowDescription(raw: RawWorkflowDescription): WorkflowDescription {
  const info = raw.workflowExecutionInfo ?? {};
  const status = (info.status ?? "").replace("WORKFLOW_EXECUTION_STATUS_", "");

  return {
    workflowId: info.execution?.workflowId ?? "",
    runId: info.execution?.runId ?? "",
    workflowType: info.type?.name ?? "",
    status: status || "UNKNOWN",
    startTime: info.startTime ?? "",
    closeTime: info.closeTime,
    taskQueue: info.taskQueue ?? "",
    historyLength: parseInt(info.historyLength ?? "0", 10),
    executionTime: info.executionTime,
    memo: info.memo?.fields,
    searchAttributes: info.searchAttributes?.indexedFields,
    parentWorkflowId: info.parentExecution?.workflowId,
    parentRunId: info.parentExecution?.runId,
    pendingActivities: (raw.pendingActivities ?? []).map((pa) => ({
      activityId: pa.activityId ?? "",
      activityType: pa.activityType?.name ?? "",
      state: (pa.state ?? "").replace("PENDING_ACTIVITY_STATE_", ""),
      attempt: pa.attempt ?? 1,
      maximumAttempts: pa.maximumAttempts ?? 0,
      heartbeatDetails: pa.heartbeatDetails,
      lastFailure: pa.lastFailure?.message,
      lastStartedTime: pa.lastStartedTime,
      scheduledTime: pa.scheduledTime,
      expirationTime: pa.expirationTime,
    })),
    pendingChildren: (raw.pendingChildren ?? []).map((pc) => ({
      workflowId: pc.workflowId ?? "",
      runId: pc.runId ?? "",
      workflowType: pc.workflowTypeName ?? "",
      initiatedId: parseInt(pc.initiatedId ?? "0", 10),
    })),
  };
}

// Transform raw schedule API response to our Schedule type
function transformSchedule(raw: RawSchedule): Schedule {
  const info = raw.info ?? {};
  const schedule = raw.schedule ?? {};
  const action = schedule.action?.startWorkflow;
  const isPaused = schedule.state?.paused ?? info.paused ?? false;

  return {
    scheduleId: raw.scheduleId,
    workflowType: action?.workflowType?.name ?? info.workflowType?.name ?? "Unknown",
    state: isPaused ? "PAUSED" : "ACTIVE",
    spec: {
      cronStrings: info.spec?.cronString,
      intervals: info.spec?.interval?.map((i) => ({
        every: i.interval ?? "",
        offset: i.phase,
      })),
    },
    action: {
      workflow: {
        workflowId: action?.workflowId ?? "",
        workflowType: action?.workflowType?.name ?? "",
        taskQueue: action?.taskQueue?.name ?? "",
        input: action?.input?.payloads?.[0],
      },
    },
    info: {
      numActions: parseInt(info.numActions ?? "0", 10),
      numActionsMissedCatchupWindow: 0,
      runningActions: [],
      recentActions: (info.recentActions ?? []).map((a) => ({
        startTime: a.startTime ?? "",
        actualTime: a.actualTime ?? "",
      })),
      nextActionTimes: info.nextActionTimes ?? [],
      createdAt: info.createdAt ?? "",
      lastUpdatedAt: info.lastUpdatedAt ?? "",
    },
  };
}

export interface ClientConfig {
  baseUrl: string;
  namespace: string;
  apiKey?: string;
}

export interface ListWorkflowsOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface TemporalClient {
  // Connection
  getSettings(): Promise<ServerSettings>;
  testConnection(): Promise<boolean>;
  setNamespace(namespace: string): void;

  // Namespaces
  listNamespaces(): Promise<Namespace[]>;
  describeNamespace(namespace: string): Promise<Namespace>;

  // Workflows
  listWorkflows(
    options?: ListWorkflowsOptions
  ): Promise<PaginatedResult<WorkflowExecution>>;
  describeWorkflow(
    workflowId: string,
    runId?: string
  ): Promise<WorkflowDescription>;
  getWorkflowHistory(
    workflowId: string,
    runId?: string
  ): Promise<PaginatedResult<HistoryEvent>>;
  signalWorkflow(
    workflowId: string,
    signal: string,
    payload?: unknown
  ): Promise<void>;
  queryWorkflow(
    workflowId: string,
    queryType: string,
    args?: unknown
  ): Promise<unknown>;
  cancelWorkflow(workflowId: string): Promise<void>;
  terminateWorkflow(workflowId: string, reason?: string): Promise<void>;

  // Activities
  pauseActivity(workflowId: string, activityId: string): Promise<void>;
  unpauseActivity(workflowId: string, activityId: string): Promise<void>;
  resetActivity(workflowId: string, activityId: string): Promise<void>;

  // Batch Operations
  startBatchOperation(op: BatchOperation): Promise<BatchJob>;
  describeBatchJob(jobId: string): Promise<BatchJob>;
  listBatchJobs(): Promise<BatchJob[]>;

  // Schedules
  listSchedules(): Promise<Schedule[]>;
  describeSchedule(scheduleId: string): Promise<Schedule>;
  toggleSchedule(scheduleId: string, pause: boolean): Promise<void>;
  triggerSchedule(scheduleId: string): Promise<void>;
  deleteSchedule(scheduleId: string): Promise<void>;

  // Task Queues
  describeTaskQueue(taskQueue: string): Promise<TaskQueueInfo>;
}

export function createTemporalClient(config: ClientConfig): TemporalClient {
  const { baseUrl, apiKey } = config;
  let namespace = config.namespace;

  // CSRF token management
  let csrfToken: string | null = null;

  async function fetchCsrfToken(): Promise<string> {
    const response = await fetch(`${baseUrl}/api/v1/settings`, {
      credentials: "include",
    });

    // Extract CSRF token from Set-Cookie header
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const match = setCookie.match(/_csrf=([^;]+)/);
      if (match) {
        csrfToken = match[1] ?? null;
      }
    }

    return csrfToken ?? "";
  }

  async function request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<T> {
    // Ensure we have a CSRF token for non-GET requests
    if (method !== "GET" && !csrfToken) {
      await fetchCsrfToken();
    }

    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // Include CSRF token for mutating requests
    if (csrfToken && method !== "GET") {
      headers["X-CSRF-Token"] = csrfToken;
      headers["Cookie"] = `_csrf=${csrfToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorBody = (await response.json()) as { message?: string };
        errorMessage = errorBody.message || errorMessage;
      } catch {
        // Ignore JSON parse errors
      }
      throw new TemporalApiError(errorMessage, response.status);
    }

    // Update CSRF token from response if present
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const match = setCookie.match(/_csrf=([^;]+)/);
      if (match) {
        csrfToken = match[1] ?? null;
      }
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  return {
    // Connection
    async getSettings(): Promise<ServerSettings> {
      return request("GET", "/api/v1/settings");
    },

    async testConnection(): Promise<boolean> {
      try {
        await this.getSettings();
        return true;
      } catch {
        return false;
      }
    },

    setNamespace(ns: string): void {
      namespace = ns;
    },

    // Namespaces
    async listNamespaces(): Promise<Namespace[]> {
      interface RawNamespace {
        namespaceInfo: {
          name: string;
          state: string;
          description?: string;
          ownerEmail?: string;
        };
        config?: {
          workflowExecutionRetentionTtl?: string;
          historyArchivalState?: string;
          visibilityArchivalState?: string;
        };
      }
      const result = await request<{ namespaces: RawNamespace[] }>(
        "GET",
        "/api/v1/namespaces"
      );
      return (result.namespaces || []).map((ns) => ({
        name: ns.namespaceInfo.name,
        state: ns.namespaceInfo.state,
        description: ns.namespaceInfo.description,
        ownerEmail: ns.namespaceInfo.ownerEmail,
        retention: ns.config?.workflowExecutionRetentionTtl,
        historyArchivalState: ns.config?.historyArchivalState,
        visibilityArchivalState: ns.config?.visibilityArchivalState,
      }));
    },

    async describeNamespace(ns: string): Promise<Namespace> {
      const result = await request<{ namespaceInfo: Namespace }>(
        "GET",
        `/api/v1/namespaces/${ns}`
      );
      return result.namespaceInfo;
    },

    // Workflows
    async listWorkflows(
      options?: ListWorkflowsOptions
    ): Promise<PaginatedResult<WorkflowExecution>> {
      // Build query string for GET request
      const params = new URLSearchParams();
      if (options?.query) params.set("query", options.query);
      if (options?.pageSize) params.set("pageSize", String(options.pageSize));
      if (options?.pageToken) params.set("nextPageToken", options.pageToken);

      const queryString = params.toString();
      const path = `/api/v1/namespaces/${namespace}/workflows${queryString ? `?${queryString}` : ""}`;

      const result = await request<{
        executions: RawWorkflowExecution[];
        nextPageToken?: string;
      }>("GET", path);

      // Transform raw API response to our WorkflowExecution type
      const items = (result.executions || []).map(transformWorkflowExecution);

      return {
        items,
        nextPageToken: result.nextPageToken,
      };
    },

    async describeWorkflow(
      workflowId: string,
      runId?: string
    ): Promise<WorkflowDescription> {
      // Temporal UI API uses query param for runId, not path segment
      const params = new URLSearchParams();
      if (runId) params.set("runId", runId);
      const queryString = params.toString();
      const path = `/api/v1/namespaces/${namespace}/workflows/${encodeURIComponent(workflowId)}${queryString ? `?${queryString}` : ""}`;

      const raw = await request<RawWorkflowDescription>("GET", path);
      return transformWorkflowDescription(raw);
    },

    async getWorkflowHistory(
      workflowId: string,
      runId?: string
    ): Promise<PaginatedResult<HistoryEvent>> {
      // Temporal UI API uses query param for runId
      const params = new URLSearchParams();
      if (runId) params.set("runId", runId);
      const queryString = params.toString();
      const path = `/api/v1/namespaces/${namespace}/workflows/${encodeURIComponent(workflowId)}/history${queryString ? `?${queryString}` : ""}`;

      const result = await request<{
        history: { events: HistoryEvent[] };
        nextPageToken?: string;
      }>("GET", path);

      return {
        items: result.history?.events || [],
        nextPageToken: result.nextPageToken,
      };
    },

    async signalWorkflow(
      workflowId: string,
      signal: string,
      payload?: unknown
    ): Promise<void> {
      await request(
        "POST",
        `/api/v1/namespaces/${namespace}/workflows/${workflowId}/signal`,
        { signalName: signal, input: payload }
      );
    },

    async queryWorkflow(
      workflowId: string,
      queryType: string,
      args?: unknown
    ): Promise<unknown> {
      const result = await request<{ queryResult: unknown }>(
        "POST",
        `/api/v1/namespaces/${namespace}/workflows/${workflowId}/query`,
        { queryType, queryArgs: args }
      );
      return result.queryResult;
    },

    async cancelWorkflow(workflowId: string): Promise<void> {
      await request(
        "POST",
        `/api/v1/namespaces/${namespace}/workflows/${workflowId}/cancel`
      );
    },

    async terminateWorkflow(workflowId: string, reason?: string): Promise<void> {
      await request(
        "POST",
        `/api/v1/namespaces/${namespace}/workflows/${workflowId}/terminate`,
        { reason }
      );
    },

    // Activities
    async pauseActivity(workflowId: string, activityId: string): Promise<void> {
      await request("POST", `/api/v1/namespaces/${namespace}/activities/pause`, {
        workflowId,
        activityId,
      });
    },

    async unpauseActivity(
      workflowId: string,
      activityId: string
    ): Promise<void> {
      await request(
        "POST",
        `/api/v1/namespaces/${namespace}/activities/unpause`,
        { workflowId, activityId }
      );
    },

    async resetActivity(workflowId: string, activityId: string): Promise<void> {
      await request("POST", `/api/v1/namespaces/${namespace}/activities/reset`, {
        workflowId,
        activityId,
      });
    },

    // Batch Operations
    async startBatchOperation(op: BatchOperation): Promise<BatchJob> {
      return request(
        "POST",
        `/api/v1/namespaces/${namespace}/batch-operations`,
        {
          query: op.query,
          operationType: op.type,
          reason: op.reason,
          signalName: op.signalName,
          signalInput: op.signalInput,
        }
      );
    },

    async describeBatchJob(jobId: string): Promise<BatchJob> {
      return request(
        "GET",
        `/api/v1/namespaces/${namespace}/batch-operations/${jobId}`
      );
    },

    async listBatchJobs(): Promise<BatchJob[]> {
      const result = await request<{ operations: BatchJob[] }>(
        "GET",
        `/api/v1/namespaces/${namespace}/batch-operations`
      );
      return result.operations || [];
    },

    // Schedules
    async listSchedules(): Promise<Schedule[]> {
      const result = await request<{ schedules: RawSchedule[] }>(
        "GET",
        `/api/v1/namespaces/${namespace}/schedules`
      );
      // Transform schedules to our format
      return (result.schedules || []).map(transformSchedule);
    },

    async describeSchedule(scheduleId: string): Promise<Schedule> {
      const raw = await request<RawSchedule>(
        "GET",
        `/api/v1/namespaces/${namespace}/schedules/${scheduleId}`
      );
      return transformSchedule({ ...raw, scheduleId });
    },

    async toggleSchedule(scheduleId: string, pause: boolean): Promise<void> {
      const action = pause ? "pause" : "unpause";
      await request(
        "POST",
        `/api/v1/namespaces/${namespace}/schedules/${scheduleId}/${action}`
      );
    },

    async triggerSchedule(scheduleId: string): Promise<void> {
      await request(
        "POST",
        `/api/v1/namespaces/${namespace}/schedules/${scheduleId}/trigger`
      );
    },

    async deleteSchedule(scheduleId: string): Promise<void> {
      await request(
        "DELETE",
        `/api/v1/namespaces/${namespace}/schedules/${scheduleId}`
      );
    },

    // Task Queues
    async describeTaskQueue(taskQueue: string): Promise<TaskQueueInfo> {
      return request(
        "GET",
        `/api/v1/namespaces/${namespace}/task-queues/${taskQueue}`
      );
    },
  };
}
