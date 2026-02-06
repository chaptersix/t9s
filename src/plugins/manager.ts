/**
 * Plugin Manager
 *
 * Handles plugin lifecycle: discovery, loading, activation, and deactivation
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { Store } from "../store";
import type { TemporalClient } from "../data/temporal/client";
import type { Plugin, PluginState, PluginManifest, CommandRegistration } from "./types";
import { createPluginContext, getGlobalRegistry, clearRegistry } from "./context";

const PLUGINS_DIR = join(homedir(), ".config", "temporal-tui", "plugins");

export interface PluginManagerOptions {
  store: Store;
  client: TemporalClient;
}

export class PluginManager {
  private store: Store;
  private client: TemporalClient;
  private plugins: Map<string, PluginState> = new Map();
  private builtinPlugins: Plugin[] = [];

  constructor(options: PluginManagerOptions) {
    this.store = options.store;
    this.client = options.client;
  }

  /**
   * Register a built-in plugin (bundled with the app)
   */
  registerBuiltin(plugin: Plugin): void {
    this.builtinPlugins.push(plugin);
  }

  /**
   * Initialize all plugins (built-in and discovered)
   */
  async initialize(): Promise<void> {
    // Clear any existing registrations
    clearRegistry();

    // Load built-in plugins first
    for (const plugin of this.builtinPlugins) {
      await this.loadPlugin(plugin);
    }

    // Discover and load external plugins
    await this.discoverPlugins();
  }

  /**
   * Load and activate a plugin
   */
  private async loadPlugin(plugin: Plugin): Promise<void> {
    const id = plugin.manifest.id;

    if (this.plugins.has(id)) {
      console.warn(`Plugin ${id} is already loaded`);
      return;
    }

    const state: PluginState = {
      plugin,
      status: "inactive",
    };

    this.plugins.set(id, state);

    try {
      await this.activatePlugin(id);
    } catch (error) {
      state.status = "error";
      state.error = error instanceof Error ? error : new Error(String(error));
      console.error(`Failed to activate plugin ${id}:`, error);
    }
  }

  /**
   * Activate a plugin
   */
  private async activatePlugin(id: string): Promise<void> {
    const state = this.plugins.get(id);
    if (!state) {
      throw new Error(`Plugin ${id} not found`);
    }

    if (state.status === "active") {
      return;
    }

    const { plugin } = state;
    const context = createPluginContext({
      store: this.store,
      client: this.client,
      pluginId: id,
    });

    // Register views
    if (plugin.views) {
      for (const view of plugin.views) {
        context.registerView(view);
      }
    }

    // Register commands
    if (plugin.commands) {
      for (const command of plugin.commands) {
        context.registerCommand(command);
      }
    }

    // Register keybindings
    if (plugin.keybindings) {
      for (const keybinding of plugin.keybindings) {
        context.registerKeybinding(keybinding);
      }
    }

    // Register status bar items
    if (plugin.statusBarItems) {
      for (const item of plugin.statusBarItems) {
        context.registerStatusBarItem(item);
      }
    }

    // Call activate hook
    if (plugin.activate) {
      await plugin.activate(context);
    }

    state.status = "active";
    state.activatedAt = new Date();

    console.log(`Plugin ${id} activated`);
  }

  /**
   * Deactivate a plugin
   */
  async deactivatePlugin(id: string): Promise<void> {
    const state = this.plugins.get(id);
    if (!state || state.status !== "active") {
      return;
    }

    const { plugin } = state;

    // Call deactivate hook
    if (plugin.deactivate) {
      await plugin.deactivate();
    }

    state.status = "inactive";
    console.log(`Plugin ${id} deactivated`);
  }

  /**
   * Discover plugins from the plugins directory
   */
  private async discoverPlugins(): Promise<void> {
    if (!existsSync(PLUGINS_DIR)) {
      return;
    }

    const entries = readdirSync(PLUGINS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = join(PLUGINS_DIR, entry.name);
      const manifestPath = join(pluginPath, "package.json");

      if (!existsSync(manifestPath)) {
        console.warn(`Plugin ${entry.name} missing package.json`);
        continue;
      }

      try {
        const manifestData = readFileSync(manifestPath, "utf-8");
        const packageJson = JSON.parse(manifestData) as {
          name?: string;
          version?: string;
          description?: string;
          author?: string;
          main?: string;
          temporalTui?: {
            id?: string;
          };
        };

        const manifest: PluginManifest = {
          id: packageJson.temporalTui?.id ?? packageJson.name ?? entry.name,
          name: packageJson.name ?? entry.name,
          version: packageJson.version ?? "0.0.0",
          description: packageJson.description,
          author: packageJson.author,
        };

        // Try to load the plugin module
        const mainFile = packageJson.main ?? "index.ts";
        const modulePath = join(pluginPath, mainFile);

        if (!existsSync(modulePath)) {
          console.warn(`Plugin ${manifest.id} missing main file: ${mainFile}`);
          continue;
        }

        // Dynamic import (requires Bun)
        const module = await import(modulePath);
        const pluginFactory = module.default ?? module.plugin ?? module.createPlugin;

        if (typeof pluginFactory !== "function") {
          console.warn(`Plugin ${manifest.id} does not export a valid plugin factory`);
          continue;
        }

        const plugin: Plugin = pluginFactory();
        plugin.manifest = manifest;

        await this.loadPlugin(plugin);
      } catch (error) {
        console.error(`Failed to load plugin from ${pluginPath}:`, error);
      }
    }
  }

  /**
   * Get all registered commands from all plugins
   */
  getCommands(): CommandRegistration[] {
    const registry = getGlobalRegistry();
    return Array.from(registry.commands.values());
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): Map<string, PluginState> {
    return new Map(this.plugins);
  }

  /**
   * Get a specific plugin state
   */
  getPlugin(id: string): PluginState | undefined {
    return this.plugins.get(id);
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    for (const [id] of this.plugins) {
      await this.deactivatePlugin(id);
    }
    this.plugins.clear();
    clearRegistry();
  }
}

let globalManager: PluginManager | null = null;

export function createPluginManager(options: PluginManagerOptions): PluginManager {
  globalManager = new PluginManager(options);
  return globalManager;
}

export function getPluginManager(): PluginManager | null {
  return globalManager;
}
