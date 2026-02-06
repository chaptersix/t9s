/**
 * Key Handler Unit Tests
 */

import { describe, test, expect } from "bun:test";
import { createKeyHandler } from "../keyHandler";
import type { KeyEvent } from "@opentui/core";

// Create a mock KeyEvent with required properties for testing
// Uses unknown cast to satisfy the type system while keeping tests simple
function createKeyEvent(
  name: string,
  options: { ctrl?: boolean; shift?: boolean; meta?: boolean } = {}
): KeyEvent {
  return {
    name,
    ctrl: options.ctrl ?? false,
    shift: options.shift ?? false,
    meta: options.meta ?? false,
    option: false,
    number: false,
    raw: name,
    eventType: "keypress",
    key: name,
    sequence: name,
    code: name,
    full: name,
    source: "keyboard",
    _defaultPrevented: false,
    _propagationStopped: false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as KeyEvent;
}

describe("Key Handler", () => {
  describe("createKeyHandler", () => {
    test("returns handler object with required methods", () => {
      const handler = createKeyHandler();

      expect(typeof handler.handleKey).toBe("function");
      expect(typeof handler.getBindings).toBe("function");
      expect(typeof handler.getSequences).toBe("function");
    });
  });

  describe("handleKey", () => {
    test("returns QUIT action for q key", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("q"), "workflows");

      expect(action).toEqual({ type: "QUIT" });
    });

    test("returns QUIT action for Ctrl+C", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("c", { ctrl: true }), "workflows");

      expect(action).toEqual({ type: "QUIT" });
    });

    test("returns TOGGLE_COMMAND_PALETTE for Ctrl+P", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("p", { ctrl: true }), "workflows");

      expect(action).toEqual({ type: "TOGGLE_COMMAND_PALETTE" });
    });

    test("returns HELP action for ?", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("?"), "workflows");

      expect(action).toEqual({ type: "HELP" });
    });

    test("returns REFRESH for Ctrl+R", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("r", { ctrl: true }), "workflows");

      expect(action).toEqual({ type: "REFRESH" });
    });
  });

  describe("navigation keys", () => {
    test("j moves down", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("j"), "workflows");

      expect(action).toEqual({ type: "MOVE_DOWN" });
    });

    test("k moves up", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("k"), "workflows");

      expect(action).toEqual({ type: "MOVE_UP" });
    });

    test("h moves left", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("h"), "workflows");

      expect(action).toEqual({ type: "MOVE_LEFT" });
    });

    test("l moves right", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("l"), "workflows");

      expect(action).toEqual({ type: "MOVE_RIGHT" });
    });

    test("arrow keys work as alternatives", () => {
      const handler = createKeyHandler();

      expect(handler.handleKey(createKeyEvent("down"), "workflows")).toEqual({ type: "MOVE_DOWN" });
      expect(handler.handleKey(createKeyEvent("up"), "workflows")).toEqual({ type: "MOVE_UP" });
      expect(handler.handleKey(createKeyEvent("left"), "workflows")).toEqual({ type: "MOVE_LEFT" });
      expect(handler.handleKey(createKeyEvent("right"), "workflows")).toEqual({ type: "MOVE_RIGHT" });
    });

    test("Ctrl+D pages down", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("d", { ctrl: true }), "workflows");

      expect(action).toEqual({ type: "PAGE_DOWN" });
    });

    test("Ctrl+U pages up", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("u", { ctrl: true }), "workflows");

      expect(action).toEqual({ type: "PAGE_UP" });
    });

    test("Enter/Return selects", () => {
      const handler = createKeyHandler();

      expect(handler.handleKey(createKeyEvent("enter"), "workflows")).toEqual({ type: "SELECT" });
      expect(handler.handleKey(createKeyEvent("return"), "workflows")).toEqual({ type: "SELECT" });
    });

    test("Escape goes back", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("escape"), "workflows");

      expect(action).toEqual({ type: "BACK" });
    });

    test("Shift+G goes to bottom", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("G", { shift: true }), "workflows");

      expect(action).toEqual({ type: "MOVE_TO_BOTTOM" });
    });
  });

  describe("view switching", () => {
    test("1 switches to workflows", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("1"), "schedules");

      expect(action).toEqual({ type: "SWITCH_VIEW", payload: "workflows" });
    });

    test("2 switches to schedules", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("2"), "workflows");

      expect(action).toEqual({ type: "SWITCH_VIEW", payload: "schedules" });
    });

    test("3 switches to task-queues", () => {
      const handler = createKeyHandler();
      const action = handler.handleKey(createKeyEvent("3"), "workflows");

      expect(action).toEqual({ type: "SWITCH_VIEW", payload: "task-queues" });
    });
  });

  describe("context-specific bindings", () => {
    test("workflow context has workflow actions", () => {
      const handler = createKeyHandler();

      expect(handler.handleKey(createKeyEvent("c"), "workflows")).toEqual({ type: "CANCEL_WORKFLOW" });
      expect(handler.handleKey(createKeyEvent("t"), "workflows")).toEqual({ type: "TERMINATE_WORKFLOW" });
      expect(handler.handleKey(createKeyEvent("/"), "workflows")).toEqual({ type: "SEARCH" });
    });

    test("workflow-detail has activity actions", () => {
      const handler = createKeyHandler();

      expect(handler.handleKey(createKeyEvent("p"), "workflow-detail")).toEqual({ type: "PAUSE_ACTIVITY" });
      expect(handler.handleKey(createKeyEvent("u"), "workflow-detail")).toEqual({ type: "UNPAUSE_ACTIVITY" });
      expect(handler.handleKey(createKeyEvent("R", { shift: true }), "workflow-detail")).toEqual({ type: "RESET_ACTIVITY" });
    });

    test("schedule context has schedule actions", () => {
      const handler = createKeyHandler();

      expect(handler.handleKey(createKeyEvent("p"), "schedules")).toEqual({ type: "TOGGLE_SCHEDULE" });
      expect(handler.handleKey(createKeyEvent("T", { shift: true }), "schedules")).toEqual({ type: "TRIGGER_SCHEDULE" });
      expect(handler.handleKey(createKeyEvent("d"), "schedules")).toEqual({ type: "DELETE_SCHEDULE" });
    });

    test("command-palette has limited bindings", () => {
      const handler = createKeyHandler();
      const bindings = handler.getBindings("command-palette");

      // Should only have navigation and close
      const actions = bindings.map((b) => b.action);
      expect(actions).toContain("BACK");
      expect(actions).toContain("MOVE_UP");
      expect(actions).toContain("MOVE_DOWN");
      expect(actions).toContain("SELECT");
      expect(actions).not.toContain("QUIT");
    });
  });

  describe("getBindings", () => {
    test("returns bindings for workflows context", () => {
      const handler = createKeyHandler();
      const bindings = handler.getBindings("workflows");

      expect(bindings.length).toBeGreaterThan(0);
      expect(bindings.some((b) => b.action === "CANCEL_WORKFLOW")).toBe(true);
    });

    test("returns bindings for schedules context", () => {
      const handler = createKeyHandler();
      const bindings = handler.getBindings("schedules");

      expect(bindings.some((b) => b.action === "TOGGLE_SCHEDULE")).toBe(true);
    });
  });

  describe("getSequences", () => {
    test("returns key sequences", () => {
      const handler = createKeyHandler();
      const sequences = handler.getSequences();

      expect(sequences).toBeInstanceOf(Array);
      expect(sequences.some((s) => s.keys.join("") === "gg")).toBe(true);
    });
  });

  describe("key sequences", () => {
    test("gg goes to top", async () => {
      const handler = createKeyHandler();

      // First g
      const action1 = handler.handleKey(createKeyEvent("g"), "workflows");
      expect(action1).toBeNull(); // Waiting for sequence

      // Second g
      const action2 = handler.handleKey(createKeyEvent("g"), "workflows");
      expect(action2).toEqual({ type: "MOVE_TO_TOP" });
    });
  });

  describe("modifier handling", () => {
    test("ignores ctrl modifier when not expected", () => {
      const handler = createKeyHandler();

      // 'j' with ctrl should not trigger MOVE_DOWN
      const action = handler.handleKey(createKeyEvent("j", { ctrl: true }), "workflows");

      // Since 'j' binding doesn't require ctrl, and ctrl is pressed, it shouldn't match
      expect(action).toBeNull();
    });

    test("requires ctrl when binding specifies it", () => {
      const handler = createKeyHandler();

      // 'p' without ctrl triggers something else in some contexts
      // 'p' with ctrl should trigger TOGGLE_COMMAND_PALETTE
      const action = handler.handleKey(createKeyEvent("p", { ctrl: true }), "workflows");
      expect(action).toEqual({ type: "TOGGLE_COMMAND_PALETTE" });
    });
  });
});
