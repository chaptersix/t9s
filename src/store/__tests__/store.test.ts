/**
 * Store Unit Tests
 */

import { describe, test, expect, mock } from "bun:test";
import { createStore } from "../index";
import type { WorkflowExecution } from "../../data/temporal/types";

describe("Store", () => {
  describe("createStore", () => {
    test("initializes with default state", () => {
      const store = createStore();
      const state = store.getState();

      expect(state.connectionStatus).toBe("disconnected");
      expect(state.namespace).toBe("default");
      expect(state.activeView).toBe("workflows");
      expect(state.workflows).toEqual([]);
      expect(state.selectedWorkflowId).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe("dispatch", () => {
    test("SET_CONNECTION_STATUS updates connection status", () => {
      const store = createStore();

      store.dispatch({ type: "SET_CONNECTION_STATUS", payload: "connected" });

      expect(store.getState().connectionStatus).toBe("connected");
    });

    test("SET_WORKFLOWS updates workflows array", () => {
      const store = createStore();
      const workflows: WorkflowExecution[] = [
        {
          workflowId: "order-123",
          runId: "run-abc",
          workflowType: "OrderWorkflow",
          status: "RUNNING",
          startTime: "2026-02-06T00:00:00Z",
          taskQueue: "main-queue",
        },
        {
          workflowId: "payment-456",
          runId: "run-def",
          workflowType: "PaymentWorkflow",
          status: "COMPLETED",
          startTime: "2026-02-06T01:00:00Z",
          taskQueue: "payment-queue",
        },
      ];

      store.dispatch({ type: "SET_WORKFLOWS", payload: workflows });

      expect(store.getState().workflows).toHaveLength(2);
      expect(store.getState().workflows[0]?.workflowId).toBe("order-123");
    });

    test("SET_ACTIVE_VIEW updates active view", () => {
      const store = createStore();

      store.dispatch({ type: "SET_ACTIVE_VIEW", payload: "schedules" });

      expect(store.getState().activeView).toBe("schedules");
    });

    test("SET_ERROR updates error state", () => {
      const store = createStore();

      store.dispatch({ type: "SET_ERROR", payload: "Connection failed" });
      expect(store.getState().error).toBe("Connection failed");

      store.dispatch({ type: "SET_ERROR", payload: null });
      expect(store.getState().error).toBeNull();
    });

    test("TOGGLE_COMMAND_PALETTE toggles command palette state", () => {
      const store = createStore();

      expect(store.getState().commandPaletteOpen).toBe(false);

      store.dispatch({ type: "TOGGLE_COMMAND_PALETTE" });
      expect(store.getState().commandPaletteOpen).toBe(true);

      store.dispatch({ type: "TOGGLE_COMMAND_PALETTE" });
      expect(store.getState().commandPaletteOpen).toBe(false);
    });

    test("SET_SELECTED_WORKFLOW updates selected workflow", () => {
      const store = createStore();

      store.dispatch({ type: "SET_SELECTED_WORKFLOW", payload: "order-123" });
      expect(store.getState().selectedWorkflowId).toBe("order-123");

      store.dispatch({ type: "SET_SELECTED_WORKFLOW", payload: null });
      expect(store.getState().selectedWorkflowId).toBeNull();
    });
  });

  describe("subscribe", () => {
    test("notifies listeners on state change", () => {
      const store = createStore();
      const listener = mock(() => {});

      store.subscribe(listener);
      store.dispatch({ type: "SET_CONNECTION_STATUS", payload: "connected" });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("passes new and previous state to listener", () => {
      const store = createStore();
      let receivedState: unknown = null;
      let receivedPrevState: unknown = null;

      store.subscribe((state, prevState) => {
        receivedState = state;
        receivedPrevState = prevState;
      });

      store.dispatch({ type: "SET_CONNECTION_STATUS", payload: "connected" });

      expect((receivedState as { connectionStatus: string }).connectionStatus).toBe("connected");
      expect((receivedPrevState as { connectionStatus: string }).connectionStatus).toBe("disconnected");
    });

    test("does not notify if state unchanged", () => {
      const store = createStore();
      const listener = mock(() => {});

      // First set to connected
      store.dispatch({ type: "SET_CONNECTION_STATUS", payload: "connected" });

      store.subscribe(listener);

      // Dispatch unknown action (no change)
      // @ts-expect-error - testing unknown action
      store.dispatch({ type: "UNKNOWN_ACTION" });

      expect(listener).not.toHaveBeenCalled();
    });

    test("unsubscribe stops notifications", () => {
      const store = createStore();
      const listener = mock(() => {});

      const unsubscribe = store.subscribe(listener);
      store.dispatch({ type: "SET_CONNECTION_STATUS", payload: "connected" });

      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      store.dispatch({ type: "SET_CONNECTION_STATUS", payload: "disconnected" });

      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });

  describe("select", () => {
    test("returns selected value from state", () => {
      const store = createStore();

      store.dispatch({ type: "SET_NAMESPACE", payload: "production" });

      const namespace = store.select((state) => state.namespace);
      expect(namespace).toBe("production");
    });

    test("works with complex selectors", () => {
      const store = createStore();
      const workflows: WorkflowExecution[] = [
        {
          workflowId: "order-1",
          runId: "run-1",
          workflowType: "OrderWorkflow",
          status: "RUNNING",
          startTime: "2026-02-06T00:00:00Z",
          taskQueue: "queue",
        },
        {
          workflowId: "order-2",
          runId: "run-2",
          workflowType: "OrderWorkflow",
          status: "COMPLETED",
          startTime: "2026-02-06T01:00:00Z",
          taskQueue: "queue",
        },
      ];

      store.dispatch({ type: "SET_WORKFLOWS", payload: workflows });

      const runningCount = store.select(
        (state) => state.workflows.filter((w) => w.status === "RUNNING").length
      );
      expect(runningCount).toBe(1);
    });
  });
});
