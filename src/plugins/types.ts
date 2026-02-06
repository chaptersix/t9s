/**
 * Plugin System Types
 *
 * Defines the interface for extending Temporal TUI functionality
 */

import type { RenderContext, Renderable } from "@opentui/core";
import type { Store } from "../store";
import type { TemporalClient } from "../data/temporal/client";
import type { KeyBinding, KeyAction } from "../input/types";

/**
 * Plugin metadata
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  dependencies?: Record<string, string>;
}

/**
 * Registration for a custom view
 */
export interface ViewRegistration {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  /** Factory function to create the view */
  create: (ctx: RenderContext, context: PluginContext) => Renderable;
  /** Whether to show in tab bar (default: false) */
  showInTabBar?: boolean;
  /** Tab bar order (lower = earlier) */
  tabOrder?: number;
}

/**
 * Registration for a command (appears in command palette)
 */
export interface CommandRegistration {
  id: string;
  name: string;
  description: string;
  category?: string;
  shortcut?: string;
  /** Condition for when command is available */
  when?: (context: PluginContext) => boolean;
  /** Execute the command */
  execute: (context: PluginContext) => void | Promise<void>;
}

/**
 * Registration for keybindings
 */
export interface KeybindingRegistration {
  binding: KeyBinding;
  /** Context where this binding is active */
  context?: string;
  /** Action to execute */
  action: KeyAction | ((context: PluginContext) => void);
}

/**
 * Registration for status bar items
 */
export interface StatusBarItemRegistration {
  id: string;
  /** Priority (higher = more to the right) */
  priority?: number;
  /** Get the content to display */
  render: (context: PluginContext) => string;
  /** Click handler */
  onClick?: (context: PluginContext) => void;
}

/**
 * Hook types for plugin lifecycle
 */
export interface PluginHooks {
  /** Called when a workflow is selected */
  onWorkflowSelected?: (workflowId: string, runId: string) => void;
  /** Called when view changes */
  onViewChanged?: (view: string) => void;
  /** Called on each poll cycle */
  onPoll?: () => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

/**
 * Context provided to plugins for interacting with the application
 */
export interface PluginContext {
  // Application state
  getState(): ReturnType<Store["getState"]>;
  dispatch(action: Parameters<Store["dispatch"]>[0]): void;
  subscribe(listener: Parameters<Store["subscribe"]>[0]): () => void;

  // Temporal client
  getTemporalClient(): TemporalClient;

  // UI operations
  showNotification(message: string, type?: "info" | "success" | "warning" | "error"): void;
  showModal(options: ModalOptions): Promise<ModalResult>;
  registerView(view: ViewRegistration): void;
  registerCommand(command: CommandRegistration): void;
  registerKeybinding(keybinding: KeybindingRegistration): void;
  registerStatusBarItem(item: StatusBarItemRegistration): void;

  // Plugin utilities
  getPluginDataPath(): string;
  log(level: "debug" | "info" | "warn" | "error", message: string): void;
}

export interface ModalOptions {
  title: string;
  message?: string;
  type?: "confirm" | "prompt" | "info";
  confirmText?: string;
  cancelText?: string;
  defaultValue?: string;
}

export interface ModalResult {
  confirmed: boolean;
  value?: string;
}

/**
 * Main plugin interface
 */
export interface Plugin {
  /** Plugin metadata */
  manifest: PluginManifest;

  /** Called when plugin is loaded */
  activate?(context: PluginContext): void | Promise<void>;

  /** Called when plugin is unloaded */
  deactivate?(): void | Promise<void>;

  /** Optional hooks */
  hooks?: PluginHooks;

  /** View registrations */
  views?: ViewRegistration[];

  /** Command registrations */
  commands?: CommandRegistration[];

  /** Keybinding registrations */
  keybindings?: KeybindingRegistration[];

  /** Status bar items */
  statusBarItems?: StatusBarItemRegistration[];
}

/**
 * Plugin factory function type (for dynamic loading)
 */
export type PluginFactory = () => Plugin;

/**
 * Plugin state for manager tracking
 */
export interface PluginState {
  plugin: Plugin;
  status: "inactive" | "active" | "error";
  error?: Error;
  activatedAt?: Date;
}
