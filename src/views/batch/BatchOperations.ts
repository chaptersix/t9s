/**
 * BatchOperations view - allows performing batch actions on workflows
 */

import {
  BoxRenderable,
  TextRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  dim,
  bold,
  cyan,
  red,
} from "@opentui/core";
import type { BatchJob, BatchOperation } from "../../data/temporal/types";
import { Table, type Column } from "../../components/common/Table";
import { formatRelativeTime } from "../../utils/time";

export interface BatchOperationsOptions extends Omit<BoxOptions, "flexDirection"> {
  onStartBatch?: (operation: BatchOperation) => void;
  onViewJob?: (job: BatchJob) => void;
}

const JOB_COLUMNS: Column<BatchJob>[] = [
  {
    key: "jobId",
    header: "JOB ID",
    width: 30,
    render: (job) => job.jobId.slice(0, 28),
  },
  {
    key: "state",
    header: "STATE",
    width: 12,
    render: (job) => job.state,
  },
  {
    key: "progress",
    header: "PROGRESS",
    width: 15,
    render: (job) => `${job.completeOperationCount}/${job.totalOperationCount}`,
  },
  {
    key: "failed",
    header: "FAILED",
    width: 8,
    render: (job) => String(job.failureOperationCount),
  },
  {
    key: "startTime",
    header: "STARTED",
    width: "auto",
    render: (job) => formatRelativeTime(job.startTime),
  },
];

type OperationType = "CANCEL" | "TERMINATE" | "SIGNAL";

const OPERATION_TYPES: { type: OperationType; label: string; description: string }[] = [
  { type: "CANCEL", label: "Cancel", description: "Gracefully cancel matching workflows" },
  { type: "TERMINATE", label: "Terminate", description: "Immediately terminate matching workflows" },
  { type: "SIGNAL", label: "Signal", description: "Send a signal to matching workflows" },
];

export class BatchOperations extends BoxRenderable {
  private jobs: BatchJob[] = [];
  private selectedOperationType = 0;
  private queryInput = "";
  private reasonInput = "";
  private signalNameInput = "";
  private isInputMode = false;
  private activeInput: "query" | "reason" | "signal" = "query";

  private headerText: TextRenderable;
  private operationSelector: BoxRenderable;
  private queryBox: BoxRenderable;
  private jobsTable: Table<BatchJob>;
  private statusText: TextRenderable;

  private onStartBatch?: (operation: BatchOperation) => void;
  private onViewJob?: (job: BatchJob) => void;

  constructor(ctx: RenderContext, options: BatchOperationsOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "batch-operations",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    });

    this.onStartBatch = options.onStartBatch;
    this.onViewJob = options.onViewJob;

    // Header
    this.headerText = new TextRenderable(ctx, {
      id: "batch-header",
      height: 2,
      width: "100%",
      paddingLeft: 1,
      paddingTop: 1,
    });
    this.headerText.content = t`${bold("Batch Operations")} ${dim("| Perform bulk actions on workflows")}`;
    this.add(this.headerText);

    // Operation type selector
    this.operationSelector = new BoxRenderable(ctx, {
      id: "operation-selector",
      height: 3,
      width: "100%",
      flexDirection: "column",
      paddingLeft: 1,
      marginBottom: 1,
    });
    this.add(this.operationSelector);
    this.renderOperationSelector();

    // Query input section
    this.queryBox = new BoxRenderable(ctx, {
      id: "query-box",
      height: 6,
      width: "100%",
      flexDirection: "column",
      paddingLeft: 1,
      marginBottom: 1,
    });
    this.add(this.queryBox);
    this.renderQueryInputs();

    // Status/instructions
    this.statusText = new TextRenderable(ctx, {
      id: "batch-status",
      height: 1,
      width: "100%",
      paddingLeft: 1,
      marginBottom: 1,
    });
    this.statusText.content = t`${dim("Tab: cycle operation | /: edit query | Enter: start batch | j/k: select job")}`;
    this.add(this.statusText);

    // Recent batch jobs table
    const jobsHeader = new TextRenderable(ctx, {
      id: "jobs-header",
      height: 1,
      width: "100%",
      paddingLeft: 1,
    });
    jobsHeader.content = t`${bold("Recent Batch Jobs")}`;
    this.add(jobsHeader);

    this.jobsTable = new Table<BatchJob>(ctx, {
      id: "batch-jobs-table",
      columns: JOB_COLUMNS,
      data: this.jobs,
      emptyMessage: "No batch jobs found",
      getRowId: (job) => job.jobId,
      onSelect: (job) => {
        if (this.onViewJob) {
          this.onViewJob(job);
        }
      },
    });
    this.add(this.jobsTable);
  }

  private renderOperationSelector(): void {
    // Clear existing children
    for (const child of this.operationSelector.getChildren()) {
      this.operationSelector.remove(child.id);
      child.destroy();
    }

    const label = new TextRenderable(this.ctx, {
      id: "op-label",
      height: 1,
      width: "100%",
    });
    label.content = t`${bold("Operation Type:")}`;
    this.operationSelector.add(label);

    const options = new BoxRenderable(this.ctx, {
      id: "op-options",
      height: 1,
      width: "100%",
      flexDirection: "row",
    });

    for (let i = 0; i < OPERATION_TYPES.length; i++) {
      const op = OPERATION_TYPES[i];
      if (!op) continue;

      const isSelected = i === this.selectedOperationType;
      const option = new TextRenderable(this.ctx, {
        id: `op-option-${i}`,
        paddingRight: 3,
      });

      if (isSelected) {
        option.content = t`${cyan(`[${op.label}]`)}`;
      } else {
        option.content = t`${dim(op.label)}`;
      }
      options.add(option);
    }

    this.operationSelector.add(options);

    const description = new TextRenderable(this.ctx, {
      id: "op-description",
      height: 1,
      width: "100%",
    });
    const selectedOp = OPERATION_TYPES[this.selectedOperationType];
    description.content = t`${dim(selectedOp?.description ?? "")}`;
    this.operationSelector.add(description);
  }

  private renderQueryInputs(): void {
    // Clear existing children
    for (const child of this.queryBox.getChildren()) {
      this.queryBox.remove(child.id);
      child.destroy();
    }

    // Query input
    const queryLabel = new TextRenderable(this.ctx, {
      id: "query-label",
      height: 1,
      width: "100%",
    });
    const queryActive = this.isInputMode && this.activeInput === "query";
    queryLabel.content = t`${bold("Query:")} ${queryActive ? cyan("▶") : " "} ${this.queryInput || dim("(visibility query, e.g., WorkflowType='OrderWorkflow')")}`;
    this.queryBox.add(queryLabel);

    // Reason input
    const reasonLabel = new TextRenderable(this.ctx, {
      id: "reason-label",
      height: 1,
      width: "100%",
    });
    const reasonActive = this.isInputMode && this.activeInput === "reason";
    reasonLabel.content = t`${bold("Reason:")} ${reasonActive ? cyan("▶") : " "} ${this.reasonInput || dim("(optional reason for the operation)")}`;
    this.queryBox.add(reasonLabel);

    // Signal name input (only for signal operations)
    const selectedOp = OPERATION_TYPES[this.selectedOperationType];
    if (selectedOp?.type === "SIGNAL") {
      const signalLabel = new TextRenderable(this.ctx, {
        id: "signal-label",
        height: 1,
        width: "100%",
      });
      const signalActive = this.isInputMode && this.activeInput === "signal";
      signalLabel.content = t`${bold("Signal Name:")} ${signalActive ? cyan("▶") : " "} ${this.signalNameInput || dim("(required signal name)")}`;
      this.queryBox.add(signalLabel);
    }
  }

  // Navigation
  cycleOperationType(): void {
    this.selectedOperationType = (this.selectedOperationType + 1) % OPERATION_TYPES.length;
    this.renderOperationSelector();
    this.renderQueryInputs();
  }

  moveUp(): void {
    if (!this.isInputMode) {
      this.jobsTable.moveUp();
    }
  }

  moveDown(): void {
    if (!this.isInputMode) {
      this.jobsTable.moveDown();
    }
  }

  select(): void {
    if (!this.isInputMode) {
      this.jobsTable.select();
    }
  }

  // Input handling
  startInput(field: "query" | "reason" | "signal"): void {
    this.isInputMode = true;
    this.activeInput = field;
    this.renderQueryInputs();
    this.updateStatus();
  }

  handleInputKey(key: string): boolean {
    if (!this.isInputMode) return false;

    if (key === "escape") {
      this.isInputMode = false;
      this.renderQueryInputs();
      this.updateStatus();
      return true;
    }

    if (key === "return" || key === "enter") {
      this.isInputMode = false;
      this.renderQueryInputs();
      this.updateStatus();
      return true;
    }

    if (key === "backspace") {
      if (this.activeInput === "query" && this.queryInput.length > 0) {
        this.queryInput = this.queryInput.slice(0, -1);
      } else if (this.activeInput === "reason" && this.reasonInput.length > 0) {
        this.reasonInput = this.reasonInput.slice(0, -1);
      } else if (this.activeInput === "signal" && this.signalNameInput.length > 0) {
        this.signalNameInput = this.signalNameInput.slice(0, -1);
      }
      this.renderQueryInputs();
      return true;
    }

    // Only handle printable characters
    if (key.length === 1) {
      if (this.activeInput === "query") {
        this.queryInput += key;
      } else if (this.activeInput === "reason") {
        this.reasonInput += key;
      } else if (this.activeInput === "signal") {
        this.signalNameInput += key;
      }
      this.renderQueryInputs();
      return true;
    }

    return false;
  }

  isInInputMode(): boolean {
    return this.isInputMode;
  }

  private updateStatus(): void {
    if (this.isInputMode) {
      this.statusText.content = t`${dim("Type your input | Enter: confirm | Esc: cancel")}`;
    } else {
      this.statusText.content = t`${dim("Tab: cycle operation | /: edit query | r: reason | Enter: start batch | j/k: select job")}`;
    }
  }

  // Start batch operation
  startBatch(): void {
    if (!this.queryInput) {
      this.statusText.content = t`${red("Error: Query is required")}`;
      return;
    }

    const selectedOp = OPERATION_TYPES[this.selectedOperationType];
    if (!selectedOp) return;

    if (selectedOp.type === "SIGNAL" && !this.signalNameInput) {
      this.statusText.content = t`${red("Error: Signal name is required")}`;
      return;
    }

    const operation: BatchOperation = {
      type: selectedOp.type,
      query: this.queryInput,
      reason: this.reasonInput || undefined,
      signalName: selectedOp.type === "SIGNAL" ? this.signalNameInput : undefined,
    };

    if (this.onStartBatch) {
      this.onStartBatch(operation);
    }
  }

  setJobs(jobs: BatchJob[]): void {
    this.jobs = jobs;
    this.jobsTable.setData(jobs);
  }
}
