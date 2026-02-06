/**
 * Table component - displays tabular data with selection support
 */

import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  type BoxOptions,
  type RenderContext,
  type Renderable,
  t,
  dim,
  bold,
  cyan,
} from "@opentui/core";

export interface Column<T> {
  key: string;
  header: string;
  width: number | "auto";
  render?: (item: T, index: number) => string;
}

export interface TableOptions<T> extends BoxOptions {
  columns: Column<T>[];
  data: T[];
  selectedIndex?: number;
  onSelect?: (item: T, index: number) => void;
  emptyMessage?: string;
  getRowId?: (item: T) => string;
}

export class Table<T> extends BoxRenderable {
  private columns: Column<T>[];
  private data: T[];
  private _selectedIndex: number;
  private onSelectCallback?: (item: T, index: number) => void;
  private emptyMessage: string;
  private getRowId: (item: T) => string;

  private headerRow: BoxRenderable;
  private scrollBox: ScrollBoxRenderable;
  private rowContainer: BoxRenderable;
  private rows: Renderable[] = [];

  constructor(ctx: RenderContext, options: TableOptions<T>) {
    super(ctx, {
      ...options,
      id: options.id ?? "table",
      flexDirection: "column",
      width: "100%",
      height: "100%",
    });

    this.columns = options.columns;
    this.data = options.data;
    this._selectedIndex = options.selectedIndex ?? 0;
    this.onSelectCallback = options.onSelect;
    this.emptyMessage = options.emptyMessage ?? "No data";
    this.getRowId = options.getRowId ?? ((item: T) => String((item as Record<string, unknown>)["id"] ?? Math.random()));

    // Create header row
    this.headerRow = new BoxRenderable(ctx, {
      id: "table-header",
      height: 1,
      width: "100%",
      flexDirection: "row",
      backgroundColor: "#1a1a2e",
    });
    this.add(this.headerRow);

    // Create scrollable content area
    this.scrollBox = new ScrollBoxRenderable(ctx, {
      id: "table-scroll",
      flexGrow: 1,
      width: "100%",
      scrollY: true,
      scrollX: false,
    });
    this.add(this.scrollBox);

    // Row container inside scroll box
    this.rowContainer = new BoxRenderable(ctx, {
      id: "table-rows",
      width: "100%",
      flexDirection: "column",
    });
    this.scrollBox.add(this.rowContainer);

    this.renderHeader();
    this.renderRows();
  }

  private renderHeader(): void {
    // Clear existing header content
    for (const child of this.headerRow.getChildren()) {
      this.headerRow.remove(child.id);
      child.destroy();
    }

    // Add column headers
    for (const col of this.columns) {
      const headerCell = new TextRenderable(this.ctx, {
        id: `header-${col.key}`,
        width: col.width === "auto" ? undefined : col.width,
        flexGrow: col.width === "auto" ? 1 : 0,
        paddingLeft: 1,
        paddingRight: 1,
      });
      headerCell.content = t`${bold(col.header)}`;
      this.headerRow.add(headerCell);
    }
  }

  private renderRows(): void {
    // Clear existing rows
    for (const row of this.rows) {
      this.rowContainer.remove(row.id);
      row.destroy();
    }
    this.rows = [];

    if (this.data.length === 0) {
      // Show empty message
      const emptyRow = new TextRenderable(this.ctx, {
        id: "empty-message",
        width: "100%",
        height: 3,
        paddingTop: 1,
        paddingLeft: 2,
      });
      emptyRow.content = t`${dim(this.emptyMessage)}`;
      this.rowContainer.add(emptyRow);
      this.rows.push(emptyRow);
      return;
    }

    // Create rows
    for (let i = 0; i < this.data.length; i++) {
      const item = this.data[i];
      if (!item) continue;

      const isSelected = i === this._selectedIndex;
      const rowId = this.getRowId(item);

      const row = new BoxRenderable(this.ctx, {
        id: `row-${rowId}`,
        height: 1,
        width: "100%",
        flexDirection: "row",
        backgroundColor: isSelected ? "#2d4a7c" : undefined,
      });

      // Add cells
      for (const col of this.columns) {
        const value = col.render
          ? col.render(item, i)
          : String((item as Record<string, unknown>)[col.key] ?? "");

        const cell = new TextRenderable(this.ctx, {
          id: `cell-${rowId}-${col.key}`,
          width: col.width === "auto" ? undefined : col.width,
          flexGrow: col.width === "auto" ? 1 : 0,
          paddingLeft: 1,
          paddingRight: 1,
        });

        if (isSelected) {
          cell.content = t`${cyan(value)}`;
        } else {
          cell.content = t`${value}`;
        }
        row.add(cell);
      }

      this.rowContainer.add(row);
      this.rows.push(row);
    }
  }

  get selectedIndex(): number {
    return this._selectedIndex;
  }

  set selectedIndex(value: number) {
    if (value < 0) value = 0;
    if (value >= this.data.length) value = Math.max(0, this.data.length - 1);

    if (value !== this._selectedIndex) {
      this._selectedIndex = value;
      this.renderRows();
      this.scrollToSelected();
    }
  }

  get selectedItem(): T | undefined {
    return this.data[this._selectedIndex];
  }

  private scrollToSelected(): void {
    if (this._selectedIndex >= 0 && this._selectedIndex < this.rows.length) {
      // Each row is 1 line tall
      const targetScroll = this._selectedIndex;
      const viewportHeight = this.scrollBox.viewport.height;
      const currentScroll = this.scrollBox.scrollTop;

      // If selected row is below viewport, scroll down
      if (targetScroll >= currentScroll + viewportHeight) {
        this.scrollBox.scrollTop = targetScroll - viewportHeight + 1;
      }
      // If selected row is above viewport, scroll up
      else if (targetScroll < currentScroll) {
        this.scrollBox.scrollTop = targetScroll;
      }
    }
  }

  moveUp(): void {
    this.selectedIndex = this._selectedIndex - 1;
  }

  moveDown(): void {
    this.selectedIndex = this._selectedIndex + 1;
  }

  moveToTop(): void {
    this.selectedIndex = 0;
  }

  moveToBottom(): void {
    this.selectedIndex = this.data.length - 1;
  }

  pageUp(): void {
    const pageSize = Math.max(1, Math.floor(this.scrollBox.viewport.height) - 1);
    this.selectedIndex = this._selectedIndex - pageSize;
  }

  pageDown(): void {
    const pageSize = Math.max(1, Math.floor(this.scrollBox.viewport.height) - 1);
    this.selectedIndex = this._selectedIndex + pageSize;
  }

  select(): void {
    const item = this.selectedItem;
    if (this.onSelectCallback && item) {
      this.onSelectCallback(item, this._selectedIndex);
    }
  }

  setData(data: T[]): void {
    this.data = data;
    // Keep selection in bounds
    if (this._selectedIndex >= data.length) {
      this._selectedIndex = Math.max(0, data.length - 1);
    }
    this.renderRows();
  }

  getData(): T[] {
    return this.data;
  }
}
