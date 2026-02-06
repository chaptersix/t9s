/**
 * Temporal API types
 *
 * Types matching the Temporal UI Server HTTP API responses
 */

export interface WorkflowExecution {
  workflowId: string;
  runId: string;
  workflowType: string;
  status: string;
  startTime: string;
  closeTime?: string;
  taskQueue: string;
  historyLength?: number;
  memo?: Record<string, unknown>;
  searchAttributes?: Record<string, unknown>;
  parentWorkflowId?: string;
  parentRunId?: string;
}

export interface WorkflowDescription {
  workflowId: string;
  runId: string;
  workflowType: string;
  status: string;
  startTime: string;
  closeTime?: string;
  taskQueue: string;
  historyLength: number;
  executionTime?: string;
  memo?: Record<string, unknown>;
  searchAttributes?: Record<string, unknown>;
  input?: unknown;
  result?: unknown;
  failure?: WorkflowFailure;
  parentWorkflowId?: string;
  parentRunId?: string;
  pendingActivities?: PendingActivity[];
  pendingChildren?: PendingChild[];
}

export interface WorkflowFailure {
  message: string;
  source?: string;
  stackTrace?: string;
  cause?: WorkflowFailure;
}

export interface PendingActivity {
  activityId: string;
  activityType: string;
  state: string;
  attempt: number;
  maximumAttempts: number;
  scheduledTime?: string;
  expirationTime?: string;
  lastStartedTime?: string;
  lastHeartbeatTime?: string;
  heartbeatDetails?: unknown;
  lastFailure?: string;
}

export interface PendingChild {
  workflowId: string;
  runId: string;
  workflowType: string;
  initiatedId: number;
}

export interface HistoryEvent {
  eventId: number;
  eventType: string;
  eventTime: string;
  attributes: Record<string, unknown>;
}

export interface Schedule {
  scheduleId: string;
  workflowType: string;
  state: "ACTIVE" | "PAUSED";
  spec: ScheduleSpec;
  action: ScheduleAction;
  info: ScheduleInfo;
}

export interface ScheduleSpec {
  calendars?: CalendarSpec[];
  intervals?: IntervalSpec[];
  cronStrings?: string[];
}

export interface CalendarSpec {
  second?: string;
  minute?: string;
  hour?: string;
  dayOfMonth?: string;
  month?: string;
  dayOfWeek?: string;
  year?: string;
  comment?: string;
}

export interface IntervalSpec {
  every: string;
  offset?: string;
}

export interface ScheduleAction {
  workflow: {
    workflowId: string;
    workflowType: string;
    taskQueue: string;
    input?: unknown;
  };
}

export interface ScheduleInfo {
  numActions: number;
  numActionsMissedCatchupWindow: number;
  runningActions: { workflowId: string; runId: string }[];
  recentActions: { startTime: string; actualTime: string }[];
  nextActionTimes: string[];
  createdAt: string;
  lastUpdatedAt: string;
}

export interface TaskQueueInfo {
  name: string;
  pollers: TaskQueuePoller[];
  taskQueueStatus?: {
    backlogCountHint: number;
    readLevel: number;
    ackLevel: number;
    ratePerSecond: number;
  };
}

export interface TaskQueuePoller {
  lastAccessTime: string;
  identity: string;
  ratePerSecond: number;
  workerVersionCapabilities?: {
    buildId?: string;
  };
}

export interface Namespace {
  name: string;
  state: string;
  description?: string;
  ownerEmail?: string;
  retention?: string;
  historyArchivalState?: string;
  visibilityArchivalState?: string;
}

export interface ServerSettings {
  auth?: {
    enabled: boolean;
  };
  defaultNamespace?: string;
  showTemporalSystemNamespace?: boolean;
  version?: string;
  codec?: {
    endpoint?: string;
    passAccessToken?: boolean;
  };
}

// Pagination
export interface PaginatedResult<T> {
  items: T[];
  nextPageToken?: string;
}

// Batch operations
export interface BatchJob {
  jobId: string;
  state: "RUNNING" | "COMPLETED" | "FAILED";
  startTime: string;
  closeTime?: string;
  totalOperationCount: number;
  completeOperationCount: number;
  failureOperationCount: number;
}

export interface BatchOperation {
  type: "CANCEL" | "TERMINATE" | "SIGNAL" | "RESET";
  query: string;
  reason?: string;
  signalName?: string;
  signalInput?: unknown;
}
