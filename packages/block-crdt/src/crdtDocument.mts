import { CRDTId, ReplicaId, RGA, RGAElement } from "./rga.mjs";
import {
  Block,
  TextBlock,
  CRDTOp,
  ListBlock,
  ParagraphBlock,
  TableBlock,
  HeadingBlock,
  ListItem,
  TableRow,
  TableColumn
} from "./block.mjs";

export class CRDTDocument {
  public readonly type = "document";
  public readonly replicaId: ReplicaId;
  private clock: number;
  private blocks: RGA<Block>;

  constructor(replicaId: ReplicaId) {
    this.replicaId = replicaId;
    this.clock = 0;
    this.blocks = new RGA<Block>();
  }

  private static fromState(
    replicaId: ReplicaId,
    clock: number,
    blocks: RGA<Block>
  ): CRDTDocument {
    const doc = new CRDTDocument(replicaId);
    doc.clock = clock;
    doc.blocks = blocks;
    return doc;
  }

  /**
   * Create a new replica of this document with a different replica ID.
   * Useful when a new client joins a collaborative session.
   */
  fork(newReplicaId: ReplicaId): CRDTDocument {
    return CRDTDocument.fromState(
      newReplicaId,
      this.clock,
      this.blocks.clone()
    );
  }

  private nextId(): CRDTId {
    this.clock += 1;
    return [this.replicaId, this.clock];
  }

  // ============================================================================
  // BLOCK OPERATIONS
  // ============================================================================

  /**
   * Insert a paragraph block after the specified block ID.
   * If no after ID is provided, appends to the end of the document.
   */
  insertParagraphBlock(after?: CRDTId): CRDTOp {
    const afterId = after ?? this.lastBlockId();
    const block = new ParagraphBlock();
    return this.insertBlock(afterId, block);
  }

  /**
   * Insert a heading block with the specified level (1-6).
   */
  insertHeadingBlock(level: number, after?: CRDTId): CRDTOp {
    if (level < 1 || level > 6) {
      throw new Error("Heading level must be between 1 and 6");
    }
    const afterId = after ?? this.lastBlockId();
    const block = new HeadingBlock(level);
    return this.insertBlock(afterId, block);
  }

  /**
   * Insert a list block (bullet or ordered).
   */
  insertListBlock(style: "bullet" | "ordered", after?: CRDTId): CRDTOp {
    const afterId = after ?? this.lastBlockId();
    const block = new ListBlock(style);
    return this.insertBlock(afterId, block);
  }

  /**
   * Insert a table block.
   */
  insertTableBlock(after?: CRDTId): CRDTOp {
    const afterId = after ?? this.lastBlockId();
    const block = new TableBlock();
    return this.insertBlock(afterId, block);
  }

  /**
   * Low-level block insertion (used internally).
   */
  private insertBlock(after: CRDTId, block: Block): CRDTOp {
    const op: CRDTOp = {
      kind: "insert_block",
      id: this.nextId(),
      after,
      block
    };
    this.apply(op);
    return op;
  }

  /**
   * Delete a block by its ID.
   */
  deleteBlock(id: CRDTId): CRDTOp {
    const op: CRDTOp = {
      kind: "delete_block",
      id
    };
    this.apply(op);
    return op;
  }

  /**
   * Get the ID of the last visible block.
   */
  lastBlockId(): CRDTId {
    return this.blocks.lastVisibleId();
  }

  /**
   * Get all visible blocks in order.
   */
  visibleBlocks(): Block[] {
    return this.blocks.visible();
  }

  /**
   * Get a specific block by ID.
   */
  getBlock(id: CRDTId): Block | undefined {
    const element = this.blocks.getElement(id);
    return element && !element.deleted ? element.value : undefined;
  }

  /**
   * Get block at a specific index in the visible blocks.
   */
  getBlockAt(index: number): Block | undefined {
    const blocks = this.visibleBlocks();
    return blocks[index];
  }

  /**
   * Get the index of a block in the visible blocks list.
   */
  getBlockIndex(id: CRDTId): number {
    const blocks = this.visibleBlocks();
    const element = this.blocks.getElement(id);
    if (!element || element.deleted) return -1;
    return blocks.indexOf(element.value);
  }

  /**
   * Get the total number of visible blocks.
   */
  blockCount(): number {
    return this.visibleBlocks().length;
  }

  // ============================================================================
  // PARAGRAPH OPERATIONS
  // ============================================================================

  /**
   * Insert text into a paragraph block.
   * Returns an array of operations (one per character).
   */
  insertText(blockId: CRDTId, text: string, after?: CRDTId): CRDTOp[] {
    const blockEl = this.blocks.getElement(blockId);
    if (!blockEl || blockEl.deleted) {
      throw new Error("Block not found or deleted");
    }

    const block = blockEl.value;
    if (!(block instanceof TextBlock)) {
      throw new Error("Block is not a text block (paragraph or heading)");
    }

    const ops: CRDTOp[] = [];
    let currentAfter = after ?? block.content.lastVisibleId();

    for (const char of text) {
      const op: CRDTOp = {
        kind: "insert_char",
        blockId,
        id: this.nextId(),
        after: currentAfter,
        char
      };
      this.apply(op);
      ops.push(op);
      currentAfter = op.id;
    }

    return ops;
  }

  /**
   * Delete a character from a paragraph.
   */
  deleteChar(blockId: CRDTId, charId: CRDTId): CRDTOp {
    const op: CRDTOp = {
      kind: "delete_char",
      blockId,
      id: charId
    };
    this.apply(op);
    return op;
  }

  /**
   * Get the text content of a text block (paragraph or heading).
   */
  getParagraphText(blockId: CRDTId): string {
    const block = this.getBlock(blockId);
    if (!block) return "";
    
    if (block instanceof TextBlock) {
      return block.toString();
    }
    
    return "";
  }

  // ============================================================================
  // LIST OPERATIONS
  // ============================================================================

  /**
   * Insert a new item into a list.
   */
  insertListItem(blockId: CRDTId, after?: CRDTId): CRDTOp {
    const blockEl = this.blocks.getElement(blockId);
    if (!blockEl || blockEl.deleted) {
      throw new Error("Block not found or deleted");
    }

    const block = blockEl.value;
    if (!(block instanceof ListBlock)) {
      throw new Error("Block is not a list");
    }

    const afterId = after ?? block.items.lastVisibleId();
    const op: CRDTOp = {
      kind: "insert_list_item",
      blockId,
      id: this.nextId(),
      after: afterId,
      item: new ListItem()
    };

    this.apply(op);
    return op;
  }

  /**
   * Delete a list item.
   */
  deleteListItem(blockId: CRDTId, itemId: CRDTId): CRDTOp {
    const op: CRDTOp = {
      kind: "delete_list_item",
      blockId,
      id: itemId
    };
    this.apply(op);
    return op;
  }

  /**
   * Insert text into a list item.
   */
  insertListItemText(
    blockId: CRDTId,
    itemId: CRDTId,
    text: string,
    after?: CRDTId
  ): CRDTOp[] {
    const blockEl = this.blocks.getElement(blockId);
    if (!blockEl || blockEl.deleted) {
      throw new Error("Block not found or deleted");
    }

    const block = blockEl.value;
    if (!(block instanceof ListBlock)) {
      throw new Error("Block is not a list");
    }

    const itemEl = block.items.getElement(itemId);
    if (!itemEl || itemEl.deleted) {
      throw new Error("List item not found or deleted");
    }

    const ops: CRDTOp[] = [];
    let currentAfter = after ?? itemEl.value.content.lastVisibleId();

    for (const char of text) {
      const op: CRDTOp = {
        kind: "insert_list_char",
        blockId,
        itemId,
        id: this.nextId(),
        after: currentAfter,
        char
      };
      this.apply(op);
      ops.push(op);
      currentAfter = op.id;
    }

    return ops;
  }

  /**
   * Delete a character from a list item.
   */
  deleteListItemChar(
    blockId: CRDTId,
    itemId: CRDTId,
    charId: CRDTId
  ): CRDTOp {
    const op: CRDTOp = {
      kind: "delete_list_char",
      blockId,
      itemId,
      id: charId
    };
    this.apply(op);
    return op;
  }

  /**
   * Get the text of a specific list item.
   */
  getListItemText(blockId: CRDTId, itemId: CRDTId): string {
    const block = this.getBlock(blockId);
    if (!(block instanceof ListBlock)) return "";

    const itemEl = block.items.getElement(itemId);
    if (!itemEl || itemEl.deleted) return "";

    return itemEl.value.content.visible().join("");
  }

  // ============================================================================
  // TABLE OPERATIONS
  // ============================================================================

  /**
   * Insert a row into a table.
   */
  insertTableRow(blockId: CRDTId, after?: CRDTId): CRDTOp {
    const blockEl = this.blocks.getElement(blockId);
    if (!blockEl || blockEl.deleted) {
      throw new Error("Block not found or deleted");
    }

    const block = blockEl.value;
    if (!(block instanceof TableBlock)) {
      throw new Error("Block is not a table");
    }

    const afterId = after ?? block.rows.lastVisibleId();
    const op: CRDTOp = {
      kind: "insert_row",
      blockId,
      id: this.nextId(),
      after: afterId,
      row: new TableRow()
    };

    this.apply(op);
    return op;
  }

  /**
   * Insert a column into a table.
   */
  insertTableColumn(blockId: CRDTId, after?: CRDTId): CRDTOp {
    const blockEl = this.blocks.getElement(blockId);
    if (!blockEl || blockEl.deleted) {
      throw new Error("Block not found or deleted");
    }

    const block = blockEl.value;
    if (!(block instanceof TableBlock)) {
      throw new Error("Block is not a table");
    }

    const afterId = after ?? block.columns.lastVisibleId();
    const op: CRDTOp = {
      kind: "insert_column",
      blockId,
      id: this.nextId(),
      after: afterId,
      column: new TableColumn()
    };

    this.apply(op);
    return op;
  }

  /**
   * Delete a row from a table.
   */
  deleteTableRow(blockId: CRDTId, rowId: CRDTId): CRDTOp {
    const op: CRDTOp = {
      kind: "delete_row",
      blockId,
      id: rowId
    };
    this.apply(op);
    return op;
  }

  /**
   * Delete a column from a table.
   */
  deleteTableColumn(blockId: CRDTId, columnId: CRDTId): CRDTOp {
    const op: CRDTOp = {
      kind: "delete_column",
      blockId,
      id: columnId
    };
    this.apply(op);
    return op;
  }

  /**
   * Insert text into a table cell.
   */
  insertTableCellText(
    blockId: CRDTId,
    rowId: CRDTId,
    columnId: CRDTId,
    text: string,
    after?: CRDTId
  ): CRDTOp[] {
    const blockEl = this.blocks.getElement(blockId);
    if (!blockEl || blockEl.deleted) {
      throw new Error("Block not found or deleted");
    }

    const block = blockEl.value;
    if (!(block instanceof TableBlock)) {
      throw new Error("Block is not a table");
    }

    const cell = block.cells.ensureCell(rowId, columnId);
    const ops: CRDTOp[] = [];
    let currentAfter = after ?? cell.content.lastVisibleId();

    for (const char of text) {
      const op: CRDTOp = {
        kind: "insert_cell_char",
        blockId,
        rowId,
        columnId,
        id: this.nextId(),
        after: currentAfter,
        char
      };
      this.apply(op);
      ops.push(op);
      currentAfter = op.id;
    }

    return ops;
  }

  /**
   * Delete a character from a table cell.
   */
  deleteTableCellChar(
    blockId: CRDTId,
    rowId: CRDTId,
    columnId: CRDTId,
    charId: CRDTId
  ): CRDTOp {
    const op: CRDTOp = {
      kind: "delete_cell_char",
      blockId,
      rowId,
      columnId,
      id: charId
    };
    this.apply(op);
    return op;
  }

  /**
   * Get the text content of a table cell.
   */
  getTableCellText(
    blockId: CRDTId,
    rowId: CRDTId,
    columnId: CRDTId
  ): string {
    const block = this.getBlock(blockId);
    if (!(block instanceof TableBlock)) return "";

    const cell = block.cells.getCell(rowId, columnId);
    if (!cell) return "";

    return cell.content.visible().join("");
  }

  /**
   * Get table dimensions.
   */
  getTableDimensions(blockId: CRDTId): { rows: number; columns: number } {
    const block = this.getBlock(blockId);
    if (!(block instanceof TableBlock)) {
      return { rows: 0, columns: 0 };
    }

    return {
      rows: block.rows.visible().length,
      columns: block.columns.visible().length
    };
  }

  // ============================================================================
  // OPERATION APPLICATION
  // ============================================================================

  /**
   * Apply a single operation to the document.
   * This is used both for local operations and operations received from other replicas.
   */
  apply(op: CRDTOp): void {
    switch (op.kind) {
      case "insert_block": {
        this.blocks.insertRGAElement(
          new RGAElement(op.id, op.block, op.after)
        );
        break;
      }

      case "delete_block": {
        this.blocks.delete(op.id);
        break;
      }

      case "insert_char":
      case "delete_char": {
        const blockEl = this.blocks.getElement(op.blockId);
        if (!blockEl || blockEl.deleted) return;

        const block = blockEl.value;
        if (block instanceof TextBlock) {
          block.apply(op);
        }
        break;
      }

      case "insert_list_item":
      case "delete_list_item":
      case "insert_list_char":
      case "delete_list_char": {
        const blockEl = this.blocks.getElement(op.blockId);
        if (!blockEl || blockEl.deleted) return;

        const block = blockEl.value;
        if (block instanceof ListBlock) {
          block.apply(op);
        }
        break;
      }

      case "insert_row":
      case "delete_row":
      case "insert_column":
      case "delete_column":
      case "insert_cell_char":
      case "delete_cell_char": {
        const blockEl = this.blocks.getElement(op.blockId);
        if (!blockEl || blockEl.deleted) return;

        const block = blockEl.value;
        if (block instanceof TableBlock) {
          block.apply(op);
        }
        break;
      }
    }
  }

  /**
   * Apply multiple operations in sequence.
   */
  applyMany(ops: CRDTOp[]): void {
    for (const op of ops) {
      this.apply(op);
    }
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Serialize the document to JSON for storage or transmission.
   */
  toJSON() {
    return {
      type: this.type,
      replicaId: this.replicaId,
      clock: this.clock,
      blocks: this.blocks.toJSON()
    };
  }
}
