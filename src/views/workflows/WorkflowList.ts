/**
 * Workflow List View - displays list of workflow executions
 */

import {
  BoxRenderable,
  type BoxOptions,
  type RenderContext,
} from "@opentui/core";
import type { Store } from "../../store";
import type { WorkflowExecution } from "../../data/temporal/types";
import { Table, type Column } from "../../components/common";
import { formatRelativeTime, truncate } from "../../utils/time";

export interface WorkflowListOptions extends BoxOptions {
  store: Store;
  onSelectWorkflow?: (workflow: WorkflowExecution) => void;
}

function getStatusIndicator(status: string | undefined): string {
  switch ((status ?? "UNKNOWN").toUpperCase()) {
    case "RUNNING":
      return "● Running";
    case "COMPLETED":
      return "✓ Completed";
    case "FAILED":
      return "✗ Failed";
    case "CANCELED":
      return "○ Canceled";
    case "TERMINATED":
      return "⊘ Terminated";
    case "TIMED_OUT":
      return "⏱ TimedOut";
    case "CONTINUED_AS_NEW":
      return "→ Continued";
    default:
      return status ?? "UNKNOWN";
  }
}

const WORKFLOW_COLUMNS: Column<WorkflowExecution>[] = [
  {
    key: "workflowId",
    header: "WORKFLOW ID",
    width: 30,
    render: (item) => truncate(item.workflowId, 28),
  },
  {
    key: "workflowType",
    header: "TYPE",
    width: 25,
    render: (item) => truncate(item.workflowType, 23),
  },
  {
    key: "status",
    header: "STATUS",
    width: 15,
    render: (item) => getStatusIndicator(item.status),
  },
  {
    key: "startTime",
    header: "STARTED",
    width: 12,
    render: (item) => formatRelativeTime(item.startTime),
  },
  {
    key: "taskQueue",
    header: "TASK QUEUE",
    width: "auto",
    render: (item) => truncate(item.taskQueue, 20),
  },
];

export class WorkflowList extends BoxRenderable {
  private store: Store;
  private unsubscribe: (() => void) | null = null;
  private table: Table<WorkflowExecution>;
  private onSelectCallback?: (workflow: WorkflowExecution) => void;

  constructor(ctx: RenderContext, options: WorkflowListOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "workflow-list",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    });

    this.store = options.store;
    this.onSelectCallback = options.onSelectWorkflow;

    // Create table
    const state = this.store.getState();
    this.table = new Table<WorkflowExecution>(ctx, {
      id: "workflow-table",
      columns: WORKFLOW_COLUMNS,
      data: state.workflows,
      emptyMessage: state.connectionStatus === "connected"
        ? "No workflows found"
        : "Not connected to Temporal",
      getRowId: (item) => `${item.workflowId}-${item.runId}`,
      onSelect: (workflow) => {
        this.store.dispatch({
          type: "SET_SELECTED_WORKFLOW",
          payload: workflow.workflowId,
        });
        if (this.onSelectCallback) {
          this.onSelectCallback(workflow);
        }
      },
    });

    this.add(this.table);

    // Subscribe to store changes
    this.unsubscribe = this.store.subscribe((state, prevState) => {
      // Update table data when workflows change
      if (state.workflows !== prevState.workflows) {
        this.table.setData(state.workflows);
      }
    });
  }

  // Navigation methods - called by key handler
  moveUp(): void {
    this.table.moveUp();
  }

  moveDown(): void {
    this.table.moveDown();
  }

  moveToTop(): void {
    this.table.moveToTop();
  }

  moveToBottom(): void {
    this.table.moveToBottom();
  }

  pageUp(): void {
    this.table.pageUp();
  }

  pageDown(): void {
    this.table.pageDown();
  }

  select(): void {
    this.table.select();
  }

  get selectedWorkflow(): WorkflowExecution | undefined {
    return this.table.selectedItem;
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    super.destroy();
  }
}
