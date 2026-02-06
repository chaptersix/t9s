/**
 * FilterBar - search and filter controls for workflow list
 */

import {
  BoxRenderable,
  TextRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  dim,
  bold,
  cyan,
} from "@opentui/core";
import type { Store } from "../../store";
import type { WorkflowStatus, FilterCriteria } from "../../store/types";

export interface FilterBarOptions extends BoxOptions {
  store: Store;
  onFilterChange?: (filters: FilterCriteria) => void;
}

const STATUS_OPTIONS: { label: string; value: WorkflowStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Running", value: "Running" },
  { label: "Completed", value: "Completed" },
  { label: "Failed", value: "Failed" },
  { label: "Canceled", value: "Canceled" },
  { label: "Terminated", value: "Terminated" },
];

export class FilterBar extends BoxRenderable {
  private store: Store;
  private searchText: TextRenderable;
  private statusText: TextRenderable;
  private searchQuery: string = "";
  private selectedStatusIndex: number = 0;
  private isSearchFocused: boolean = false;
  private onFilterChangeCallback?: (filters: FilterCriteria) => void;
  private unsubscribe: (() => void) | null = null;

  constructor(ctx: RenderContext, options: FilterBarOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "filter-bar",
      height: 1,
      width: "100%",
      flexDirection: "row",
      backgroundColor: "#1a1a2e",
      paddingLeft: 1,
      paddingRight: 1,
      gap: 2,
    });

    this.store = options.store;
    this.onFilterChangeCallback = options.onFilterChange;

    // Search input display
    const searchLabel = new TextRenderable(ctx, {
      id: "search-label",
      width: 8,
    });
    searchLabel.content = t`${dim("Search:")}`;
    this.add(searchLabel);

    this.searchText = new TextRenderable(ctx, {
      id: "search-text",
      width: 20,
    });
    this.updateSearchDisplay();
    this.add(this.searchText);

    // Status filter
    const statusLabel = new TextRenderable(ctx, {
      id: "status-label",
      width: 8,
    });
    statusLabel.content = t`${dim("Status:")}`;
    this.add(statusLabel);

    this.statusText = new TextRenderable(ctx, {
      id: "status-text",
      width: 15,
    });
    this.updateStatusDisplay();
    this.add(this.statusText);

    // Hint
    const hint = new TextRenderable(ctx, {
      id: "filter-hint",
      flexGrow: 1,
    });
    hint.content = t`${dim("/ search  Tab status")}`;
    this.add(hint);

    // Subscribe to store
    this.unsubscribe = this.store.subscribe((state, prevState) => {
      if (state.searchQuery !== prevState.searchQuery) {
        this.searchQuery = state.searchQuery;
        this.updateSearchDisplay();
      }
    });
  }

  private updateSearchDisplay(): void {
    if (this.isSearchFocused) {
      this.searchText.content = t`${cyan(this.searchQuery + "▌")}`;
    } else if (this.searchQuery) {
      this.searchText.content = t`${this.searchQuery}`;
    } else {
      this.searchText.content = t`${dim("(none)")}`;
    }
  }

  private updateStatusDisplay(): void {
    const status = STATUS_OPTIONS[this.selectedStatusIndex];
    if (status) {
      this.statusText.content = t`${bold(status.label)}`;
    }
  }

  private emitFilterChange(): void {
    const status = STATUS_OPTIONS[this.selectedStatusIndex];
    const filters: FilterCriteria = {};

    if (this.searchQuery) {
      // Build visibility query from search text
      filters.query = this.searchQuery;
    }

    if (status && status.value !== "all") {
      filters.status = [status.value];
    }

    this.store.dispatch({ type: "SET_FILTERS", payload: filters });

    if (this.onFilterChangeCallback) {
      this.onFilterChangeCallback(filters);
    }
  }

  // Public methods for key handling
  focusSearch(): void {
    this.isSearchFocused = true;
    this.updateSearchDisplay();
  }

  blurSearch(): void {
    this.isSearchFocused = false;
    this.updateSearchDisplay();
    this.emitFilterChange();
  }

  isInSearchMode(): boolean {
    return this.isSearchFocused;
  }

  handleSearchKey(key: string): boolean {
    if (!this.isSearchFocused) return false;

    if (key === "escape" || key === "return") {
      this.blurSearch();
      return true;
    }

    if (key === "backspace") {
      this.searchQuery = this.searchQuery.slice(0, -1);
      this.updateSearchDisplay();
      return true;
    }

    // Add printable characters
    if (key.length === 1) {
      this.searchQuery += key;
      this.updateSearchDisplay();
      return true;
    }

    return false;
  }

  cycleStatus(): void {
    this.selectedStatusIndex = (this.selectedStatusIndex + 1) % STATUS_OPTIONS.length;
    this.updateStatusDisplay();
    this.emitFilterChange();
  }

  clearFilters(): void {
    this.searchQuery = "";
    this.selectedStatusIndex = 0;
    this.updateSearchDisplay();
    this.updateStatusDisplay();
    this.emitFilterChange();
  }

  getFilters(): FilterCriteria {
    const status = STATUS_OPTIONS[this.selectedStatusIndex];
    const filters: FilterCriteria = {};

    if (this.searchQuery) {
      filters.query = this.searchQuery;
    }

    if (status && status.value !== "all") {
      filters.status = [status.value];
    }

    return filters;
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    super.destroy();
  }
}
