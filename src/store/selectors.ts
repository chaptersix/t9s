/**
 * State selectors
 */

import type { AppState, WorkflowStatus } from "./types";
import type { WorkflowExecution } from "../data/temporal/types";

// Connection selectors
export const selectConnectionStatus = (state: AppState) =>
  state.connectionStatus;
export const selectIsConnected = (state: AppState) =>
  state.connectionStatus === "connected";
export const selectNamespace = (state: AppState) => state.namespace;
export const selectNamespaces = (state: AppState) => state.namespaces;
export const selectEnvironment = (state: AppState) => state.environment;

// Navigation selectors
export const selectActiveView = (state: AppState) => state.activeView;
export const selectFocusedPane = (state: AppState) => state.focusedPane;

// Workflow selectors
export const selectWorkflows = (state: AppState) => state.workflows;
export const selectSelectedWorkflowId = (state: AppState) =>
  state.selectedWorkflowId;
export const selectWorkflowDetail = (state: AppState) => state.workflowDetail;
export const selectWorkflowHistory = (state: AppState) => state.workflowHistory;

export const selectSelectedWorkflow = (
  state: AppState
): WorkflowExecution | undefined => {
  if (!state.selectedWorkflowId) return undefined;
  return state.workflows.find(
    (w) => w.workflowId === state.selectedWorkflowId
  );
};

export const selectFilteredWorkflows = (state: AppState): WorkflowExecution[] => {
  let workflows = state.workflows;

  // Filter by status
  if (state.filters.status && state.filters.status.length > 0) {
    workflows = workflows.filter((w) =>
      state.filters.status!.includes(w.status as WorkflowStatus)
    );
  }

  // Filter by workflow type
  if (state.filters.workflowType) {
    workflows = workflows.filter(
      (w) => w.workflowType === state.filters.workflowType
    );
  }

  // Filter by search query (searches workflow ID and type)
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    workflows = workflows.filter(
      (w) =>
        w.workflowId.toLowerCase().includes(query) ||
        w.workflowType.toLowerCase().includes(query)
    );
  }

  return workflows;
};

export const selectWorkflowCount = (state: AppState) => state.workflows.length;

export const selectWorkflowsByStatus = (state: AppState) => {
  const byStatus: Record<string, number> = {};
  for (const workflow of state.workflows) {
    byStatus[workflow.status] = (byStatus[workflow.status] || 0) + 1;
  }
  return byStatus;
};

// Schedule selectors
export const selectSchedules = (state: AppState) => state.schedules;

// UI selectors
export const selectCommandPaletteOpen = (state: AppState) =>
  state.commandPaletteOpen;
export const selectSearchQuery = (state: AppState) => state.searchQuery;
export const selectFilters = (state: AppState) => state.filters;

// Polling selectors
export const selectPollingEnabled = (state: AppState) => state.pollingEnabled;
export const selectPollingInterval = (state: AppState) => state.pollingInterval;

// Error selectors
export const selectError = (state: AppState) => state.error;
