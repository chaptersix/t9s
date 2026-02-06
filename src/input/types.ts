/**
 * Input handling types
 */

import type { KeyEvent } from "@opentui/core";

export type KeyContext =
  | "global"
  | "workflows"
  | "workflow-detail"
  | "schedules"
  | "schedule-detail"
  | "task-queues"
  | "namespace-selector"
  | "command-palette"
  | "modal";

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  action: string;
  description: string;
}

export interface KeySequence {
  keys: string[];
  action: string;
  description: string;
}

export type KeyAction =
  // Navigation
  | { type: "MOVE_UP" }
  | { type: "MOVE_DOWN" }
  | { type: "MOVE_LEFT" }
  | { type: "MOVE_RIGHT" }
  | { type: "MOVE_TO_TOP" }
  | { type: "MOVE_TO_BOTTOM" }
  | { type: "PAGE_UP" }
  | { type: "PAGE_DOWN" }
  | { type: "SELECT" }
  | { type: "BACK" }
  // View switching
  | { type: "SWITCH_VIEW"; payload: string }
  | { type: "NEXT_TAB" }
  | { type: "PREV_TAB" }
  // Workflow actions
  | { type: "SIGNAL_WORKFLOW" }
  | { type: "QUERY_WORKFLOW" }
  | { type: "CANCEL_WORKFLOW" }
  | { type: "TERMINATE_WORKFLOW" }
  | { type: "RESET_WORKFLOW" }
  // Schedule actions
  | { type: "TOGGLE_SCHEDULE" }
  | { type: "TRIGGER_SCHEDULE" }
  | { type: "DELETE_SCHEDULE" }
  // Activity actions
  | { type: "PAUSE_ACTIVITY" }
  | { type: "UNPAUSE_ACTIVITY" }
  | { type: "RESET_ACTIVITY" }
  // UI actions
  | { type: "TOGGLE_COMMAND_PALETTE" }
  | { type: "TOGGLE_NAMESPACE_SELECTOR" }
  | { type: "OPEN_COMMAND_INPUT" }
  | { type: "SEARCH" }
  | { type: "CYCLE_FILTER" }
  | { type: "TOGGLE_VIEW_MODE" }
  | { type: "REFRESH" }
  | { type: "HELP" }
  | { type: "QUIT" };

export interface KeyHandler {
  handleKey(key: KeyEvent, context: KeyContext): KeyAction | null;
  getBindings(context: KeyContext): KeyBinding[];
  getSequences(): KeySequence[];
}
