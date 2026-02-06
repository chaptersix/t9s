/**
 * Schedule Detail View - displays detailed information about a schedule
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
  yellow,
} from "@opentui/core";
import type { Store } from "../../store";
import type { Schedule } from "../../data/temporal/types";
import { formatRelativeTime } from "../../utils/time";

export interface ScheduleDetailOptions extends BoxOptions {
  store: Store;
  onBack?: () => void;
}

const TABS = [
  { name: "Overview", description: "Schedule overview", value: "overview" },
  { name: "Configuration", description: "Workflow config", value: "config" },
  { name: "Recent Actions", description: "Past executions", value: "actions" },
];

function getStateStyle(state: string): ReturnType<typeof green> {
  switch (state) {
    case "ACTIVE":
      return green("● Active");
    case "PAUSED":
      return yellow("◯ Paused");
    default:
      return dim(state);
  }
}

function formatScheduleSpec(schedule: Schedule): string[] {
  const lines: string[] = [];
  const spec = schedule.spec;

  if (spec.cronStrings && spec.cronStrings.length > 0) {
    lines.push(`Cron: ${spec.cronStrings.join(", ")}`);
  }

  if (spec.intervals && spec.intervals.length > 0) {
    for (const interval of spec.intervals) {
      let line = `Interval: ${interval.every}`;
      if (interval.offset) {
        line += ` (offset: ${interval.offset})`;
      }
      lines.push(line);
    }
  }

  if (spec.calendars && spec.calendars.length > 0) {
    for (const cal of spec.calendars) {
      const parts: string[] = [];
      if (cal.minute) parts.push(`minute=${cal.minute}`);
      if (cal.hour) parts.push(`hour=${cal.hour}`);
      if (cal.dayOfMonth) parts.push(`day=${cal.dayOfMonth}`);
      if (cal.month) parts.push(`month=${cal.month}`);
      if (cal.dayOfWeek) parts.push(`dow=${cal.dayOfWeek}`);
      if (cal.comment) {
        lines.push(`Calendar: ${cal.comment}`);
      } else if (parts.length > 0) {
        lines.push(`Calendar: ${parts.join(", ")}`);
      }
    }
  }

  if (lines.length === 0) {
    lines.push("No schedule specification");
  }

  return lines;
}

export class ScheduleDetail extends BoxRenderable {
  private store: Store;
  private unsubscribe: (() => void) | null = null;
  private onBackCallback?: () => void;

  private headerBox: BoxRenderable;
  private headerText: TextRenderable;
  private tabSelect: TabSelectRenderable;
  private contentArea: ScrollBoxRenderable;
  private contentBox: BoxRenderable;

  private currentTab = "overview";
  private schedule: Schedule | null = null;

  constructor(ctx: RenderContext, options: ScheduleDetailOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "schedule-detail",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    });

    this.store = options.store;
    this.onBackCallback = options.onBack;

    // Header with schedule info
    this.headerBox = new BoxRenderable(ctx, {
      id: "schedule-header",
      height: 3,
      width: "100%",
      flexDirection: "column",
      backgroundColor: "#1a1a2e",
      paddingLeft: 1,
      paddingRight: 1,
    });
    this.add(this.headerBox);

    this.headerText = new TextRenderable(ctx, {
      id: "schedule-header-text",
      width: "100%",
      height: 3,
    });
    this.headerBox.add(this.headerText);

    // Tab selector
    this.tabSelect = new TabSelectRenderable(ctx, {
      id: "schedule-tabs",
      height: 1,
      width: "100%",
      options: TABS,
      backgroundColor: "#16213e",
      selectedBackgroundColor: "#0f0f23",
      showDescription: false,
      showUnderline: true,
      tabWidth: 18,
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
      id: "schedule-content-scroll",
      flexGrow: 1,
      width: "100%",
      scrollY: true,
    });
    this.add(this.contentArea);

    this.contentBox = new BoxRenderable(ctx, {
      id: "schedule-content",
      width: "100%",
      flexDirection: "column",
      padding: 1,
    });
    this.contentArea.add(this.contentBox);

    // Initialize with current state
    const state = this.store.getState();
    this.schedule = state.scheduleDetail;
    this.renderHeader();
    this.renderContent();

    // Subscribe to store changes
    this.unsubscribe = this.store.subscribe((newState, prevState) => {
      if (newState.scheduleDetail !== prevState.scheduleDetail) {
        this.schedule = newState.scheduleDetail;
        this.renderHeader();
        this.renderContent();
      }
    });
  }

  private renderHeader(): void {
    if (!this.schedule) {
      this.headerText.content = t`${dim("Loading schedule...")}`;
      return;
    }

    const sched = this.schedule;
    const nextRun =
      sched.info.nextActionTimes.length > 0
        ? formatRelativeTime(sched.info.nextActionTimes[0]!)
        : "—";

    this.headerText.content = t`${bold(sched.scheduleId)} ${dim("|")} ${cyan(sched.workflowType)}
${getStateStyle(sched.state)} ${dim("|")} Next: ${nextRun} ${dim("|")} Runs: ${sched.info.numActions}
${dim("Task Queue:")} ${sched.action.workflow.taskQueue}`;
  }

  private renderContent(): void {
    // Clear existing content
    for (const child of this.contentBox.getChildren()) {
      this.contentBox.remove(child.id);
      child.destroy();
    }

    switch (this.currentTab) {
      case "overview":
        this.renderOverviewTab();
        break;
      case "config":
        this.renderConfigTab();
        break;
      case "actions":
        this.renderActionsTab();
        break;
    }
  }

  private renderOverviewTab(): void {
    if (!this.schedule) {
      this.addText("No schedule data available");
      return;
    }

    const sched = this.schedule;

    // Schedule specification
    this.addText(t`${bold("Schedule Specification")}`);
    for (const line of formatScheduleSpec(sched)) {
      this.addText(t`  ${dim(line)}`);
    }
    this.addText("");

    // Statistics
    this.addText(t`${bold("Statistics")}`);
    this.addText(t`  Total Runs: ${cyan(String(sched.info.numActions))}`);
    if (sched.info.numActionsMissedCatchupWindow > 0) {
      this.addText(
        t`  Missed: ${yellow(String(sched.info.numActionsMissedCatchupWindow))}`
      );
    }
    this.addText("");

    // Timing
    this.addText(t`${bold("Timing")}`);
    if (sched.info.nextActionTimes.length > 0) {
      this.addText(
        t`  Next Run: ${green(formatRelativeTime(sched.info.nextActionTimes[0]!))}`
      );
      // Show additional upcoming times
      for (let i = 1; i < Math.min(3, sched.info.nextActionTimes.length); i++) {
        this.addText(
          t`            ${dim(formatRelativeTime(sched.info.nextActionTimes[i]!))}`
        );
      }
    }
    if (sched.info.recentActions.length > 0) {
      const lastAction = sched.info.recentActions[sched.info.recentActions.length - 1];
      if (lastAction?.actualTime) {
        this.addText(
          t`  Last Run: ${dim(formatRelativeTime(lastAction.actualTime))}`
        );
      }
    }
    this.addText("");

    // Metadata
    this.addText(t`${bold("Metadata")}`);
    this.addText(t`  Created: ${dim(formatRelativeTime(sched.info.createdAt))}`);
    this.addText(
      t`  Updated: ${dim(formatRelativeTime(sched.info.lastUpdatedAt))}`
    );

    // Running actions
    if (sched.info.runningActions.length > 0) {
      this.addText("");
      this.addText(t`${bold("Currently Running")}`);
      for (const action of sched.info.runningActions) {
        this.addText(t`  ${cyan(action.workflowId)} ${dim(`(${action.runId.slice(0, 8)}...)`)}`);
      }
    }
  }

  private renderConfigTab(): void {
    if (!this.schedule) {
      this.addText("No schedule data available");
      return;
    }

    const workflow = this.schedule.action.workflow;

    this.addText(t`${bold("Workflow Configuration")}`);
    this.addText("");
    this.addText(t`  ${dim("Workflow Type:")} ${cyan(workflow.workflowType)}`);
    this.addText(t`  ${dim("Workflow ID:")}   ${workflow.workflowId || dim("(generated)")}`);
    this.addText(t`  ${dim("Task Queue:")}    ${workflow.taskQueue}`);
    this.addText("");

    if (workflow.input !== undefined) {
      this.addText(t`${bold("Input")}`);
      try {
        const formatted = JSON.stringify(workflow.input, null, 2);
        for (const line of formatted.split("\n")) {
          this.addText(t`  ${dim(line)}`);
        }
      } catch {
        this.addText(t`  ${dim(String(workflow.input))}`);
      }
    }
  }

  private renderActionsTab(): void {
    if (!this.schedule) {
      this.addText("No schedule data available");
      return;
    }

    const actions = this.schedule.info.recentActions;

    if (actions.length === 0) {
      this.addText(t`${dim("No recent actions")}`);
      return;
    }

    this.addText(t`${bold("Recent Actions")} ${dim(`(${actions.length} shown)`)}`);
    this.addText("");

    // Show in reverse chronological order
    for (let i = actions.length - 1; i >= 0; i--) {
      const action = actions[i];
      if (action) {
        const scheduled = formatRelativeTime(action.startTime);
        const actual = formatRelativeTime(action.actualTime);
        this.addText(t`  ${green("✓")} Scheduled: ${scheduled} ${dim("|")} Actual: ${actual}`);
      }
    }
  }

  private addText(content: ReturnType<typeof t> | string): void {
    const text = new TextRenderable(this.ctx, {
      id: `content-${this.contentBox.getChildren().length}`,
      width: "100%",
      height: 1,
    });
    text.content = typeof content === "string" ? content : content;
    this.contentBox.add(text);
  }

  // Tab navigation
  nextTab(): void {
    this.tabSelect.moveRight();
  }

  prevTab(): void {
    this.tabSelect.moveLeft();
  }

  // Scroll navigation
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

  goBack(): void {
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
