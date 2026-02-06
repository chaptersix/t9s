/**
 * Debug Logger - Emits debug logs for key presses and state changes
 *
 * Logs are written to a file to avoid interfering with TUI output.
 * Enable by setting DEBUG=true environment variable.
 */

import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

const LOG_FILE = join(homedir(), ".temporal-tui.log");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
// Debug is on by default in dev, off in production (unless explicitly enabled)
const DEBUG_ENABLED =
  process.env.DEBUG === "true" ||
  process.env.DEBUG === "1" ||
  (!IS_PRODUCTION && process.env.DEBUG !== "false" && process.env.DEBUG !== "0");

let initialized = false;

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatEntry(entry: LogEntry): string {
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}${dataStr}\n`;
}

function writeLog(entry: LogEntry): void {
  if (!DEBUG_ENABLED) return;

  try {
    if (!initialized) {
      // Clear log file on each start
      writeFileSync(LOG_FILE, `--- Temporal TUI Debug Log Started ${formatTimestamp()} ---\n`);
      initialized = true;
    }
    appendFileSync(LOG_FILE, formatEntry(entry));
  } catch {
    // Silently ignore write errors to not disrupt TUI
  }
}

export const logger = {
  /**
   * Log a debug message
   */
  debug(category: string, message: string, data?: unknown): void {
    writeLog({
      timestamp: formatTimestamp(),
      level: "debug",
      category,
      message,
      data,
    });
  },

  /**
   * Log an info message
   */
  info(category: string, message: string, data?: unknown): void {
    writeLog({
      timestamp: formatTimestamp(),
      level: "info",
      category,
      message,
      data,
    });
  },

  /**
   * Log a warning message
   */
  warn(category: string, message: string, data?: unknown): void {
    writeLog({
      timestamp: formatTimestamp(),
      level: "warn",
      category,
      message,
      data,
    });
  },

  /**
   * Log an error message
   */
  error(category: string, message: string, data?: unknown): void {
    writeLog({
      timestamp: formatTimestamp(),
      level: "error",
      category,
      message,
      data,
    });
  },

  /**
   * Log a key press event
   */
  keyPress(key: string, modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean }): void {
    const modStr: string[] = [];
    if (modifiers?.ctrl) modStr.push("Ctrl");
    if (modifiers?.shift) modStr.push("Shift");
    if (modifiers?.alt) modStr.push("Alt");
    const fullKey = modStr.length > 0 ? `${modStr.join("+")}+${key}` : key;
    this.debug("KEY", `Key pressed: ${fullKey}`, { key, modifiers });
  },

  /**
   * Log a state change
   */
  stateChange(
    field: string,
    oldValue: unknown,
    newValue: unknown
  ): void {
    this.debug("STATE", `State changed: ${field}`, {
      field,
      from: oldValue,
      to: newValue,
    });
  },

  /**
   * Log a view change
   */
  viewChange(from: string | undefined, to: string): void {
    this.info("VIEW", `View changed: ${from ?? "none"} -> ${to}`);
  },

  /**
   * Check if debug logging is enabled
   */
  isEnabled(): boolean {
    return DEBUG_ENABLED;
  },

  /**
   * Get the log file path
   */
  getLogFile(): string {
    return LOG_FILE;
  },
};
