/**
 * Key handler with vim-style bindings
 */

import type { KeyEvent } from "@opentui/core";
import type {
  KeyAction,
  KeyBinding,
  KeyContext,
  KeyHandler,
  KeySequence,
} from "./types";
import { logger } from "../utils/logger";

// Global bindings (work in all contexts)
const GLOBAL_BINDINGS: KeyBinding[] = [
  { key: "q", action: "QUIT", description: "Quit application" },
  { key: "c", ctrl: true, action: "QUIT", description: "Quit application" },
  { key: "p", ctrl: true, action: "TOGGLE_COMMAND_PALETTE", description: "Toggle command palette" },
  { key: "r", ctrl: true, action: "REFRESH", description: "Refresh current view" },
  { key: "?", action: "HELP", description: "Show help" },
  { key: "1", action: "SWITCH_VIEW:workflows", description: "Switch to workflows" },
  { key: "2", action: "SWITCH_VIEW:schedules", description: "Switch to schedules" },
  { key: "3", action: "SWITCH_VIEW:task-queues", description: "Switch to task queues" },
  { key: "n", action: "TOGGLE_NAMESPACE_SELECTOR", description: "Select namespace" },
];

// Navigation bindings (vim-style)
const NAVIGATION_BINDINGS: KeyBinding[] = [
  { key: "j", action: "MOVE_DOWN", description: "Move down" },
  { key: "down", action: "MOVE_DOWN", description: "Move down" },
  { key: "k", action: "MOVE_UP", description: "Move up" },
  { key: "up", action: "MOVE_UP", description: "Move up" },
  { key: "h", action: "MOVE_LEFT", description: "Move left / collapse" },
  { key: "left", action: "MOVE_LEFT", description: "Move left / collapse" },
  { key: "l", action: "MOVE_RIGHT", description: "Move right / expand" },
  { key: "right", action: "MOVE_RIGHT", description: "Move right / expand" },
  { key: "d", ctrl: true, action: "PAGE_DOWN", description: "Page down" },
  { key: "u", ctrl: true, action: "PAGE_UP", description: "Page up" },
  { key: "return", action: "SELECT", description: "Select / open" },
  { key: "enter", action: "SELECT", description: "Select / open" },
  { key: "escape", action: "BACK", description: "Go back / cancel" },
  { key: "tab", action: "NEXT_TAB", description: "Next tab" },
  { key: "tab", shift: true, action: "PREV_TAB", description: "Previous tab" },
];

// Workflow-specific bindings
const WORKFLOW_BINDINGS: KeyBinding[] = [
  { key: "s", action: "SIGNAL_WORKFLOW", description: "Signal workflow" },
  { key: "/", action: "SEARCH", description: "Search workflows" },
  { key: "tab", action: "CYCLE_FILTER", description: "Cycle status filter" },
  { key: "c", action: "CANCEL_WORKFLOW", description: "Cancel workflow" },
  { key: "t", action: "TERMINATE_WORKFLOW", description: "Terminate workflow" },
];

// Workflow detail bindings
const WORKFLOW_DETAIL_BINDINGS: KeyBinding[] = [
  { key: "s", action: "SIGNAL_WORKFLOW", description: "Signal workflow" },
  { key: "c", action: "CANCEL_WORKFLOW", description: "Cancel workflow" },
  { key: "t", action: "TERMINATE_WORKFLOW", description: "Terminate workflow" },
  { key: "r", action: "RESET_WORKFLOW", description: "Reset workflow" },
  { key: "v", action: "TOGGLE_VIEW_MODE", description: "Toggle compact/detailed view" },
  // Activity actions (work on pending tab)
  { key: "p", action: "PAUSE_ACTIVITY", description: "Pause selected activity" },
  { key: "u", action: "UNPAUSE_ACTIVITY", description: "Unpause selected activity" },
  { key: "R", shift: true, action: "RESET_ACTIVITY", description: "Reset selected activity" },
];

// Schedule bindings
const SCHEDULE_BINDINGS: KeyBinding[] = [
  { key: "p", action: "TOGGLE_SCHEDULE", description: "Toggle schedule pause" },
  { key: "T", shift: true, action: "TRIGGER_SCHEDULE", description: "Trigger schedule" },
  { key: "d", action: "DELETE_SCHEDULE", description: "Delete schedule" },
];

// Schedule detail bindings
const SCHEDULE_DETAIL_BINDINGS: KeyBinding[] = [
  { key: "p", action: "TOGGLE_SCHEDULE", description: "Toggle schedule pause" },
  { key: "T", shift: true, action: "TRIGGER_SCHEDULE", description: "Trigger schedule" },
];

// Vim key sequences (e.g., gg, G)
const KEY_SEQUENCES: KeySequence[] = [
  { keys: ["g", "g"], action: "MOVE_TO_TOP", description: "Go to top" },
];

// Single key for G (go to bottom)
const SINGLE_KEY_SEQUENCES: KeyBinding[] = [
  { key: "G", shift: true, action: "MOVE_TO_BOTTOM", description: "Go to bottom" },
];

function getBindingsForContext(context: KeyContext): KeyBinding[] {
  const bindings = [...GLOBAL_BINDINGS, ...NAVIGATION_BINDINGS, ...SINGLE_KEY_SEQUENCES];

  switch (context) {
    case "workflows":
      return [...bindings, ...WORKFLOW_BINDINGS];
    case "workflow-detail":
      return [...bindings, ...WORKFLOW_DETAIL_BINDINGS];
    case "schedules":
      return [...bindings, ...SCHEDULE_BINDINGS];
    case "schedule-detail":
      return [...bindings, ...SCHEDULE_DETAIL_BINDINGS];
    case "command-palette":
      // Command palette only has navigation
      return [
        { key: "escape", action: "BACK", description: "Close palette" },
        { key: "j", action: "MOVE_DOWN", description: "Move down" },
        { key: "down", action: "MOVE_DOWN", description: "Move down" },
        { key: "k", action: "MOVE_UP", description: "Move up" },
        { key: "up", action: "MOVE_UP", description: "Move up" },
        { key: "return", action: "SELECT", description: "Select command" },
        { key: "enter", action: "SELECT", description: "Select command" },
      ];
    case "modal":
      // Modal only has escape
      return [
        { key: "escape", action: "BACK", description: "Close modal" },
        { key: "return", action: "SELECT", description: "Confirm" },
        { key: "enter", action: "SELECT", description: "Confirm" },
      ];
    default:
      return bindings;
  }
}

function matchBinding(key: KeyEvent, binding: KeyBinding): boolean {
  const keyName = key.name.toLowerCase();
  const bindingKey = binding.key.toLowerCase();

  // Check key name match
  if (keyName !== bindingKey) {
    return false;
  }

  // Check modifiers
  if (binding.ctrl && !key.ctrl) return false;
  if (binding.meta && !key.meta) return false;
  if (binding.shift && !key.shift) return false;

  // Also check reverse - if binding doesn't require modifier but key has it
  if (!binding.ctrl && key.ctrl && binding.key !== "c") return false;
  if (!binding.meta && key.meta) return false;
  // For shift, only check on letter keys (not special keys like G, ?, etc.)
  if (!binding.shift && key.shift && /^[a-z]$/i.test(binding.key)) return false;

  return true;
}

function parseAction(actionStr: string): KeyAction | null {
  // Handle parameterized actions
  if (actionStr.startsWith("SWITCH_VIEW:")) {
    const view = actionStr.split(":")[1] ?? "";
    return { type: "SWITCH_VIEW", payload: view };
  }

  // Map string actions to KeyAction types
  const actionMap: Record<string, KeyAction> = {
    QUIT: { type: "QUIT" },
    TOGGLE_COMMAND_PALETTE: { type: "TOGGLE_COMMAND_PALETTE" },
    REFRESH: { type: "REFRESH" },
    HELP: { type: "HELP" },
    MOVE_UP: { type: "MOVE_UP" },
    MOVE_DOWN: { type: "MOVE_DOWN" },
    MOVE_LEFT: { type: "MOVE_LEFT" },
    MOVE_RIGHT: { type: "MOVE_RIGHT" },
    MOVE_TO_TOP: { type: "MOVE_TO_TOP" },
    MOVE_TO_BOTTOM: { type: "MOVE_TO_BOTTOM" },
    PAGE_UP: { type: "PAGE_UP" },
    PAGE_DOWN: { type: "PAGE_DOWN" },
    SELECT: { type: "SELECT" },
    BACK: { type: "BACK" },
    NEXT_TAB: { type: "NEXT_TAB" },
    PREV_TAB: { type: "PREV_TAB" },
    SIGNAL_WORKFLOW: { type: "SIGNAL_WORKFLOW" },
    QUERY_WORKFLOW: { type: "QUERY_WORKFLOW" },
    CANCEL_WORKFLOW: { type: "CANCEL_WORKFLOW" },
    TERMINATE_WORKFLOW: { type: "TERMINATE_WORKFLOW" },
    RESET_WORKFLOW: { type: "RESET_WORKFLOW" },
    TOGGLE_SCHEDULE: { type: "TOGGLE_SCHEDULE" },
    TRIGGER_SCHEDULE: { type: "TRIGGER_SCHEDULE" },
    DELETE_SCHEDULE: { type: "DELETE_SCHEDULE" },
    PAUSE_ACTIVITY: { type: "PAUSE_ACTIVITY" },
    UNPAUSE_ACTIVITY: { type: "UNPAUSE_ACTIVITY" },
    RESET_ACTIVITY: { type: "RESET_ACTIVITY" },
    SEARCH: { type: "SEARCH" },
    CYCLE_FILTER: { type: "CYCLE_FILTER" },
    TOGGLE_VIEW_MODE: { type: "TOGGLE_VIEW_MODE" },
    TOGGLE_NAMESPACE_SELECTOR: { type: "TOGGLE_NAMESPACE_SELECTOR" },
  };

  return actionMap[actionStr] || null;
}

export function createKeyHandler(): KeyHandler {
  // Track key sequence buffer for vim-style sequences
  let keyBuffer: string[] = [];
  let keyBufferTimeout: ReturnType<typeof setTimeout> | null = null;
  const SEQUENCE_TIMEOUT = 500; // ms

  function clearKeyBuffer(): void {
    keyBuffer = [];
    if (keyBufferTimeout) {
      clearTimeout(keyBufferTimeout);
      keyBufferTimeout = null;
    }
  }

  function handleKey(key: KeyEvent, context: KeyContext): KeyAction | null {
    // Log the key press
    logger.keyPress(key.name, {
      ctrl: key.ctrl,
      shift: key.shift,
      alt: key.meta,
    });

    // Reset sequence timeout
    if (keyBufferTimeout) {
      clearTimeout(keyBufferTimeout);
    }

    // Add key to buffer
    keyBuffer.push(key.name.toLowerCase());

    // Check for sequence matches
    for (const seq of KEY_SEQUENCES) {
      if (
        keyBuffer.length >= seq.keys.length &&
        keyBuffer.slice(-seq.keys.length).join(",") === seq.keys.join(",")
      ) {
        clearKeyBuffer();
        const action = parseAction(seq.action);
        logger.debug("KEY", `Sequence matched: ${seq.keys.join(" ")} -> ${seq.action}`, { action });
        return action;
      }
    }

    // Set timeout to clear buffer
    keyBufferTimeout = setTimeout(clearKeyBuffer, SEQUENCE_TIMEOUT);

    // If buffer has multiple keys, wait for potential sequence
    if (keyBuffer.length > 1 && keyBuffer[0] === "g") {
      // Still building sequence
      return null;
    }

    // Check single-key bindings
    const bindings = getBindingsForContext(context);
    for (const binding of bindings) {
      if (matchBinding(key, binding)) {
        clearKeyBuffer();
        const action = parseAction(binding.action);
        logger.debug("KEY", `Binding matched: ${binding.key} -> ${binding.action}`, { context, action });
        return action;
      }
    }

    // No match found - clear buffer after timeout
    return null;
  }

  return {
    handleKey,
    getBindings: getBindingsForContext,
    getSequences: () => KEY_SEQUENCES,
  };
}
