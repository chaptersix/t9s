/**
 * Saved Views - persistence for frequently used visibility queries
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SavedView {
  id: string;
  name: string;
  description?: string;
  query: string;
  columns?: string[];
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  createdAt: string;
  updatedAt: string;
}

export interface SavedViewsConfig {
  version: string;
  views: SavedView[];
}

const CONFIG_DIR = join(homedir(), ".config", "temporal-tui");
const SAVED_VIEWS_FILE = join(CONFIG_DIR, "saved-views.json");

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function getDefaultConfig(): SavedViewsConfig {
  return {
    version: "1.0",
    views: [
      {
        id: "running",
        name: "Running Workflows",
        description: "All currently running workflows",
        query: "ExecutionStatus='Running'",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "failed-today",
        name: "Failed Today",
        description: "Workflows that failed in the last 24 hours",
        query: "ExecutionStatus='Failed' AND CloseTime > '24h'",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "long-running",
        name: "Long Running",
        description: "Workflows running for more than 1 hour",
        query: "ExecutionStatus='Running' AND StartTime < '1h'",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
}

export function loadSavedViews(): SavedViewsConfig {
  ensureConfigDir();

  if (!existsSync(SAVED_VIEWS_FILE)) {
    // Create default config
    const defaultConfig = getDefaultConfig();
    saveSavedViews(defaultConfig);
    return defaultConfig;
  }

  try {
    const data = readFileSync(SAVED_VIEWS_FILE, "utf-8");
    return JSON.parse(data) as SavedViewsConfig;
  } catch {
    // Return default if file is corrupted
    return getDefaultConfig();
  }
}

export function saveSavedViews(config: SavedViewsConfig): void {
  ensureConfigDir();
  writeFileSync(SAVED_VIEWS_FILE, JSON.stringify(config, null, 2));
}

export function addSavedView(view: Omit<SavedView, "id" | "createdAt" | "updatedAt">): SavedView {
  const config = loadSavedViews();

  const newView: SavedView = {
    ...view,
    id: `view-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  config.views.push(newView);
  saveSavedViews(config);

  return newView;
}

export function updateSavedView(id: string, updates: Partial<Omit<SavedView, "id" | "createdAt">>): SavedView | null {
  const config = loadSavedViews();

  const viewIndex = config.views.findIndex((v) => v.id === id);
  if (viewIndex === -1) return null;

  const existingView = config.views[viewIndex];
  if (!existingView) return null;

  const updatedView: SavedView = {
    ...existingView,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  config.views[viewIndex] = updatedView;
  saveSavedViews(config);

  return updatedView;
}

export function deleteSavedView(id: string): boolean {
  const config = loadSavedViews();

  const viewIndex = config.views.findIndex((v) => v.id === id);
  if (viewIndex === -1) return false;

  config.views.splice(viewIndex, 1);
  saveSavedViews(config);

  return true;
}

export function getSavedViewByIndex(index: number): SavedView | null {
  const config = loadSavedViews();
  return config.views[index] ?? null;
}

export function getSavedViewById(id: string): SavedView | null {
  const config = loadSavedViews();
  return config.views.find((v) => v.id === id) ?? null;
}
