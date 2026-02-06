/**
 * State types and interfaces
 */

import type {
  WorkflowExecution,
  WorkflowDescription,
  HistoryEvent,
  Schedule,
  TaskQueueInfo,
  Namespace,
} from "../data/temporal/types";
import type { SavedView } from "../config/savedViews";

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "error";

export type ViewType =
  | "workflows"
  | "workflow-detail"
  | "schedules"
  | "schedule-detail"
  | "task-queues";

export type WorkflowStatus =
  | "Running"
  | "Completed"
  | "Failed"
  | "Canceled"
  | "Terminated"
  | "TimedOut"
  | "ContinuedAsNew";

export interface FilterCriteria {
  status?: WorkflowStatus[];
  workflowType?: string;
  query?: string;
}

export interface Environment {
  name: string;
  uiServerUrl: string;
  namespace: string;
  apiKey?: string;
}

export interface AppState {
  // Connection
  environment: Environment;
  connectionStatus: ConnectionStatus;
  namespace: string;
  namespaces: Namespace[];

  // Navigation
  activeView: ViewType;
  focusedPane: string;

  // Data
  workflows: WorkflowExecution[];
  selectedWorkflowId: string | null;
  workflowDetail: WorkflowDescription | null;
  workflowHistory: HistoryEvent[];
  schedules: Schedule[];
  selectedScheduleId: string | null;
  scheduleDetail: Schedule | null;
  taskQueues: Map<string, TaskQueueInfo>;

  // UI State
  commandPaletteOpen: boolean;
  commandInputOpen: boolean;
  namespaceSelectorOpen: boolean;
  helpOverlayOpen: boolean;
  searchQuery: string;
  filters: FilterCriteria;
  savedViews: SavedView[];
  activeSavedViewId: string | null;

  // Polling
  pollingEnabled: boolean;
  pollingInterval: number;
  lastPolledAt: string | null;
  isPolling: boolean;

  // Error state
  error: string | null;
  errorCount: number;
}

export const initialState: AppState = {
  environment: {
    name: "default",
    uiServerUrl: "http://localhost:8233",
    namespace: "default",
  },
  connectionStatus: "disconnected",
  namespace: "default",
  namespaces: [],

  activeView: "workflows",
  focusedPane: "main",

  workflows: [],
  selectedWorkflowId: null,
  workflowDetail: null,
  workflowHistory: [],
  schedules: [],
  selectedScheduleId: null,
  scheduleDetail: null,
  taskQueues: new Map(),

  commandPaletteOpen: false,
  commandInputOpen: false,
  namespaceSelectorOpen: false,
  helpOverlayOpen: false,
  searchQuery: "",
  filters: {},
  savedViews: [],
  activeSavedViewId: null,

  pollingEnabled: true,
  pollingInterval: 3000,
  lastPolledAt: null,
  isPolling: false,

  error: null,
  errorCount: 0,
};

// Action types
export type Action =
  | { type: "SET_CONNECTION_STATUS"; payload: ConnectionStatus }
  | { type: "SET_NAMESPACE"; payload: string }
  | { type: "SET_NAMESPACES"; payload: Namespace[] }
  | { type: "SET_ACTIVE_VIEW"; payload: ViewType }
  | { type: "SET_WORKFLOWS"; payload: WorkflowExecution[] }
  | { type: "SET_SELECTED_WORKFLOW"; payload: string | null }
  | { type: "SET_WORKFLOW_DETAIL"; payload: WorkflowDescription | null }
  | { type: "SET_WORKFLOW_HISTORY"; payload: HistoryEvent[] }
  | { type: "SET_SCHEDULES"; payload: Schedule[] }
  | { type: "SET_SELECTED_SCHEDULE"; payload: string | null }
  | { type: "SET_SCHEDULE_DETAIL"; payload: Schedule | null }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "SET_FILTERS"; payload: FilterCriteria }
  | { type: "TOGGLE_COMMAND_PALETTE" }
  | { type: "SET_COMMAND_INPUT_OPEN"; payload: boolean }
  | { type: "SET_NAMESPACE_SELECTOR_OPEN"; payload: boolean }
  | { type: "SET_HELP_OVERLAY_OPEN"; payload: boolean }
  | { type: "SET_POLLING_ENABLED"; payload: boolean }
  | { type: "SET_POLLING_INTERVAL"; payload: number }
  | { type: "SET_IS_POLLING"; payload: boolean }
  | { type: "SET_LAST_POLLED"; payload: string }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "INCREMENT_ERROR_COUNT" }
  | { type: "RESET_ERROR_COUNT" }
  | { type: "SET_SAVED_VIEWS"; payload: SavedView[] }
  | { type: "SET_ACTIVE_SAVED_VIEW"; payload: string | null };
