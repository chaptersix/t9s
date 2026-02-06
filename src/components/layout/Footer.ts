/**
 * Footer component - displays keybinding hints based on current context
 */

import {
  BoxRenderable,
  TextRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  dim,
} from "@opentui/core";
import type { Store } from "../../store";
import type { AppState } from "../../store/types";

export interface FooterOptions extends Omit<BoxOptions, "height"> {
  store: Store;
}

function getKeyHints(state: AppState): string {
  // Overlay-specific hints take priority
  if (state.namespaceSelectorOpen) {
    return "j/k:navigate  Enter:select  Esc:close";
  }
  if (state.helpOverlayOpen) {
    return "?/Esc:close";
  }
  if (state.commandPaletteOpen) {
    return "j/k:navigate  Enter:select  Esc:close";
  }

  // View-specific hints
  const common = "n:namespace  q:quit  ?:help  Ctrl+P:palette";

  switch (state.activeView) {
    case "workflows":
      return `j/k:navigate  Enter:open  s:signal  /:search  ${common}`;
    case "workflow-detail":
      return `Tab:tabs  s:signal  c:cancel  t:terminate  Esc:back  ${common}`;
    case "schedules":
      return `j/k:navigate  p:toggle  T:trigger  Enter:details  ${common}`;
    case "schedule-detail":
      return `Tab:tabs  p:toggle  T:trigger  Esc:back  ${common}`;
    case "task-queues":
      return `j/k:navigate  Enter:details  r:refresh  ${common}`;
    default:
      return common;
  }
}

export class Footer extends BoxRenderable {
  private store: Store;
  private unsubscribe: (() => void) | null = null;
  private hintsText: TextRenderable;

  constructor(ctx: RenderContext, options: FooterOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "footer",
      height: 1,
      width: "100%",
      flexDirection: "row",
      backgroundColor: "#1a1a2e",
      paddingLeft: 1,
      paddingRight: 1,
    });

    this.store = options.store;

    // Create hints text
    this.hintsText = new TextRenderable(ctx, {
      id: "hints-text",
      flexGrow: 1,
    });
    this.add(this.hintsText);

    this.updateContent();

    // Subscribe to store changes
    this.unsubscribe = this.store.subscribe((state, prevState) => {
      if (
        state.activeView !== prevState.activeView ||
        state.commandPaletteOpen !== prevState.commandPaletteOpen ||
        state.namespaceSelectorOpen !== prevState.namespaceSelectorOpen ||
        state.helpOverlayOpen !== prevState.helpOverlayOpen
      ) {
        this.updateContent();
      }
    });
  }

  private updateContent(): void {
    const state = this.store.getState();
    const hints = getKeyHints(state);

    // Simply display hints with dim styling
    this.hintsText.content = t`${dim(hints)}`;
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    super.destroy();
  }
}
