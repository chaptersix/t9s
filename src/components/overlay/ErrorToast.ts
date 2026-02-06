/**
 * Error Toast - displays error notifications at the top right
 * Auto-dismisses after 5 seconds
 */

import {
  BoxRenderable,
  TextRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  red,
  bold,
  dim,
} from "@opentui/core";

export interface ErrorToastOptions extends BoxOptions {
  message: string;
  onDismiss: () => void;
  duration?: number; // milliseconds, default 5000
}

export class ErrorToast extends BoxRenderable {
  private dismissTimeout: ReturnType<typeof setTimeout> | null = null;
  private onDismiss: () => void;

  constructor(ctx: RenderContext, options: ErrorToastOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? `error-toast-${Date.now()}`,
      position: "absolute",
      right: 2,
      top: 1,
      width: 50,
      backgroundColor: "#3d1010",
      borderStyle: "rounded",
      borderColor: "#ff4444",
      padding: 1,
      flexDirection: "column",
      zIndex: 999,
    });

    this.onDismiss = options.onDismiss;

    // Header with icon and title
    const header = new BoxRenderable(ctx, {
      id: "toast-header",
      width: "100%",
      height: 1,
      flexDirection: "row",
      marginBottom: 1,
    });

    const icon = new TextRenderable(ctx, {
      id: "toast-icon",
      width: 3,
    });
    icon.content = t`${red("⚠")} `;
    header.add(icon);

    const title = new TextRenderable(ctx, {
      id: "toast-title",
      flexGrow: 1,
    });
    title.content = t`${red(bold("Error"))}`;
    header.add(title);

    const closeHint = new TextRenderable(ctx, {
      id: "toast-close",
    });
    closeHint.content = t`${dim("[Esc]")}`;
    header.add(closeHint);

    this.add(header);

    // Message content - wrap long messages
    const messageLines = this.wrapText(options.message, 46);
    for (let i = 0; i < messageLines.length; i++) {
      const line = messageLines[i] ?? "";
      const messageText = new TextRenderable(ctx, {
        id: `toast-message-${i}`,
        width: "100%",
        height: 1,
      });
      messageText.content = t`${line}`;
      this.add(messageText);
    }

    // Start auto-dismiss timer
    const duration = options.duration ?? 5000;
    this.dismissTimeout = setTimeout(() => {
      this.onDismiss();
    }, duration);
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine ? " " : "") + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines.length > 0 ? lines : [""];
  }

  handleKey(key: string): boolean {
    if (key === "escape") {
      this.dismiss();
      return true;
    }
    return false;
  }

  dismiss(): void {
    if (this.dismissTimeout) {
      clearTimeout(this.dismissTimeout);
      this.dismissTimeout = null;
    }
    this.onDismiss();
  }

  destroy(): void {
    if (this.dismissTimeout) {
      clearTimeout(this.dismissTimeout);
      this.dismissTimeout = null;
    }
    super.destroy();
  }
}
