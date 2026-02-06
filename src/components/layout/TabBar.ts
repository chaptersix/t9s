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
      if (
        state.activeView !== prevState.activeView ||
        state.namespace !== prevState.namespace ||
        state.workflowDetail !== prevState.workflowDetail ||
        state.scheduleDetail !== prevState.scheduleDetail
      ) {
        this.updateContent();
      }
    });
  }

  private updateContent(): void {
    const state = this.store.getState();
    const activeView = state.activeView;
    const ns = state.namespace;

    // k9s-style breadcrumb display
    let viewLabel = "";
    switch (activeView) {
      case "workflows":
        viewLabel = "Workflows";
        break;
      case "workflow-detail":
        viewLabel = "Workflows";
        if (state.workflowDetail) {
          viewLabel += ` > ${state.workflowDetail.workflowId}`;
        }
        break;
      case "schedules":
        viewLabel = "Schedules";
        break;
      case "schedule-detail":
        viewLabel = "Schedules";
        if (state.scheduleDetail) {
          viewLabel += ` > ${state.scheduleDetail.scheduleId}`;
        }
        break;
      case "task-queues":
        viewLabel = "Task Queues";
        break;
      default:
        viewLabel = "Workflows";
    }

    this.tabsText.content = t`${bgCyan(black(` ${viewLabel} `))} ${dim("|")} ns:${bold(ns)}`;
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    super.destroy();
  }
}
