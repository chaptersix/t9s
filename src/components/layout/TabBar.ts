/**
 * TabBar component - view navigation tabs
 */

import {
  BoxRenderable,
  TextRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  dim,
  bold,
  bgCyan,
  black,
} from "@opentui/core";
import type { Store } from "../../store";

export interface TabBarOptions extends Omit<BoxOptions, "height"> {
  store: Store;
}


export class TabBar extends BoxRenderable {
  private store: Store;
  private unsubscribe: (() => void) | null = null;
  private tabsText: TextRenderable;

  constructor(ctx: RenderContext, options: TabBarOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "tab-bar",
      height: 1,
      width: "100%",
      flexDirection: "row",
      backgroundColor: "#16213e",
      paddingLeft: 1,
    });

    this.store = options.store;

    // Create tabs text
    this.tabsText = new TextRenderable(ctx, {
      id: "tabs-text",
      flexGrow: 1,
    });
    this.add(this.tabsText);

    this.updateContent();

    // Subscribe to store changes
    this.unsubscribe = this.store.subscribe((state, prevState) => {
      if (state.activeView !== prevState.activeView || state.namespace !== prevState.namespace) {
        this.updateContent();
      }
    });
  }

  private updateContent(): void {
    const state = this.store.getState();
    const activeView = state.activeView;
    const ns = state.namespace;

    // Build tabs display with namespace selector
    if (activeView === "workflows" || activeView === "workflow-detail") {
      this.tabsText.content = t`${bgCyan(black(" Workflows "))} ${dim("|")} ${dim("[")}${bold("2")}${dim("]")} Schedules ${dim("|")} ${dim("[")}${bold("3")}${dim("]")} Task Queues ${dim("|")} ${dim("[")}${bold("n")}${dim("]")} ns:${ns}`;
    } else if (activeView === "schedules") {
      this.tabsText.content = t`${dim("[")}${bold("1")}${dim("]")} Workflows ${dim("|")} ${bgCyan(black(" Schedules "))} ${dim("|")} ${dim("[")}${bold("3")}${dim("]")} Task Queues ${dim("|")} ${dim("[")}${bold("n")}${dim("]")} ns:${ns}`;
    } else if (activeView === "task-queues") {
      this.tabsText.content = t`${dim("[")}${bold("1")}${dim("]")} Workflows ${dim("|")} ${dim("[")}${bold("2")}${dim("]")} Schedules ${dim("|")} ${bgCyan(black(" Task Queues "))} ${dim("|")} ${dim("[")}${bold("n")}${dim("]")} ns:${ns}`;
    } else {
      this.tabsText.content = t`${bgCyan(black(" Workflows "))} ${dim("|")} ${dim("[")}${bold("2")}${dim("]")} Schedules ${dim("|")} ${dim("[")}${bold("3")}${dim("]")} Task Queues ${dim("|")} ${dim("[")}${bold("n")}${dim("]")} ns:${ns}`;
    }
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    super.destroy();
  }
}
