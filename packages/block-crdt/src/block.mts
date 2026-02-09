import { CRDTId, RGA, RGAElement } from "./rga.mjs";


export type BlockType = "paragraph"
| "heading"
| "list"
| "table";

export type CRDTOp =
  | {
      kind: "insert_block";
      id: CRDTId;
      after: CRDTId;
      block: Block;
    }
  | {
      kind: "delete_block";
      id: CRDTId;
    }
  | {
      kind: "insert_char";
      blockId: CRDTId;
      id: CRDTId;
      after: CRDTId;
      char: string;
    }
  | {
      kind: "delete_char";
      blockId: CRDTId;
      id: CRDTId;
    }
  | {
      kind: "insert_list_item";
      blockId: CRDTId;
      id: CRDTId;
      after: CRDTId;
      item: ListItem;
    }
  | {
      kind: "delete_list_item";
      blockId: CRDTId;
      id: CRDTId;
    }
  | {
      kind: "insert_list_char";
      blockId: CRDTId;
      itemId: CRDTId;
      id: CRDTId;
      after: CRDTId;
      char: string;
    }
  | {
      kind: "delete_list_char";
      blockId: CRDTId;
      itemId: CRDTId;
      id: CRDTId;
    }
  | {
      kind: "insert_row";
      blockId: CRDTId;
      id: CRDTId;
      after: CRDTId;
      row: TableRow;
    }
  | {
      kind: "delete_row";
      blockId: CRDTId;
      id: CRDTId;
    }
  | {
      kind: "insert_column";
      blockId: CRDTId;
      id: CRDTId;
      after: CRDTId;
      column: TableColumn;
    }
  | {
      kind: "delete_column";
      blockId: CRDTId;
      id: CRDTId;
    }
  | {
      kind: "insert_cell_char";
      blockId: CRDTId;
      rowId: CRDTId;
      columnId: CRDTId;
      id: CRDTId;
      after: CRDTId;
      char: string;
    }
  | {
      kind: "delete_cell_char";
      blockId: CRDTId;
      rowId: CRDTId;
      columnId: CRDTId;
      id: CRDTId;
    };

export abstract class Block {
  constructor(
    public type: BlockType
  ) {}

  abstract toJSON(): unknown;
}


/**
 * Base class for text-based blocks (paragraphs and headings).
 * Manages text content using an RGA for conflict-free concurrent editing.
 */
export abstract class TextBlock extends Block {
  /**
   * String represents a character in the block. Not an actual string.
   * Am using string type since typescript doesn't have a built-in char type.
   */
  public content: RGA<string>;

  constructor(type: BlockType) {
    super(type);
    this.content = new RGA<string>();
  }

  insertChar(
    after: CRDTId,
    char: string,
    id: CRDTId
  ) {
    this.content.insertRGAElement(
      new RGAElement(id, char, after)
    );
  }

  deleteChar(id: CRDTId) {
    this.content.delete(id);
  }

  apply(op: CRDTOp) {
    if (op.kind === "insert_char") {
      this.content.insertRGAElement(
        new RGAElement(op.id, op.char, op.after)
      );
    }

    if (op.kind === "delete_char") {
      this.content.delete(op.id);
    }
  }

  toString(): string {
    return this.content.visible().join("");
  }
}


export class HeadingBlock extends TextBlock {
  public level: number;

  constructor(level: number) {
    super("heading");
    this.level = level;
  }

  toJSON() {
    return {
      type: this.type,
      level: this.level,
      content: this.content.toJSON(),
      text: this.toString()
    };
  }
}


export class ParagraphBlock extends TextBlock {
  constructor() {
    super("paragraph");
  }

  toJSON() {
    return {
      type: this.type,
      content: this.content.toJSON(),
      text: this.toString()
    };
  }
}


export class ListItem {
  public content: RGA<string> = new RGA<string>();

  constructor() {}

  toJSON() {
    return {
      content: this.content.toJSON(),
      text: this.content.visible().join("")
    };
  }
}

export type ListStyle = "bullet" | "ordered";

export class ListBlock extends Block {
  public style: ListStyle;
  public items: RGA<ListItem>;

  constructor(style: ListStyle) {
    super("list");
    this.style = style;
    this.items = new RGA<ListItem>();
  }

  insertItem(after: CRDTId, item: ListItem, id: CRDTId) {
    this.items.insertRGAElement(new RGAElement(id, item, after));
  }

  deleteItem(id: CRDTId) {
    this.items.delete(id);
  }

  apply(op: CRDTOp) {
    switch (op.kind) {
      case "insert_list_item": {
        this.items.insertRGAElement(
          new RGAElement(op.id, op.item, op.after)
        );
        break;
      }

      case "delete_list_item": {
        this.items.delete(op.id);
        break;
      }

      case "insert_list_char": {
        const itemEl = this.items.getElement(op.itemId);
        if (!itemEl || itemEl.deleted) return;

        itemEl.value.content.insertRGAElement(
          new RGAElement(op.id, op.char, op.after)
        );
        break;
      }

      case "delete_list_char": {
        const itemEl = this.items.getElement(op.itemId);
        if (!itemEl || itemEl.deleted) return;

        itemEl.value.content.delete(op.id);
        break;
      }
    }
  }

  toString(): string {
    return this.items
      .visible()
      .map((item) => item.content.visible().join(""))
      .join("\n");
  }

  toJSON() {
    return {
      type: this.type,
      style: this.style,
      items: this.items.toJSON(),
      text: this.toString()
    };
  }
}

export class TableRow {
  toJSON() {
    return { type: "row" };
  }
}
export class TableColumn {
  toJSON() {
    return { type: "column" };
  }
}

export type CellKey = `${string}:${string}`;

function cellKey(rowId: CRDTId, colId: CRDTId): CellKey {
  return `${JSON.stringify(rowId)}:${JSON.stringify(colId)}`;
}

export class TableCell {
  public content: RGA<string> = new RGA<string>();

  constructor() {}

  toJSON() {
    return {
      content: this.content.toJSON(),
      text: this.content.visible().join("")
    };
  }
}

export class TableCellStore {
  constructor(
    public cells: Map<CellKey, TableCell> = new Map()
  ) {}

  getCell(rowId: CRDTId, colId: CRDTId): TableCell | undefined {
    return this.cells.get(cellKey(rowId, colId));
  }

  ensureCell(rowId: CRDTId, colId: CRDTId): TableCell {
    const key = cellKey(rowId, colId);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new TableCell();
      this.cells.set(key, cell);
    }
    return cell;
  }

  toJSON() {
    const cells: Record<string, unknown> = {};
    for (const [key, cell] of this.cells.entries()) {
      cells[key] = cell.toJSON();
    }

    return cells;
  }
}


export class TableBlock extends Block {
  public rows: RGA<TableRow>;
  public columns: RGA<TableColumn>;
  public cells: TableCellStore;

  constructor() {
    super("table");
    this.rows = new RGA<TableRow>();
    this.columns = new RGA<TableColumn>();
    this.cells = new TableCellStore();
  }

  insertRow(after: CRDTId, row: TableRow, id: CRDTId) {
    this.rows.insertRGAElement(new RGAElement(id, row, after));
  }

  deleteRow(id: CRDTId) {
    this.rows.delete(id);
  }

  insertColumn(after: CRDTId, column: TableColumn, id: CRDTId) {
    this.columns.insertRGAElement(new RGAElement(id, column, after));
  }

  deleteColumn(id: CRDTId) {
    this.columns.delete(id);
  }

  apply(op: CRDTOp) {
    switch (op.kind) {
      case "insert_row": {
        this.rows.insertRGAElement(
          new RGAElement(op.id, op.row, op.after)
        );
        break;
      }

      case "delete_row": {
        this.rows.delete(op.id);
        break;
      }

      case "insert_column": {
        this.columns.insertRGAElement(
          new RGAElement(op.id, op.column, op.after)
        );
        break;
      }

      case "delete_column": {
        this.columns.delete(op.id);
        break;
      }

      case "insert_cell_char": {
        const rowEl = this.rows.getElement(op.rowId);
        const colEl = this.columns.getElement(op.columnId);

        if (!rowEl || !colEl || rowEl.deleted || colEl.deleted) return;

        const cell = this.cells.ensureCell(op.rowId, op.columnId);
        cell.content.insertRGAElement(
          new RGAElement(op.id, op.char, op.after)
        );
        break;
      }

      case "delete_cell_char": {
        const cell = this.cells.getCell(op.rowId, op.columnId);
        if (!cell) return;

        cell.content.delete(op.id);
        break;
      }
    }
  }

  toJSON() {
    return {
      type: this.type,
      rows: this.rows.toJSON(),
      columns: this.columns.toJSON(),
      cells: this.cells.toJSON()
    };
  }
}
