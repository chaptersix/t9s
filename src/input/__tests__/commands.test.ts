/**
 * Tests for command parser
 */

import { describe, expect, test } from "bun:test";
import { parseCommand, getCommandSuggestions } from "../commands";

describe("Command Parser", () => {
  describe("parseCommand", () => {
    test("parses full command names", () => {
      expect(parseCommand("workflows")).toEqual({ command: "workflows", args: [] });
      expect(parseCommand("schedules")).toEqual({ command: "schedules", args: [] });
      expect(parseCommand("taskqueues")).toEqual({ command: "taskqueues", args: [] });
      expect(parseCommand("namespace")).toEqual({ command: "namespace", args: [] });
      expect(parseCommand("quit")).toEqual({ command: "quit", args: [] });
      expect(parseCommand("help")).toEqual({ command: "help", args: [] });
    });

    test("parses command aliases", () => {
      expect(parseCommand("wf")).toEqual({ command: "workflows", args: [] });
      expect(parseCommand("sch")).toEqual({ command: "schedules", args: [] });
      expect(parseCommand("tq")).toEqual({ command: "taskqueues", args: [] });
      expect(parseCommand("ns")).toEqual({ command: "namespace", args: [] });
      expect(parseCommand("q")).toEqual({ command: "quit", args: [] });
      expect(parseCommand("h")).toEqual({ command: "help", args: [] });
    });

    test("parses commands with arguments", () => {
      expect(parseCommand("ns default")).toEqual({ command: "namespace", args: ["default"] });
      expect(parseCommand("namespace production")).toEqual({ command: "namespace", args: ["production"] });
    });

    test("handles whitespace", () => {
      expect(parseCommand("  wf  ")).toEqual({ command: "workflows", args: [] });
      expect(parseCommand("ns   default")).toEqual({ command: "namespace", args: ["default"] });
    });

    test("is case insensitive", () => {
      expect(parseCommand("WF")).toEqual({ command: "workflows", args: [] });
      expect(parseCommand("Schedules")).toEqual({ command: "schedules", args: [] });
    });

    test("returns null for invalid commands", () => {
      expect(parseCommand("invalid")).toBeNull();
      expect(parseCommand("foo")).toBeNull();
      expect(parseCommand("")).toBeNull();
    });
  });

  describe("getCommandSuggestions", () => {
    test("suggests matching commands", () => {
      const suggestions = getCommandSuggestions("w");
      expect(suggestions).toContain("wf");
      expect(suggestions).toContain("workflows");
    });

    test("suggests from aliases", () => {
      const suggestions = getCommandSuggestions("sc");
      expect(suggestions).toContain("sch");
    });

    test("returns empty for no matches", () => {
      const suggestions = getCommandSuggestions("xyz");
      expect(suggestions).toEqual([]);
    });
  });
});
