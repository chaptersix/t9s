/**
 * Command Palette - fuzzy searchable command list
 */

import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  dim,
  bold,
  cyan,
  yellow,
} from "@opentui/core";

export interface Command {
  id: string;
  name: string;
  description: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

export interface CommandPaletteOptions extends BoxOptions {
  commands: Command[];
  onClose: () => void;
}

export class CommandPalette extends BoxRenderable {
  private commands: Command[];
  private filteredCommands: Command[];
  private searchQuery: string = "";
  private selectedIndex: number = 0;
  private onCloseCallback: () => void;

  private searchInput: TextRenderable;
  private resultsContainer: ScrollBoxRenderable;
  private resultItems: BoxRenderable[] = [];

  constructor(ctx: RenderContext, options: CommandPaletteOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "command-palette",
      position: "absolute",
      width: 60,
      height: 20,
      top: 3,
      left: 10,
      backgroundColor: "#1a1a2e",
      borderStyle: "rounded",
      borderColor: "#3d5a80",
      flexDirection: "column",
      padding: 1,
      zIndex: 100,
    });

    this.commands = options.commands;
    this.filteredCommands = [...options.commands];
    this.onCloseCallback = options.onClose;

    // Search input area
    const searchRow = new BoxRenderable(ctx, {
      id: "search-row",
      height: 1,
      width: "100%",
      flexDirection: "row",
      marginBottom: 1,
    });

    const searchPrompt = new TextRenderable(ctx, {
      id: "search-prompt",
      width: 2,
    });
    searchPrompt.content = t`${yellow(">")} `;
    searchRow.add(searchPrompt);

    this.searchInput = new TextRenderable(ctx, {
      id: "search-input",
      flexGrow: 1,
    });
    this.updateSearchDisplay();
    searchRow.add(this.searchInput);

    this.add(searchRow);

    // Divider
    const divider = new TextRenderable(ctx, {
      id: "divider",
      height: 1,
      width: "100%",
    });
    divider.content = t`${dim("─".repeat(56))}`;
    this.add(divider);

    // Results area
    this.resultsContainer = new ScrollBoxRenderable(ctx, {
      id: "results-container",
      flexGrow: 1,
      width: "100%",
      scrollY: true,
    });
    this.add(this.resultsContainer);

    // Help text
    const helpText = new TextRenderable(ctx, {
      id: "help-text",
      height: 1,
      width: "100%",
      marginTop: 1,
    });
    helpText.content = t`${dim("↑↓ navigate  Enter select  Esc close")}`;
    this.add(helpText);

    this.renderResults();
  }

  private updateSearchDisplay(): void {
    if (this.searchQuery) {
      this.searchInput.content = t`${this.searchQuery}${cyan("▌")}`;
    } else {
      this.searchInput.content = t`${dim("Type to search commands...")}${cyan("▌")}`;
    }
  }

  private filterCommands(): void {
    if (!this.searchQuery) {
      this.filteredCommands = [...this.commands];
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredCommands = this.commands.filter((cmd) => {
        const nameMatch = cmd.name.toLowerCase().includes(query);
        const descMatch = cmd.description.toLowerCase().includes(query);
        const catMatch = cmd.category.toLowerCase().includes(query);
        return nameMatch || descMatch || catMatch;
      });

      // Sort by relevance (name match first)
      this.filteredCommands.sort((a, b) => {
        const aNameMatch = a.name.toLowerCase().startsWith(query);
        const bNameMatch = b.name.toLowerCase().startsWith(query);
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;
        return 0;
      });
    }

    this.selectedIndex = 0;
    this.renderResults();
  }

  private renderResults(): void {
    // Clear existing items
    for (const item of this.resultItems) {
      this.resultsContainer.remove(item.id);
      item.destroy();
    }
    this.resultItems = [];

    if (this.filteredCommands.length === 0) {
      const emptyText = new TextRenderable(this.ctx, {
        id: "empty-results",
        width: "100%",
        height: 1,
        paddingTop: 1,
      });
      emptyText.content = t`${dim("No commands found")}`;
      const emptyBox = new BoxRenderable(this.ctx, {
        id: "empty-box",
        width: "100%",
        height: 3,
      });
      emptyBox.add(emptyText);
      this.resultsContainer.add(emptyBox);
      this.resultItems.push(emptyBox);
      return;
    }

    // Group by category
    const categories = new Map<string, Command[]>();
    for (const cmd of this.filteredCommands) {
      const existing = categories.get(cmd.category) || [];
      existing.push(cmd);
      categories.set(cmd.category, existing);
    }

    let itemIndex = 0;
    for (const [category, cmds] of categories) {
      // Category header
      const catHeader = new TextRenderable(this.ctx, {
        id: `cat-${category}`,
        height: 1,
        width: "100%",
        marginTop: itemIndex > 0 ? 1 : 0,
      });
      catHeader.content = t`${dim(category.toUpperCase())}`;
      const catBox = new BoxRenderable(this.ctx, {
        id: `cat-box-${category}`,
        width: "100%",
        height: 1,
      });
      catBox.add(catHeader);
      this.resultsContainer.add(catBox);
      this.resultItems.push(catBox);

      // Commands in category
      for (const cmd of cmds) {
        const isSelected = itemIndex === this.selectedIndex;
        const cmdRow = new BoxRenderable(this.ctx, {
          id: `cmd-${cmd.id}`,
          height: 1,
          width: "100%",
          flexDirection: "row",
          backgroundColor: isSelected ? "#2d4a7c" : undefined,
          paddingLeft: 1,
        });

        const cmdName = new TextRenderable(this.ctx, {
          id: `cmd-name-${cmd.id}`,
          width: 25,
        });
        cmdName.content = isSelected
          ? t`${cyan(bold(cmd.name))}`
          : t`${cmd.name}`;
        cmdRow.add(cmdName);

        const cmdDesc = new TextRenderable(this.ctx, {
          id: `cmd-desc-${cmd.id}`,
          flexGrow: 1,
        });
        cmdDesc.content = t`${dim(cmd.description)}`;
        cmdRow.add(cmdDesc);

        if (cmd.shortcut) {
          const cmdShortcut = new TextRenderable(this.ctx, {
            id: `cmd-shortcut-${cmd.id}`,
            width: 10,
          });
          cmdShortcut.content = t`${dim(cmd.shortcut)}`;
          cmdRow.add(cmdShortcut);
        }

        this.resultsContainer.add(cmdRow);
        this.resultItems.push(cmdRow);
        itemIndex++;
      }
    }
  }

  handleKey(key: string): boolean {
    switch (key) {
      case "escape":
        this.onCloseCallback();
        return true;

      case "return":
      case "enter":
        this.executeSelected();
        return true;

      case "up":
      case "k":
        this.moveUp();
        return true;

      case "down":
      case "j":
        this.moveDown();
        return true;

      case "backspace":
        if (this.searchQuery.length > 0) {
          this.searchQuery = this.searchQuery.slice(0, -1);
          this.updateSearchDisplay();
          this.filterCommands();
        }
        return true;

      default:
        // Add printable characters to search
        if (key.length === 1 && key.match(/[a-zA-Z0-9 \-_]/)) {
          this.searchQuery += key;
          this.updateSearchDisplay();
          this.filterCommands();
          return true;
        }
        return false;
    }
  }

  private moveUp(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      this.renderResults();
    }
  }

  private moveDown(): void {
    // Count actual command items (not category headers)
    const cmdCount = this.filteredCommands.length;
    if (this.selectedIndex < cmdCount - 1) {
      this.selectedIndex++;
      this.renderResults();
    }
  }

  private executeSelected(): void {
    const cmd = this.filteredCommands[this.selectedIndex];
    if (cmd) {
      this.onCloseCallback();
      cmd.action();
    }
  }
}
