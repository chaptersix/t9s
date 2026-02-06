/**
 * Application state store
 *
 * Zustand-like reactive store for managing UI and data state
 */

import type { AppState, Action } from "./types";
import { initialState } from "./types";
import { logger } from "../utils/logger";

export type Listener = (state: AppState, prevState: AppState) => void;
export type Selector<T> = (state: AppState) => T;
export type Unsubscribe = () => void;

export interface Store {
  getState(): AppState;
  dispatch(action: Action): void;
  subscribe(listener: Listener): Unsubscribe;
  select<T>(selector: Selector<T>): T;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_CONNECTION_STATUS":
      return { ...state, connectionStatus: action.payload };

    case "SET_NAMESPACE":
      return { ...state, namespace: action.payload };

    case "SET_NAMESPACES":
      return { ...state, namespaces: action.payload };

    case "SET_ACTIVE_VIEW":
      return { ...state, activeView: action.payload };

    case "SET_WORKFLOWS":
      return { ...state, workflows: action.payload };

    case "SET_SELECTED_WORKFLOW":
      return { ...state, selectedWorkflowId: action.payload };

    case "SET_WORKFLOW_DETAIL":
      return { ...state, workflowDetail: action.payload };

    case "SET_WORKFLOW_HISTORY":
      return { ...state, workflowHistory: action.payload };

    case "SET_SCHEDULES":
      return { ...state, schedules: action.payload };

    case "SET_SELECTED_SCHEDULE":
      return { ...state, selectedScheduleId: action.payload };

    case "SET_SCHEDULE_DETAIL":
      return { ...state, scheduleDetail: action.payload };

    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload };

    case "SET_FILTERS":
      return { ...state, filters: action.payload };

    case "TOGGLE_COMMAND_PALETTE":
      return { ...state, commandPaletteOpen: !state.commandPaletteOpen };

    case "SET_COMMAND_INPUT_OPEN":
      return { ...state, commandInputOpen: action.payload };

    case "SET_NAMESPACE_SELECTOR_OPEN":
      return { ...state, namespaceSelectorOpen: action.payload };

    case "SET_HELP_OVERLAY_OPEN":
      return { ...state, helpOverlayOpen: action.payload };

    case "SET_POLLING_ENABLED":
      return { ...state, pollingEnabled: action.payload };

    case "SET_POLLING_INTERVAL":
      return { ...state, pollingInterval: action.payload };

    case "SET_IS_POLLING":
      return { ...state, isPolling: action.payload };

    case "SET_LAST_POLLED":
      return { ...state, lastPolledAt: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload };

    case "INCREMENT_ERROR_COUNT":
      return { ...state, errorCount: state.errorCount + 1 };

    case "RESET_ERROR_COUNT":
      return { ...state, errorCount: 0 };

    case "SET_SAVED_VIEWS":
      return { ...state, savedViews: action.payload };

    case "SET_ACTIVE_SAVED_VIEW":
      return { ...state, activeSavedViewId: action.payload };

    default:
      return state;
  }
}

export function createStore(): Store {
  let state: AppState = initialState;
  const listeners = new Set<Listener>();

  return {
    getState() {
      return state;
    },

    dispatch(action: Action) {
      const prevState = state;
      state = reducer(state, action);

      if (state !== prevState) {
        // Skip logging noisy polling actions (errors still logged separately below)
        const pollingActions = [
          "SET_IS_POLLING",
          "SET_LAST_POLLED",
          "SET_WORKFLOWS",
          "SET_SCHEDULES",
          "SET_ERROR",
          "RESET_ERROR_COUNT",
        ];
        const isPollingAction = pollingActions.includes(action.type);

        if (!isPollingAction) {
          logger.debug("STATE", `Action dispatched: ${action.type}`, {
            action: action.type,
            hasPayload: "payload" in action,
          });
        }

        // Log specific important state changes
        if (prevState.activeView !== state.activeView) {
          logger.viewChange(prevState.activeView, state.activeView);
        }
        if (prevState.connectionStatus !== state.connectionStatus) {
          logger.stateChange("connectionStatus", prevState.connectionStatus, state.connectionStatus);
        }
        if (prevState.selectedWorkflowId !== state.selectedWorkflowId) {
          logger.stateChange("selectedWorkflowId", prevState.selectedWorkflowId, state.selectedWorkflowId);
        }
        if (prevState.commandPaletteOpen !== state.commandPaletteOpen) {
          logger.stateChange("commandPaletteOpen", prevState.commandPaletteOpen, state.commandPaletteOpen);
        }
        if (prevState.error !== state.error && state.error) {
          logger.error("STATE", `Error occurred: ${state.error}`);
        }

        listeners.forEach((listener) => listener(state, prevState));
      }
    },

    subscribe(listener: Listener): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    select<T>(selector: Selector<T>): T {
      return selector(state);
    },
  };
}

export * from "./types";
export * from "./actions";
export * from "./selectors";
