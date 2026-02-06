/**
 * Help Overlay - Shows keyboard shortcuts and help information
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

export interface HelpOverlayOptions extends BoxOptions {
  onClose: () => void;
}

interface KeybindingSection {
  title: string;
  bindings: Array<{ key: string; description: string }>;
}

export class HelpOverlay extends BoxRenderable {
  private onClose: () => void;

  constructor(ctx: RenderContext, options: HelpOverlayOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "help-overlay",
      position: "absolute",
      left: 5,
      top: 2,
      width: 70,
      height: 30,
      backgroundColor: "#1a1a2e",
      borderStyle: "rounded",
      borderColor: "#00d9ff",
      flexDirection: "column",
      padding: 1,
      zIndex: 1000,
    });

    this.onClose = options.onClose;

    // Title
    const title = new TextRenderable(ctx, {
      id: "help-title",
      width: "100%",
      height: 1,
    });
    title.content = t`${cyan(bold("Keyboard Shortcuts"))}  ${dim("(Press ? or Esc to close)")}`;
    this.add(title);

    // Divider
    const divider = new TextRenderable(ctx, {
      id: "help-divider",
      width: "100%",
      height: 1,
    });
    divider.content = t`${dim("─".repeat(66))}`;
    this.add(divider);

    // Render all sections
    this.renderSections(ctx);
  }

  private getSections(): KeybindingSection[] {
    return [
      {
        title: "Global",
        bindings: [
          { key: "Ctrl+P", description: "Open command palette" },
          { key: "q", description: "Quit application" },
          { key: "?", description: "Show/hide this help" },
          { key: "Ctrl+R", description: "Refresh current view" },
          { key: "Esc", description: "Close overlay / Go back" },
          { key: "1/2/3", description: "Switch views" },
          { key: "n", description: "Select namespace" },
        ],
      },
      {
        title: "Navigation",
        bindings: [
          { key: "j/k", description: "Move down/up" },
          { key: "h/l", description: "Move left/right, switch tabs" },
          { key: "gg/G", description: "Go to top/bottom" },
          { key: "Ctrl+D/U", description: "Page down/up" },
          { key: "Enter", description: "Select / Open" },
        ],
      },
      {
        title: "Workflows",
        bindings: [
          { key: "/", description: "Search workflows" },
          { key: "c", description: "Cancel workflow" },
          { key: "t", description: "Terminate workflow" },
          { key: "v", description: "Toggle history view" },
        ],
      },
      {
        title: "Activities",
        bindings: [
          { key: "p", description: "Pause activity" },
          { key: "u", description: "Unpause activity" },
          { key: "R", description: "Reset activity" },
        ],
      },
      {
        title: "Schedules",
        bindings: [
          { key: "p", description: "Toggle pause" },
          { key: "T", description: "Trigger now" },
          { key: "d", description: "Delete" },
        ],
      },
    ];
  }

  private renderSections(ctx: RenderContext): void {
    const sections = this.getSections();

    for (const section of sections) {
      // Section title
      const sectionTitle = new TextRenderable(ctx, {
        id: `help-section-${section.title}`,
        width: "100%",
        height: 1,
        marginTop: 1,
      });
      sectionTitle.content = t`${yellow(bold(section.title))}`;
      this.add(sectionTitle);

      // Bindings - show 2 per line to save space
      for (let i = 0; i < section.bindings.length; i += 2) {
        const b1 = section.bindings[i]!;
        const b2 = section.bindings[i + 1];

        const row = new TextRenderable(ctx, {
          id: `help-row-${section.title}-${i}`,
          width: "100%",
          height: 1,
        });

        if (b2) {
          row.content = t`  ${cyan(b1.key.padEnd(12))} ${b1.description.padEnd(20)}${cyan(b2.key.padEnd(12))} ${b2.description}`;
        } else {
          row.content = t`  ${cyan(b1.key.padEnd(12))} ${b1.description.padEnd(20)}`;
        }
        this.add(row);
      }
    }
  }

  handleKey(key: string): boolean {
    if (key === "escape" || key === "?") {
      this.onClose();
      return true;
    }
    return false;
  }
}
