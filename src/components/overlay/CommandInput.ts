/**
 * CommandInput - k9s-style command input overlay
 *
 * Appears at the bottom of the screen when : is pressed.
 * Accepts commands like :wf, :sch, :ns, :q
 */

import {
  BoxRenderable,
  TextRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  cyan,
} from "@opentui/core";

export interface CommandInputOptions extends Omit<BoxOptions, "height" | "width"> {
  onExecute: (command: string) => void;
  onClose: () => void;
}

export class CommandInput extends BoxRenderable {
  private inputText: TextRenderable;
  private query = "";
  private onExecuteCallback: (command: string) => void;
  private onCloseCallback: () => void;

  constructor(ctx: RenderContext, options: CommandInputOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "command-input",
      position: "absolute",
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      backgroundColor: "#0f0f23",
      zIndex: 1000,
    });

    this.onExecuteCallback = options.onExecute;
    this.onCloseCallback = options.onClose;

    this.inputText = new TextRenderable(ctx, {
      id: "command-input-text",
      width: "100%",
      height: 1,
      paddingLeft: 1,
    });
    this.add(this.inputText);

    this.updateDisplay();
  }

  private updateDisplay(): void {
    const cursor = cyan("█");
    this.inputText.content = t`:${this.query}${cursor}`;
  }

  handleKey(key: string): boolean {
    switch (key) {
      case "escape":
        this.onCloseCallback();
        return true;

      case "return":
      case "enter":
        if (this.query.trim()) {
          this.onExecuteCallback(this.query.trim());
        } else {
          this.onCloseCallback();
        }
        return true;

      case "backspace":
        if (this.query.length > 0) {
          this.query = this.query.slice(0, -1);
          this.updateDisplay();
        }
        return true;

      case "space":
        this.query += " ";
        this.updateDisplay();
        return true;

      default:
        // Accept alphanumeric, dash, underscore
        if (key.length === 1 && /[a-zA-Z0-9\-_]/.test(key)) {
          this.query += key;
          this.updateDisplay();
          return true;
        }
        return true; // Consume all keys when open
    }
  }

  getQuery(): string {
    return this.query;
  }
}
