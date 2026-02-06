/**
 * ScheduleList view - displays and manages schedules
 */

import {
  BoxRenderable,
  TextRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  dim,
  bold,
} from "@opentui/core";
import type { Store } from "../../store";
import type { Schedule } from "../../data/temporal/types";
import { Table, type Column } from "../../components/common/Table";
import { formatRelativeTime } from "../../utils/time";

export interface ScheduleListOptions extends Omit<BoxOptions, "flexDirection"> {
  store: Store;
  onSelectSchedule?: (schedule: Schedule) => void;
  onToggleSchedule?: (schedule: Schedule) => void;
  onTriggerSchedule?: (schedule: Schedule) => void;
  onDeleteSchedule?: (schedule: Schedule) => void;
}

function formatScheduleSpec(schedule: Schedule): string {
  const spec = schedule.spec;

  if (spec.cronStrings && spec.cronStrings.length > 0) {
    return spec.cronStrings[0] ?? "";
  }

  if (spec.intervals && spec.intervals.length > 0) {
    const interval = spec.intervals[0];
    return interval ? `every ${interval.every}` : "";
  }

  if (spec.calendars && spec.calendars.length > 0) {
    const cal = spec.calendars[0];
    if (cal?.comment) return cal.comment;
    return "calendar";
  }

  return "—";
}

function formatNextRun(schedule: Schedule): string {
  const nextTimes = schedule.info?.nextActionTimes;
  if (nextTimes && nextTimes.length > 0) {
    const next = nextTimes[0];
    if (next) return formatRelativeTime(next);
  }
  return "—";
}

function formatLastRun(schedule: Schedule): string {
  const recentActions = schedule.info?.recentActions;
  if (recentActions && recentActions.length > 0) {
    const last = recentActions[recentActions.length - 1];
    if (last?.actualTime) return formatRelativeTime(last.actualTime);
  }
  return "—";
}

const SCHEDULE_COLUMNS: Column<Schedule>[] = [
  {
    key: "scheduleId",
    header: "SCHEDULE ID",
    width: 30,
  },
  {
    key: "workflowType",
    header: "WORKFLOW TYPE",
    width: 25,
  },
  {
    key: "state",
    header: "STATE",
    width: 10,
    render: (schedule) => {
      // Return plain text for table; styled via getStateStyle
      return schedule.state;
    },
  },
  {
    key: "spec",
    header: "SCHEDULE",
    width: 20,
    render: (schedule) => formatScheduleSpec(schedule),
  },
  {
    key: "nextRun",
    header: "NEXT RUN",
    width: 15,
    render: (schedule) => formatNextRun(schedule),
  },
  {
    key: "lastRun",
    header: "LAST RUN",
    width: "auto",
    render: (schedule) => formatLastRun(schedule),
  },
];

export class ScheduleList extends BoxRenderable {
  private store: Store;
  private unsubscribe: (() => void) | null = null;
  private table: Table<Schedule>;
  private headerText: TextRenderable;
  private onSelectSchedule?: (schedule: Schedule) => void;
  private onToggleSchedule?: (schedule: Schedule) => void;
  private onTriggerSchedule?: (schedule: Schedule) => void;
  private onDeleteSchedule?: (schedule: Schedule) => void;

  constructor(ctx: RenderContext, options: ScheduleListOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "schedule-list",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    });

    this.store = options.store;
    this.onSelectSchedule = options.onSelectSchedule;
    this.onToggleSchedule = options.onToggleSchedule;
    this.onTriggerSchedule = options.onTriggerSchedule;
    this.onDeleteSchedule = options.onDeleteSchedule;

    // Header
    this.headerText = new TextRenderable(ctx, {
      id: "schedule-header",
      height: 2,
      width: "100%",
      paddingLeft: 1,
      paddingTop: 1,
    });
    this.add(this.headerText);

    // Table
    const schedules = this.store.getState().schedules;
    this.table = new Table<Schedule>(ctx, {
      id: "schedule-table",
      columns: SCHEDULE_COLUMNS,
      data: schedules,
      emptyMessage: "No schedules found. Press 'n' to create one.",
      getRowId: (schedule) => schedule.scheduleId,
      onSelect: (schedule) => {
        if (this.onSelectSchedule) {
          this.onSelectSchedule(schedule);
        }
      },
    });
    this.add(this.table);

    this.updateHeader();

    // Subscribe to store changes
    this.unsubscribe = this.store.subscribe((state, prevState) => {
      if (state.schedules !== prevState.schedules) {
        this.table.setData(state.schedules);
        this.updateHeader();
      }
    });
  }

  private updateHeader(): void {
    const schedules = this.store.getState().schedules;
    const activeCount = schedules.filter((s) => s.state === "ACTIVE").length;
    const pausedCount = schedules.filter((s) => s.state === "PAUSED").length;

    this.headerText.content = t`${bold("Schedules")} ${dim(`(${schedules.length} total, ${activeCount} active, ${pausedCount} paused)`)}`;
  }

  get selectedSchedule(): Schedule | undefined {
    return this.table.selectedItem;
  }

  // Navigation
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

  // Schedule actions
  toggleSelected(): void {
    const schedule = this.selectedSchedule;
    if (schedule && this.onToggleSchedule) {
      this.onToggleSchedule(schedule);
    }
  }

  triggerSelected(): void {
    const schedule = this.selectedSchedule;
    if (schedule && this.onTriggerSchedule) {
      this.onTriggerSchedule(schedule);
    }
  }

  deleteSelected(): void {
    const schedule = this.selectedSchedule;
    if (schedule && this.onDeleteSchedule) {
      this.onDeleteSchedule(schedule);
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
