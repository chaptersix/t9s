/**
 * Shell component - main application layout container
 *
 * Layout:
 * ┌─────────────────────────────────────────────────┐
 * │ StatusBar (1 row)                               │
 * ├─────────────────────────────────────────────────┤
 * │ TabBar (1 row)                                  │
 * ├─────────────────────────────────────────────────┤
 * │                                                 │
 * │ Content Area (flex: 1)                          │
 * │                                                 │
 * ├─────────────────────────────────────────────────┤
 * │ Footer (1 row)                                  │
 * └─────────────────────────────────────────────────┘
 */

import {
  BoxRenderable,
  type BoxOptions,
  type RenderContext,
  Renderable,
} from "@opentui/core";
import type { Store } from "../../store";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import { Footer } from "./Footer";

export interface ShellOptions extends Omit<BoxOptions, "flexDirection"> {
  store: Store;
}

export class Shell extends BoxRenderable {
  private store: Store;
  readonly statusBar: StatusBar;
  readonly tabBar: TabBar;
  readonly contentArea: BoxRenderable;
  readonly footer: Footer;

  constructor(ctx: RenderContext, options: ShellOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "shell",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: "#0f0f23",
    });

    this.store = options.store;

    // Create layout components
    this.statusBar = new StatusBar(ctx, {
      store: this.store,
    });

    this.tabBar = new TabBar(ctx, {
      store: this.store,
    });

    this.contentArea = new BoxRenderable(ctx, {
      id: "content-area",
      flexGrow: 1,
      width: "100%",
      flexDirection: "column",
      overflow: "hidden",
    });

    this.footer = new Footer(ctx, {
      store: this.store,
    });

    // Add components in order
    this.add(this.statusBar);
    this.add(this.tabBar);
    this.add(this.contentArea);
    this.add(this.footer);
  }

  /**
   * Set the main content view
   */
  setContent(view: Renderable): void {
    // Remove existing content
    const children = this.contentArea.getChildren();
    for (const child of children) {
      this.contentArea.remove(child.id);
      child.destroy();
    }

    // Add new content
    this.contentArea.add(view);
  }

  /**
   * Clear all content from the content area
   */
  clearContent(): void {
    const children = this.contentArea.getChildren();
    for (const child of children) {
      this.contentArea.remove(child.id);
      child.destroy();
    }
  }

  getStore(): Store {
    return this.store;
  }
}
