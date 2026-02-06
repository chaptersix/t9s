/**
 * Loading indicator and skeleton components
 */

import {
  BoxRenderable,
  TextRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  dim,
  cyan,
} from "@opentui/core";

export interface LoadingIndicatorOptions extends BoxOptions {
  message?: string;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class LoadingIndicator extends BoxRenderable {
  private message: string;
  private frameIndex = 0;
  private spinnerText: TextRenderable;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: RenderContext, options: LoadingIndicatorOptions = {}) {
    super(ctx, {
      ...options,
      id: options.id ?? "loading-indicator",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 1,
    });

    this.message = options.message ?? "Loading...";

    this.spinnerText = new TextRenderable(ctx, {
      id: "loading-spinner",
    });
    this.spinnerText.content = t`${cyan(SPINNER_FRAMES[0]!)}`;
    this.add(this.spinnerText);

    const messageText = new TextRenderable(ctx, {
      id: "loading-message",
    });
    messageText.content = t`${dim(this.message)}`;
    this.add(messageText);

    this.startAnimation();
  }

  private startAnimation(): void {
    this.intervalId = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
      this.spinnerText.content = t`${cyan(SPINNER_FRAMES[this.frameIndex]!)}`;
    }, 80);
  }

  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    super.destroy();
  }
}

export interface SkeletonLineOptions extends BoxOptions {
  skeletonWidth?: number;
}

export class SkeletonLine extends BoxRenderable {
  private animationFrameIndex = 0;
  private skeletonText: TextRenderable;
  private skeletonWidth: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: RenderContext, options: SkeletonLineOptions = {}) {
    super(ctx, {
      ...options,
      id: options.id ?? "skeleton-line",
      height: 1,
    });

    this.skeletonWidth = options.skeletonWidth ?? 40;

    this.skeletonText = new TextRenderable(ctx, {
      id: "skeleton-text",
    });
    this.skeletonText.content = this.getSkeletonContent();
    this.add(this.skeletonText);

    this.startAnimation();
  }

  private getSkeletonContent(): string {
    // Create a shimmer effect using different brightness characters
    const chars = "░▒▓█";
    let content = "";
    for (let i = 0; i < this.skeletonWidth; i++) {
      const charIndex = (i + this.animationFrameIndex) % chars.length;
      content += chars[charIndex]!;
    }
    return t`${dim(content)}`.toString();
  }

  private startAnimation(): void {
    this.intervalId = setInterval(() => {
      this.animationFrameIndex = (this.animationFrameIndex + 1) % 4;
      this.skeletonText.content = this.getSkeletonContent();
    }, 150);
  }

  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    super.destroy();
  }
}

export interface TableSkeletonOptions extends BoxOptions {
  rows?: number;
  columns?: number;
}

export class TableSkeleton extends BoxRenderable {
  private skeletonRows: number;
  private skeletonColumns: number;
  private lines: SkeletonLine[] = [];

  constructor(ctx: RenderContext, options: TableSkeletonOptions = {}) {
    super(ctx, {
      ...options,
      id: options.id ?? "table-skeleton",
      flexDirection: "column",
      gap: 0,
      padding: 1,
    });

    this.skeletonRows = options.rows ?? 5;
    this.skeletonColumns = options.columns ?? 4;

    // Create header row
    const headerLine = new SkeletonLine(ctx, {
      id: "skeleton-header",
      skeletonWidth: this.skeletonColumns * 15,
    });
    this.add(headerLine);
    this.lines.push(headerLine);

    // Create data rows
    for (let i = 0; i < this.skeletonRows; i++) {
      const rowLine = new SkeletonLine(ctx, {
        id: `skeleton-row-${i}`,
        skeletonWidth: this.skeletonColumns * 15,
      });
      this.add(rowLine);
      this.lines.push(rowLine);
    }
  }

  destroy(): void {
    for (const line of this.lines) {
      line.destroy();
    }
    this.lines = [];
    super.destroy();
  }
}

export interface EmptyStateOptions extends BoxOptions {
  icon?: string;
  title: string;
  message?: string;
}

export class EmptyState extends BoxRenderable {
  constructor(ctx: RenderContext, options: EmptyStateOptions) {
    super(ctx, {
      ...options,
      id: options.id ?? "empty-state",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      gap: 1,
      padding: 2,
    });

    if (options.icon) {
      const icon = new TextRenderable(ctx, {
        id: "empty-state-icon",
      });
      icon.content = t`${dim(options.icon)}`;
      this.add(icon);
    }

    const title = new TextRenderable(ctx, {
      id: "empty-state-title",
    });
    title.content = t`${dim(options.title)}`;
    this.add(title);

    if (options.message) {
      const message = new TextRenderable(ctx, {
        id: "empty-state-message",
      });
      message.content = t`${dim(options.message)}`;
      this.add(message);
    }
  }
}
