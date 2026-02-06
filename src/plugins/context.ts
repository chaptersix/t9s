/**
 * Plugin Context Implementation
 *
 * Provides the API surface for plugins to interact with the application
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import type { Store } from "../store";
import type { TemporalClient } from "../data/temporal/client";
import type {
  PluginContext,
  ViewRegistration,
  CommandRegistration,
  KeybindingRegistration,
  StatusBarItemRegistration,
  ModalOptions,
  ModalResult,
} from "./types";

export interface ContextOptions {
  store: Store;
  client: TemporalClient;
  pluginId: string;
}

/**
 * Registry for plugin-registered items
 */
export interface PluginRegistry {
  views: Map<string, ViewRegistration>;
  commands: Map<string, CommandRegistration>;
  keybindings: KeybindingRegistration[];
  statusBarItems: Map<string, StatusBarItemRegistration>;
}

// Global registry shared across all plugins
const globalRegistry: PluginRegistry = {
  views: new Map(),
  commands: new Map(),
  keybindings: [],
  statusBarItems: new Map(),
};

export function getGlobalRegistry(): PluginRegistry {
  return globalRegistry;
}

export function clearRegistry(): void {
  globalRegistry.views.clear();
  globalRegistry.commands.clear();
  globalRegistry.keybindings.length = 0;
  globalRegistry.statusBarItems.clear();
}

/**
 * Create a plugin context for a specific plugin
 */
export function createPluginContext(options: ContextOptions): PluginContext {
  const { store, client, pluginId } = options;

  // Ensure plugin data directory exists
  const pluginDataPath = join(homedir(), ".config", "temporal-tui", "plugins", pluginId);

  return {
    // State access
    getState() {
      return store.getState();
    },

    dispatch(action) {
      store.dispatch(action);
    },

    subscribe(listener) {
      return store.subscribe(listener);
    },

    // Temporal client
    getTemporalClient() {
      return client;
    },

    // UI operations
    showNotification(message, type = "info") {
      // For now, just set as error in store (we can enhance this later)
      if (type === "error" || type === "warning") {
        store.dispatch({ type: "SET_ERROR", payload: message });
      }
      // TODO: Implement proper notification system
      console.log(`[${type.toUpperCase()}] ${message}`);
    },

    async showModal(_options: ModalOptions): Promise<ModalResult> {
      // TODO: Implement modal system integration
      // For now, return a default result
      return { confirmed: false };
    },

    registerView(view) {
      const fullId = `${pluginId}:${view.id}`;
      globalRegistry.views.set(fullId, { ...view, id: fullId });
    },

    registerCommand(command) {
      const fullId = `${pluginId}:${command.id}`;
      globalRegistry.commands.set(fullId, {
        ...command,
        id: fullId,
        category: command.category ?? pluginId,
      });
    },

    registerKeybinding(keybinding) {
      globalRegistry.keybindings.push(keybinding);
    },

    registerStatusBarItem(item) {
      const fullId = `${pluginId}:${item.id}`;
      globalRegistry.statusBarItems.set(fullId, { ...item, id: fullId });
    },

    // Plugin utilities
    getPluginDataPath() {
      if (!existsSync(pluginDataPath)) {
        mkdirSync(pluginDataPath, { recursive: true });
      }
      return pluginDataPath;
    },

    log(level, message) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${pluginId}] [${level.toUpperCase()}]`;
      switch (level) {
        case "debug":
          console.debug(`${prefix} ${message}`);
          break;
        case "info":
          console.info(`${prefix} ${message}`);
          break;
        case "warn":
          console.warn(`${prefix} ${message}`);
          break;
        case "error":
          console.error(`${prefix} ${message}`);
          break;
      }
    },
  };
}
