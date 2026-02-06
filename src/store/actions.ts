/**
 * Action creators
 */

import type {
  Action,
  ConnectionStatus,
  ViewType,
  FilterCriteria,
} from "./types";
import type {
  WorkflowExecution,
  WorkflowDescription,
  HistoryEvent,
  Schedule,
} from "../data/temporal/types";

export const setConnectionStatus = (status: ConnectionStatus): Action => ({
  type: "SET_CONNECTION_STATUS",
  payload: status,
});

export const setNamespace = (namespace: string): Action => ({
  type: "SET_NAMESPACE",
  payload: namespace,
});

export const setActiveView = (view: ViewType): Action => ({
  type: "SET_ACTIVE_VIEW",
  payload: view,
});

export const setWorkflows = (workflows: WorkflowExecution[]): Action => ({
  type: "SET_WORKFLOWS",
  payload: workflows,
});

export const setSelectedWorkflow = (workflowId: string | null): Action => ({
  type: "SET_SELECTED_WORKFLOW",
  payload: workflowId,
});

export const setWorkflowDetail = (
  detail: WorkflowDescription | null
): Action => ({
  type: "SET_WORKFLOW_DETAIL",
  payload: detail,
});

export const setWorkflowHistory = (events: HistoryEvent[]): Action => ({
  type: "SET_WORKFLOW_HISTORY",
  payload: events,
});

export const setSchedules = (schedules: Schedule[]): Action => ({
  type: "SET_SCHEDULES",
  payload: schedules,
});

export const setSearchQuery = (query: string): Action => ({
  type: "SET_SEARCH_QUERY",
  payload: query,
});

export const setFilters = (filters: FilterCriteria): Action => ({
  type: "SET_FILTERS",
  payload: filters,
});

export const toggleCommandPalette = (): Action => ({
  type: "TOGGLE_COMMAND_PALETTE",
});

export const setPollingEnabled = (enabled: boolean): Action => ({
  type: "SET_POLLING_ENABLED",
  payload: enabled,
});

export const setError = (error: string | null): Action => ({
  type: "SET_ERROR",
  payload: error,
});
