/**
 * CommandInput - k9s-style command/search input overlay
 *
 * Appears at the top of the screen when : or / is pressed.
 * In command mode (:), shows autocomplete suggestions for commands.
 * In search mode (/), provides search input for filtering current view.
 */

import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  cyan,
  dim,
  bold,
  yellow,
} from "@opentui/core";
import {
  getCommandSuggestions,
  getCommandHelp,
  getAllCommands,
} from "../../input/commands";

export type InputMode = "command" | "search";

export interface CommandInputOptions extends Omit<BoxOptions, "height" | "width"> {
  mode: InputMode;
  initialQuery?: string;
  onExecute: (command: string) => void;
  onSearch?: (query: string) => void;
  onClose: () => void;
}

interface SuggestionItem {
  command: string;
  alias?: string;
  description: string;
}

export class CommandInput extends BoxRenderable {
  private mode: InputMode;
  private inputText: TextRenderable;
  private suggestionsContainer: ScrollBoxRenderable;
  private suggestionItems: BoxRenderable[] = [];
  private query = "";
  private suggestions: SuggestionItem[] = [];
  private selectedIndex = 0;
  private onExecuteCallback: (command: string) => void;
  private onSearchCallback?: (query: string) => void;
  private onCloseCallback: () => void;

  constructor(ctx: RenderContext, options: CommandInputOptions) {
    const isSearch = options.mode === "search";
    const height = isSearch ? 3 : 12;

    super(ctx, {
      ...options,
      id: options.id ?? "command-input",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height,
      backgroundColor: "#0f0f23",
      flexDirection: "column",
      zIndex: 1000,
      borderStyle: "single",
      borderColor: isSearch ? "#4a9eff" : "#3d5a80",
    });

    this.mode = options.mode;
    this.query = options.initialQuery ?? "";
    this.onExecuteCallback = options.onExecute;
    this.onSearchCallback = options.onSearch;
    this.onCloseCallback = options.onClose;

    // Input row at top
    const inputRow = new BoxRenderable(ctx, {
      id: "command-input-row",
      width: "100%",
      height: 1,
      flexDirection: "row",
      paddingLeft: 1,
      backgroundColor: "#1a1a2e",
    });

    this.inputText = new TextRenderable(ctx, {
      id: "command-input-text",
      flexGrow: 1,
      height: 1,
    });
    inputRow.add(this.inputText);
    this.add(inputRow);

    if (!isSearch) {
      // Command mode: show suggestions panel
      const divider = new TextRenderable(ctx, {
        id: "command-divider",
        height: 1,
        width: "100%",
        paddingLeft: 1,
      });
      divider.content = t`${dim("─".repeat(60))}`;
      this.add(divider);

      // Suggestions container with scrolling
      this.suggestionsContainer = new ScrollBoxRenderable(ctx, {
        id: "suggestions-container",
        flexGrow: 1,
        width: "100%",
        scrollY: true,
        paddingLeft: 1,
      });
      this.add(this.suggestionsContainer);

      // Help text at bottom
      const helpRow = new BoxRenderable(ctx, {
        id: "command-help-row",
        height: 1,
        width: "100%",
        paddingLeft: 1,
        backgroundColor: "#1a1a2e",
      });
      const helpText = new TextRenderable(ctx, {
        id: "command-help",
        flexGrow: 1,
      });
      helpText.content = t`${dim("↑↓/jk navigate  Tab complete  Enter execute  Esc clear/close")}`;
      helpRow.add(helpText);
      this.add(helpRow);

      this.updateSuggestions();
    } else {
      // Search mode: simpler layout with just help text
      const helpRow = new BoxRenderable(ctx, {
        id: "search-help-row",
        height: 1,
        width: "100%",
        paddingLeft: 1,
        backgroundColor: "#1a1a2e",
      });
      const helpText = new TextRenderable(ctx, {
        id: "search-help",
        flexGrow: 1,
      });
      helpText.content = t`${dim("Enter to filter  Esc clear/close")}`;
      helpRow.add(helpText);
      this.add(helpRow);

      // Create empty suggestions container for search mode
      this.suggestionsContainer = new ScrollBoxRenderable(ctx, {
        id: "suggestions-container-hidden",
        height: 0,
        width: 0,
      });
    }

    this.updateDisplay();
  }

  private updateDisplay(): void {
    const cursor = cyan("█");
    const prefix = this.mode === "search" ? "/" : ":";
    this.inputText.content = t`${prefix}${this.query}${cursor}`;
  }

  private updateSuggestions(): void {
    if (this.mode === "search") return;

    // Clear existing items
    for (const item of this.suggestionItems) {
      this.suggestionsContainer.remove(item.id);
      item.destroy();
    }
    this.suggestionItems = [];

    // Get suggestions based on query
    if (this.query.trim() === "") {
      // Show all commands when empty
      this.suggestions = getAllCommands().map((cmd) => ({
        command: cmd.name,
        alias: cmd.alias,
        description: cmd.description,
      }));
    } else {
      const matches = getCommandSuggestions(this.query);
      this.suggestions = matches.map((match) => ({
        command: match,
        description: getCommandHelp(match),
      }));
    }

    // Clamp selected index
    if (this.selectedIndex >= this.suggestions.length) {
      this.selectedIndex = Math.max(0, this.suggestions.length - 1);
    }

    // Render suggestions
    if (this.suggestions.length === 0) {
      const emptyText = new TextRenderable(this.ctx, {
        id: "no-matches",
        width: "100%",
        height: 1,
      });
      emptyText.content = t`${dim("No matching commands")}`;
      const emptyBox = new BoxRenderable(this.ctx, {
        id: "empty-box",
        width: "100%",
        height: 1,
      });
      emptyBox.add(emptyText);
      this.suggestionsContainer.add(emptyBox);
      this.suggestionItems.push(emptyBox);
      return;
    }

    for (let i = 0; i < this.suggestions.length; i++) {
      const suggestion = this.suggestions[i]!;
      const isSelected = i === this.selectedIndex;

      const row = new BoxRenderable(this.ctx, {
        id: `suggestion-${i}`,
        height: 1,
        width: "100%",
        flexDirection: "row",
        backgroundColor: isSelected ? "#2d4a7c" : undefined,
      });

      // Command name with optional alias
      const cmdText = new TextRenderable(this.ctx, {
        id: `cmd-text-${i}`,
        width: 20,
      });
      let cmdDisplay = suggestion.command;
      if (suggestion.alias) {
        cmdDisplay = `${suggestion.alias} (${suggestion.command})`;
      }
      cmdText.content = isSelected
        ? t`${yellow("›")} ${cyan(bold(cmdDisplay))}`
        : t`  ${cmdDisplay}`;
      row.add(cmdText);

      // Description
      const descText = new TextRenderable(this.ctx, {
        id: `desc-text-${i}`,
        flexGrow: 1,
      });
      descText.content = t`${dim(suggestion.description)}`;
      row.add(descText);

      this.suggestionsContainer.add(row);
      this.suggestionItems.push(row);
    }
  }

  handleKey(key: string): boolean {
    switch (key) {
      case "escape":
        // Clear search first, close on second escape
        if (this.query.length > 0) {
          this.query = "";
          this.selectedIndex = 0;
          this.updateDisplay();
          if (this.mode === "command") {
            this.updateSuggestions();
          }
          // In search mode, also notify to clear filter
          if (this.mode === "search" && this.onSearchCallback) {
            this.onSearchCallback("");
          }
        } else {
          this.onCloseCallback();
        }
        return true;

      case "return":
      case "enter":
        this.executeCommand();
        return true;

      case "tab":
        if (this.mode === "command") {
          this.completeFromSelection();
        }
        return true;

      case "up":
      case "k":
        if (this.mode === "command") {
          this.moveUp();
        }
        return true;

      case "down":
      case "j":
        if (this.mode === "command") {
          this.moveDown();
        }
        return true;

      case "backspace":
        if (this.query.length > 0) {
          this.query = this.query.slice(0, -1);
          this.selectedIndex = 0;
          this.updateDisplay();
          if (this.mode === "command") {
            this.updateSuggestions();
          } else if (this.onSearchCallback) {
            // Live search as you type
            this.onSearchCallback(this.query);
          }
        }
        return true;

      case "space":
        this.query += " ";
        this.updateDisplay();
        if (this.mode === "command") {
          this.updateSuggestions();
        } else if (this.onSearchCallback) {
          this.onSearchCallback(this.query);
        }
        return true;

      default:
        // Accept alphanumeric, dash, underscore, and more for search
        const validChar = this.mode === "search"
          ? key.length === 1
          : key.length === 1 && /[a-zA-Z0-9\-_]/.test(key);

        if (validChar) {
          this.query += key;
          this.selectedIndex = 0;
          this.updateDisplay();
          if (this.mode === "command") {
            this.updateSuggestions();
          } else if (this.onSearchCallback) {
            // Live search as you type
            this.onSearchCallback(this.query);
          }
          return true;
        }
        return true; // Consume all keys when open
    }
  }

  private moveUp(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      this.updateSuggestions();
    }
  }

  private moveDown(): void {
    if (this.selectedIndex < this.suggestions.length - 1) {
      this.selectedIndex++;
      this.updateSuggestions();
    }
  }

  private completeFromSelection(): void {
    const selected = this.suggestions[this.selectedIndex];
    if (selected) {
      // Use alias if available (shorter), otherwise command
      this.query = selected.alias ?? selected.command;
      this.updateDisplay();
      this.updateSuggestions();
    }
  }

  private executeCommand(): void {
    if (this.mode === "search") {
      // Search mode: apply the filter and close
      if (this.onSearchCallback) {
        this.onSearchCallback(this.query);
      }
      this.onCloseCallback();
      return;
    }

    // Command mode
    if (this.query.trim()) {
      this.onExecuteCallback(this.query.trim());
    } else if (this.suggestions.length > 0) {
      // Execute selected suggestion if no query
      const selected = this.suggestions[this.selectedIndex];
      if (selected) {
        this.onExecuteCallback(selected.alias ?? selected.command);
      }
    } else {
      this.onCloseCallback();
    }
  }

  getQuery(): string {
    return this.query;
  }

  getMode(): InputMode {
    return this.mode;
  }
}
