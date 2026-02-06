/**
 * Workflow Detail View - displays detailed information about a workflow
 */

import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  TabSelectRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  dim,
  bold,
  cyan,
  green,
  red,
  yellow,
} from "@opentui/core";
import type { Store } from "../../store";
import type { WorkflowDescription, HistoryEvent } from "../../data/temporal/types";
import { formatRelativeTime, formatDuration } from "../../utils/time";

export interface WorkflowDetailOptions extends BoxOptions {
  store: Store;
  onBack?: () => void;
}

const TABS = [
  { name: "Summary", description: "Workflow overview", value: "summary" },
  { name: "Input/Output", description: "Payloads", value: "io" },
  { name: "History", description: "Event history", value: "history" },
  { name: "Pending", description: "Pending activities", value: "pending" },
];

function getStatusStyle(status: string | undefined): ReturnType<typeof green> {
  const s = (status ?? "UNKNOWN").toUpperCase();
  switch (s) {
    case "RUNNING":
      return green("● Running");
    case "COMPLETED":
      return green("✓ Completed");
    case "FAILED":
      return red("✗ Failed");
    case "CANCELED":
      return yellow("○ Canceled");
    case "TERMINATED":
      return red("⊘ Terminated");
    case "TIMED_OUT":
      return yellow("⏱ TimedOut");
    default:
      return dim(s);
  }
}

function getEventTypeStyle(eventType: string): ReturnType<typeof green> {
  const type = eventType.replace("EVENT_TYPE_", "");

  // Workflow lifecycle
  if (type.includes("WORKFLOW_EXECUTION_STARTED")) return green(type);
  if (type.includes("WORKFLOW_EXECUTION_COMPLETED")) return green(type);
  if (type.includes("WORKFLOW_EXECUTION_FAILED")) return red(type);
  if (type.includes("WORKFLOW_EXECUTION_TERMINATED")) return red(type);
  if (type.includes("WORKFLOW_EXECUTION_CANCELED")) return yellow(type);
  if (type.includes("WORKFLOW_EXECUTION_TIMED_OUT")) return yellow(type);

  // Activity lifecycle
  if (type.includes("ACTIVITY_TASK_SCHEDULED")) return cyan(type);
  if (type.includes("ACTIVITY_TASK_STARTED")) return cyan(type);
  if (type.includes("ACTIVITY_TASK_COMPLETED")) return green(type);
  if (type.includes("ACTIVITY_TASK_FAILED")) return red(type);
  if (type.includes("ACTIVITY_TASK_TIMED_OUT")) return yellow(type);
  if (type.includes("ACTIVITY_TASK_CANCEL")) return yellow(type);

  // Timer events
  if (type.includes("TIMER")) return yellow(type);

  // Signal events
  if (type.includes("SIGNAL")) return cyan(type);

  // Child workflow
  if (type.includes("CHILD_WORKFLOW")) return cyan(type);

  // Decision/Command
  if (type.includes("WORKFLOW_TASK")) return dim(type);

  return dim(type);
}

export class WorkflowDetail extends BoxRenderable {
  private store: Store;
  private unsubscribe: (() => void) | null = null;
  private onBackCallback?: () => void;

  private headerBox: BoxRenderable;
  private headerText: TextRenderable;
  private tabSelect: TabSelectRenderable;
  private contentArea: ScrollBoxRenderable;
  private contentBox: BoxRenderable;

  private currentTab = "summary";
  private workflow: WorkflowDescription | null = null;
  private history: HistoryEvent[] = [];
  private historyViewMode: "compact" | "detailed" = "compact";
  private selectedEventIndex = 0;
  private selectedActivityIndex = 0;

  constructor(ctx: RenderContext, options: WorkflowDetailOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "workflow-detail",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    });

    this.store = options.store;
    this.onBackCallback = options.onBack;

    // Header with workflow info
    this.headerBox = new BoxRenderable(ctx, {
      id: "detail-header",
      height: 3,
      width: "100%",
      flexDirection: "column",
      backgroundColor: "#1a1a2e",
      paddingLeft: 1,
      paddingRight: 1,
    });
    this.add(this.headerBox);

    this.headerText = new TextRenderable(ctx, {
      id: "header-text",
      width: "100%",
      height: 3,
    });
    this.headerBox.add(this.headerText);

    // Tab selector
    this.tabSelect = new TabSelectRenderable(ctx, {
      id: "detail-tabs",
      height: 1,
      width: "100%",
      options: TABS,
      backgroundColor: "#16213e",
      selectedBackgroundColor: "#0f0f23",
      showDescription: false,
      showUnderline: true,
      tabWidth: 15,
      wrapSelection: true,
    });
    this.add(this.tabSelect);

    // Listen for tab changes
    this.tabSelect.on("selectionChanged", () => {
      const selected = this.tabSelect.getSelectedOption();
      if (selected) {
        this.currentTab = selected.value;
        this.renderContent();
      }
    });

    // Scrollable content area
    this.contentArea = new ScrollBoxRenderable(ctx, {
      id: "detail-content-scroll",
      flexGrow: 1,
      width: "100%",
      scrollY: true,
    });
    this.add(this.contentArea);

    this.contentBox = new BoxRenderable(ctx, {
      id: "detail-content",
      width: "100%",
      flexDirection: "column",
      padding: 1,
    });
    this.contentArea.add(this.contentBox);

    // Initialize with current state
    const state = this.store.getState();
    this.workflow = state.workflowDetail;
    this.history = state.workflowHistory;
    this.renderHeader();
    this.renderContent();

    // Subscribe to store changes
    this.unsubscribe = this.store.subscribe((newState, prevState) => {
      if (newState.workflowDetail !== prevState.workflowDetail) {
        this.workflow = newState.workflowDetail;
        this.renderHeader();
        this.renderContent();
      }
      if (newState.workflowHistory !== prevState.workflowHistory) {
        this.history = newState.workflowHistory;
        if (this.currentTab === "history") {
          this.renderContent();
        }
      }
    });
  }

  private renderHeader(): void {
    if (!this.workflow) {
      this.headerText.content = t`${dim("Loading workflow...")}`;
      return;
    }

    const wf = this.workflow;
    const duration = formatDuration(wf.startTime, wf.closeTime);
    const started = formatRelativeTime(wf.startTime);

    this.headerText.content = t`${bold(wf.workflowId)} ${dim("|")} ${cyan(wf.workflowType)}
${getStatusStyle(wf.status)} ${dim("|")} Started ${started} ${dim("|")} Duration: ${duration}
${dim("Task Queue:")} ${wf.taskQueue} ${dim("|")} ${dim("Run ID:")} ${dim(wf.runId.slice(0, 8))}...`;
  }

  private renderContent(): void {
    // Clear existing content
    for (const child of this.contentBox.getChildren()) {
      this.contentBox.remove(child.id);
      child.destroy();
    }

    switch (this.currentTab) {
      case "summary":
        this.renderSummaryTab();
        break;
      case "io":
        this.renderIOTab();
        break;
      case "history":
        this.renderHistoryTab();
        break;
      case "pending":
        this.renderPendingTab();
        break;
    }
  }

  private renderSummaryTab(): void {
    if (!this.workflow) return;

    const wf = this.workflow;
    let lineNum = 0;

    const addLine = (content: ReturnType<typeof t>) => {
      const text = new TextRenderable(this.ctx, {
        id: `summary-line-${lineNum++}`,
        width: "100%",
        height: 1,
      });
      text.content = content;
      this.contentBox.add(text);
    };

    addLine(t`${bold("Workflow ID:")}   ${wf.workflowId}`);
    addLine(t`${bold("Run ID:")}        ${wf.runId}`);
    addLine(t`${bold("Type:")}          ${wf.workflowType}`);
    addLine(t`${bold("Status:")}        ${wf.status}`);
    addLine(t`${bold("Task Queue:")}    ${wf.taskQueue}`);
    addLine(t``);
    addLine(t`${bold("Start Time:")}    ${new Date(wf.startTime).toLocaleString()}`);
    if (wf.closeTime) {
      addLine(t`${bold("Close Time:")}    ${new Date(wf.closeTime).toLocaleString()}`);
    }
    addLine(t`${bold("History Length:")} ${wf.historyLength} events`);
    addLine(t``);

    if (wf.parentWorkflowId) {
      addLine(t`${bold("Parent:")}        ${wf.parentWorkflowId}`);
    }

    if (wf.memo && Object.keys(wf.memo).length > 0) {
      addLine(t``);
      addLine(t`${bold("Memo:")}`);
      addLine(t`${JSON.stringify(wf.memo, null, 2)}`);
    }

    if (wf.searchAttributes && Object.keys(wf.searchAttributes).length > 0) {
      addLine(t``);
      addLine(t`${bold("Search Attributes:")}`);
      for (const [key, value] of Object.entries(wf.searchAttributes)) {
        addLine(t`  ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  private renderIOTab(): void {
    if (!this.workflow) return;

    const wf = this.workflow;

    // Input section
    const inputLabel = new TextRenderable(this.ctx, {
      id: "io-input-label",
      width: "100%",
      height: 1,
    });
    inputLabel.content = t`${bold("Input:")}`;
    this.contentBox.add(inputLabel);

    const inputValue = new TextRenderable(this.ctx, {
      id: "io-input-value",
      width: "100%",
      paddingLeft: 2,
    });
    inputValue.content = t`${dim(wf.input ? JSON.stringify(wf.input, null, 2) : "(none)")}`;
    this.contentBox.add(inputValue);

    // Spacer
    const spacer1 = new BoxRenderable(this.ctx, { id: "io-spacer1", height: 1, width: "100%" });
    this.contentBox.add(spacer1);

    // Result/Output section
    const outputLabel = new TextRenderable(this.ctx, {
      id: "io-output-label",
      width: "100%",
      height: 1,
    });

    if (wf.failure) {
      outputLabel.content = t`${red(bold("Failure:"))}`;
      this.contentBox.add(outputLabel);

      const failureValue = new TextRenderable(this.ctx, {
        id: "io-failure-value",
        width: "100%",
        paddingLeft: 2,
      });
      failureValue.content = t`${red(wf.failure.message)}
${dim(wf.failure.stackTrace ?? "")}`;
      this.contentBox.add(failureValue);
    } else if (wf.result !== undefined) {
      outputLabel.content = t`${green(bold("Result:"))}`;
      this.contentBox.add(outputLabel);

      const resultValue = new TextRenderable(this.ctx, {
        id: "io-result-value",
        width: "100%",
        paddingLeft: 2,
      });
      resultValue.content = t`${dim(JSON.stringify(wf.result, null, 2))}`;
      this.contentBox.add(resultValue);
    } else {
      outputLabel.content = t`${bold("Result:")} ${dim("(workflow still running)")}`;
      this.contentBox.add(outputLabel);
    }
  }

  private renderHistoryTab(): void {
    // View mode hint
    const modeHint = new TextRenderable(this.ctx, {
      id: "history-mode-hint",
      width: "100%",
      height: 1,
      marginBottom: 1,
    });
    const modeLabel = this.historyViewMode === "compact" ? "Compact" : "Detailed";
    modeHint.content = t`${dim(`View: ${modeLabel}  (press 'v' to toggle)  ${this.history.length} events`)}`;
    this.contentBox.add(modeHint);

    if (this.history.length === 0) {
      const empty = new TextRenderable(this.ctx, {
        id: "history-empty",
        width: "100%",
        height: 1,
      });
      empty.content = t`${dim("No events loaded")}`;
      this.contentBox.add(empty);
      return;
    }

    if (this.historyViewMode === "compact") {
      this.renderCompactHistory();
    } else {
      this.renderDetailedHistory();
    }
  }

  private renderCompactHistory(): void {
    // Show all events in compact single-line format
    const maxEvents = 200;
    for (let i = 0; i < Math.min(this.history.length, maxEvents); i++) {
      const event = this.history[i];
      if (!event) continue;

      const eventLine = new TextRenderable(this.ctx, {
        id: `event-${event.eventId}`,
        width: "100%",
        height: 1,
      });

      const time = new Date(event.eventTime).toLocaleTimeString();
      const idPad = String(event.eventId).padStart(4, " ");

      eventLine.content = t`${dim(idPad)} ${getEventTypeStyle(event.eventType)} ${dim(time)}`;
      this.contentBox.add(eventLine);
    }

    if (this.history.length > maxEvents) {
      const more = new TextRenderable(this.ctx, {
        id: "history-more",
        width: "100%",
        height: 1,
      });
      more.content = t`${dim(`... and ${this.history.length - maxEvents} more events`)}`;
      this.contentBox.add(more);
    }
  }

  private renderDetailedHistory(): void {
    // Show events with expanded details
    const maxEvents = 50;
    for (let i = 0; i < Math.min(this.history.length, maxEvents); i++) {
      const event = this.history[i];
      if (!event) continue;

      // Event header
      const eventHeader = new BoxRenderable(this.ctx, {
        id: `event-header-${event.eventId}`,
        width: "100%",
        height: 1,
        backgroundColor: i === this.selectedEventIndex ? "#2d4a7c" : undefined,
      });

      const headerText = new TextRenderable(this.ctx, {
        id: `event-header-text-${event.eventId}`,
        width: "100%",
        height: 1,
      });

      const time = new Date(event.eventTime).toLocaleTimeString();
      const idPad = String(event.eventId).padStart(4, " ");
      headerText.content = t`${dim(idPad)} ${getEventTypeStyle(event.eventType)} ${dim(time)}`;
      eventHeader.add(headerText);
      this.contentBox.add(eventHeader);

      // Event details (show key attributes)
      const attrs = event.attributes;
      if (attrs && Object.keys(attrs).length > 0) {
        const detailLines = this.formatEventAttributes(event.eventType, attrs);
        for (let j = 0; j < Math.min(detailLines.length, 3); j++) {
          const detailLine = new TextRenderable(this.ctx, {
            id: `event-detail-${event.eventId}-${j}`,
            width: "100%",
            height: 1,
            paddingLeft: 6,
          });
          detailLine.content = t`${dim(detailLines[j] ?? "")}`;
          this.contentBox.add(detailLine);
        }
      }
    }

    if (this.history.length > maxEvents) {
      const more = new TextRenderable(this.ctx, {
        id: "history-more",
        width: "100%",
        height: 1,
      });
      more.content = t`${dim(`... and ${this.history.length - maxEvents} more events`)}`;
      this.contentBox.add(more);
    }
  }

  private formatEventAttributes(eventType: string, attrs: Record<string, unknown>): string[] {
    const lines: string[] = [];
    const type = eventType.replace("EVENT_TYPE_", "");

    // Extract relevant fields based on event type
    if (type.includes("ACTIVITY")) {
      if (attrs.activityType) {
        const actType = attrs.activityType as { name?: string };
        lines.push(`Activity: ${actType.name ?? "unknown"}`);
      }
      if (attrs.activityId) lines.push(`ID: ${attrs.activityId}`);
      if (attrs.failure) {
        const failure = attrs.failure as { message?: string };
        lines.push(`Failure: ${failure.message ?? "unknown error"}`);
      }
    } else if (type.includes("TIMER")) {
      if (attrs.timerId) lines.push(`Timer: ${attrs.timerId}`);
      if (attrs.startToFireTimeout) lines.push(`Timeout: ${attrs.startToFireTimeout}`);
    } else if (type.includes("SIGNAL")) {
      if (attrs.signalName) lines.push(`Signal: ${attrs.signalName}`);
    } else if (type.includes("CHILD_WORKFLOW")) {
      if (attrs.workflowType) {
        const wfType = attrs.workflowType as { name?: string };
        lines.push(`Workflow: ${wfType.name ?? "unknown"}`);
      }
    } else if (type.includes("WORKFLOW_EXECUTION_STARTED")) {
      if (attrs.workflowType) {
        const wfType = attrs.workflowType as { name?: string };
        lines.push(`Type: ${wfType.name ?? "unknown"}`);
      }
      if (attrs.taskQueue) {
        const tq = attrs.taskQueue as { name?: string };
        lines.push(`Task Queue: ${tq.name ?? "unknown"}`);
      }
    } else if (type.includes("WORKFLOW_EXECUTION_FAILED")) {
      if (attrs.failure) {
        const failure = attrs.failure as { message?: string };
        lines.push(`Error: ${failure.message ?? "unknown error"}`);
      }
    }

    return lines;
  }

  toggleHistoryViewMode(): void {
    this.historyViewMode = this.historyViewMode === "compact" ? "detailed" : "compact";
    if (this.currentTab === "history") {
      this.renderContent();
    }
  }

  private renderPendingTab(): void {
    if (!this.workflow) return;

    const pending = this.workflow.pendingActivities ?? [];

    // Action hints
    const hints = new TextRenderable(this.ctx, {
      id: "pending-hints",
      width: "100%",
      height: 1,
      marginBottom: 1,
    });
    hints.content = t`${dim(`j/k: select  p: pause  u: unpause  R: reset  (${pending.length} activities)`)}`;
    this.contentBox.add(hints);

    if (pending.length === 0) {
      const empty = new TextRenderable(this.ctx, {
        id: "pending-empty",
        width: "100%",
        height: 1,
      });
      empty.content = t`${dim("No pending activities")}`;
      this.contentBox.add(empty);
      return;
    }

    // Keep selected index in bounds
    if (this.selectedActivityIndex >= pending.length) {
      this.selectedActivityIndex = Math.max(0, pending.length - 1);
    }

    for (let i = 0; i < pending.length; i++) {
      const activity = pending[i];
      if (!activity) continue;

      const isSelected = i === this.selectedActivityIndex;
      const prefix = isSelected ? cyan("▶ ") : "  ";

      const headerBox = new BoxRenderable(this.ctx, {
        id: `pending-${i}-box`,
        width: "100%",
        backgroundColor: isSelected ? "#2d4a7c" : undefined,
        flexDirection: "column",
        paddingLeft: 1,
      });

      const header = new TextRenderable(this.ctx, {
        id: `pending-${i}-header`,
        width: "100%",
        height: 1,
      });
      header.content = t`${prefix}${bold(activity.activityType)} ${dim(`(${activity.activityId})`)}`;
      headerBox.add(header);

      const stateStyle = activity.state === "STARTED" ? green(activity.state) : yellow(activity.state);
      const details = new TextRenderable(this.ctx, {
        id: `pending-${i}-details`,
        width: "100%",
        height: 1,
        paddingLeft: 2,
      });
      details.content = t`  ${dim("State:")} ${stateStyle} ${dim("|")} ${dim("Attempt:")} ${activity.attempt}/${activity.maximumAttempts}`;
      headerBox.add(details);

      if (activity.lastHeartbeatTime) {
        const heartbeat = new TextRenderable(this.ctx, {
          id: `pending-${i}-heartbeat`,
          width: "100%",
          height: 1,
          paddingLeft: 2,
        });
        heartbeat.content = t`  ${dim("Last heartbeat:")} ${formatRelativeTime(activity.lastHeartbeatTime)}`;
        headerBox.add(heartbeat);
      }

      if (activity.lastFailure) {
        const failure = new TextRenderable(this.ctx, {
          id: `pending-${i}-failure`,
          width: "100%",
          height: 1,
          paddingLeft: 2,
        });
        failure.content = t`  ${red("Last failure:")} ${activity.lastFailure}`;
        headerBox.add(failure);
      }

      this.contentBox.add(headerBox);

      // Spacer between activities
      const spacer = new BoxRenderable(this.ctx, {
        id: `pending-${i}-spacer`,
        height: 1,
        width: "100%",
      });
      this.contentBox.add(spacer);
    }
  }

  // Activity selection methods
  selectPrevActivity(): void {
    const pending = this.workflow?.pendingActivities ?? [];
    if (pending.length === 0) return;
    this.selectedActivityIndex = Math.max(0, this.selectedActivityIndex - 1);
    if (this.currentTab === "pending") {
      this.renderContent();
    }
  }

  selectNextActivity(): void {
    const pending = this.workflow?.pendingActivities ?? [];
    if (pending.length === 0) return;
    this.selectedActivityIndex = Math.min(pending.length - 1, this.selectedActivityIndex + 1);
    if (this.currentTab === "pending") {
      this.renderContent();
    }
  }

  getSelectedActivity(): import("../../data/temporal/types").PendingActivity | null {
    const pending = this.workflow?.pendingActivities ?? [];
    return pending[this.selectedActivityIndex] ?? null;
  }

  isOnPendingTab(): boolean {
    return this.currentTab === "pending";
  }

  // Navigation methods
  nextTab(): void {
    this.tabSelect.moveRight();
  }

  prevTab(): void {
    this.tabSelect.moveLeft();
  }

  scrollUp(): void {
    this.contentArea.scrollBy(-1);
  }

  scrollDown(): void {
    this.contentArea.scrollBy(1);
  }

  pageUp(): void {
    this.contentArea.scrollBy(-10);
  }

  pageDown(): void {
    this.contentArea.scrollBy(10);
  }

  back(): void {
    if (this.onBackCallback) {
      this.onBackCallback();
    }
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    super.destroy();
  }
}
