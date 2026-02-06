/**
 * Namespace Selector Overlay - allows switching between namespaces
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
  yellow,
} from "@opentui/core";
import type { Namespace } from "../../data/temporal/types";

export interface NamespaceSelectorOptions extends BoxOptions {
  namespaces: Namespace[];
  currentNamespace: string;
  onSelect: (namespace: string) => void;
  onClose: () => void;
}

export class NamespaceSelector extends BoxRenderable {
  private namespaces: Namespace[];
  private currentNamespace: string;
  private selectedIndex: number;
  private onSelect: (namespace: string) => void;
  private onClose: () => void;
  private listContainer: BoxRenderable;

  constructor(ctx: RenderContext, options: NamespaceSelectorOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "namespace-selector",
      position: "absolute",
      left: 10,
      top: 3,
      width: 50,
      height: Math.min(options.namespaces.length + 6, 20),
      backgroundColor: "#1a1a2e",
      borderStyle: "rounded",
      borderColor: "#00d9ff",
      flexDirection: "column",
      padding: 1,
      zIndex: 1000,
    });

    this.namespaces = options.namespaces;
    this.currentNamespace = options.currentNamespace;
    this.selectedIndex = Math.max(
      0,
      this.namespaces.findIndex((ns) => ns.name === options.currentNamespace)
    );
    this.onSelect = options.onSelect;
    this.onClose = options.onClose;

    // Title
    const title = new TextRenderable(ctx, {
      id: "ns-title",
      width: "100%",
      height: 1,
    });
    title.content = t`${cyan(bold("Select Namespace"))}  ${dim("(j/k to navigate, Enter to select)")}`;
    this.add(title);

    // Divider
    const divider = new TextRenderable(ctx, {
      id: "ns-divider",
      width: "100%",
      height: 1,
    });
    divider.content = t`${dim("─".repeat(46))}`;
    this.add(divider);

    // List container
    this.listContainer = new BoxRenderable(ctx, {
      id: "ns-list",
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
    });
    this.add(this.listContainer);

    // Hint
    const hint = new TextRenderable(ctx, {
      id: "ns-hint",
      width: "100%",
      height: 1,
      marginTop: 1,
    });
    hint.content = t`${dim("Esc to close")}`;
    this.add(hint);

    this.renderList();
  }

  private renderList(): void {
    // Clear existing items
    const children = this.listContainer.getChildren();
    for (const child of children) {
      this.listContainer.remove(child.id);
    }

    if (this.namespaces.length === 0) {
      const empty = new TextRenderable(this.ctx, {
        id: "ns-empty",
        width: "100%",
        height: 1,
      });
      empty.content = t`${dim("No namespaces found")}`;
      this.listContainer.add(empty);
      return;
    }

    for (let i = 0; i < this.namespaces.length; i++) {
      const ns = this.namespaces[i]!;
      const isSelected = i === this.selectedIndex;
      const isCurrent = ns.name === this.currentNamespace;

      const row = new TextRenderable(this.ctx, {
        id: `ns-item-${i}`,
        width: "100%",
        height: 1,
      });

      const prefix = isSelected ? "▶ " : "  ";
      const currentMark = isCurrent ? " (current)" : "";

      if (isSelected) {
        row.content = t`${cyan(prefix)}${bold(ns.name)}${yellow(currentMark)}`;
      } else {
        row.content = t`${dim(prefix)}${ns.name}${dim(currentMark)}`;
      }

      this.listContainer.add(row);
    }
  }

  handleKey(key: string): boolean {
    switch (key) {
      case "escape":
        this.onClose();
        return true;

      case "j":
      case "down":
        if (this.selectedIndex < this.namespaces.length - 1) {
          this.selectedIndex++;
          this.renderList();
        }
        return true;

      case "k":
      case "up":
        if (this.selectedIndex > 0) {
          this.selectedIndex--;
          this.renderList();
        }
        return true;

      case "return":
      case "enter":
        if (this.namespaces.length > 0) {
          const selected = this.namespaces[this.selectedIndex];
          if (selected) {
            // If selecting current namespace, just close
            if (selected.name === this.currentNamespace) {
              this.onClose();
            } else {
              this.onSelect(selected.name);
            }
          }
        }
        return true;

      default:
        return false;
    }
  }
}
