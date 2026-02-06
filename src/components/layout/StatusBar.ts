/**
 * StatusBar component - displays connection status, namespace, and polling info
 */

import {
  BoxRenderable,
  TextRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  green,
  red,
  yellow,
  dim,
  bold,
  cyan,
} from "@opentui/core";
import type { Store } from "../../store";
import type { ConnectionStatus } from "../../store/types";

export interface StatusBarOptions extends Omit<BoxOptions, "height"> {
  store: Store;
}

function getStatusIndicator(status: ConnectionStatus): ReturnType<typeof green> {
  switch (status) {
    case "connected":
      return green("●");
    case "connecting":
      return yellow("◐");
    case "disconnected":
      return dim("○");
    case "error":
      return red("●");
  }
}

function getStatusText(status: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting...";
    case "disconnected":
      return "disconnected";
    case "error":
      return "error";
  }
}

export class StatusBar extends BoxRenderable {
  private store: Store;
  private unsubscribe: (() => void) | null = null;
  private statusText: TextRenderable;

  constructor(ctx: RenderContext, options: StatusBarOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "status-bar",
      height: 1,
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: "#1a1a2e",
      paddingLeft: 1,
      paddingRight: 1,
    });

    this.store = options.store;

    // Create status text
    this.statusText = new TextRenderable(ctx, {
      id: "status-text",
      flexGrow: 1,
    });
    this.add(this.statusText);

    this.updateContent();

    // Subscribe to store changes (in constructor to ensure it runs)
    this.unsubscribe = this.store.subscribe(() => {
      this.updateContent();
    });
  }

  private updateContent(): void {
    const state = this.store.getState();
    const statusIndicator = getStatusIndicator(state.connectionStatus);
    const statusLabel = getStatusText(state.connectionStatus);

    // Polling status with spinner when active
    let pollingStatus: string;
    if (!state.pollingEnabled) {
      pollingStatus = "off";
    } else if (state.isPolling) {
      pollingStatus = "⟳";
    } else {
      pollingStatus = `${state.pollingInterval / 1000}s`;
    }

    // Error indicator
    const errorIndicator = state.error ? red(" ⚠") : "";

    this.statusText.content = t`${statusIndicator} ${statusLabel}  ${dim("│")}  ${cyan(bold(state.namespace))}  ${dim("│")}  ${dim("poll:")} ${pollingStatus}${errorIndicator}  ${dim("│")}  ${dim("Ctrl+P:cmd  ?:help")}`;
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    super.destroy();
  }
}
