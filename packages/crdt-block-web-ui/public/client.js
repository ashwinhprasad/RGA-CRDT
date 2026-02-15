// ../block-crdt/src/rga.mts
function compareIds(a, b) {
  if (a === "HEAD" || b === "HEAD") return 0;
  const [ra, ca] = a;
  const [rb, cb] = b;
  return ca === cb ? ra - rb : ca - cb;
}
var RGAElement = class {
  constructor(id, value, after, deleted = false) {
    this.id = id;
    this.value = value;
    this.after = after;
    this.deleted = deleted;
  }
  children = [];
  insertChild(child) {
    this.children.push(child);
    this.children.sort((a, b) => compareIds(a.id, b.id));
  }
  toJSON() {
    const value = this.value && typeof this.value.toJSON === "function" ? this.value.toJSON() : this.value;
    return {
      id: this.id,
      after: this.after,
      deleted: this.deleted,
      value,
      children: this.children.map(
        (child) => child.toJSON()
      )
    };
  }
};
var RGA = class _RGA {
  head;
  elementMap = /* @__PURE__ */ new Map();
  pendingByAfter = /* @__PURE__ */ new Map();
  pendingIds = /* @__PURE__ */ new Set();
  constructor() {
    this.head = new RGAElement("HEAD", null, "HEAD");
    this.elementMap.set(JSON.stringify("HEAD"), this.head);
  }
  clone() {
    const newRGA = new _RGA();
    const cloneNode = (node, parentClone) => {
      for (const child of node.children) {
        const childClone = new RGAElement(
          child.id,
          child.value,
          child.after,
          child.deleted
        );
        parentClone.insertChild(childClone);
        newRGA["elementMap"].set(JSON.stringify(childClone.id), childClone);
        cloneNode(child, childClone);
      }
    };
    cloneNode(this.head, newRGA.head);
    return newRGA;
  }
  getElement(id) {
    return this["elementMap"].get(JSON.stringify(id));
  }
  enqueuePending(parentKey, element) {
    const elKey = JSON.stringify(element.id);
    if (this.pendingIds.has(elKey)) return;
    const list = this.pendingByAfter.get(parentKey);
    if (list) list.push(element);
    else this.pendingByAfter.set(parentKey, [element]);
    this.pendingIds.add(elKey);
  }
  drainPendingForParent(parentIdKey) {
    const pending = this.pendingByAfter.get(parentIdKey);
    if (!pending || pending.length === 0) return;
    this.pendingByAfter.delete(parentIdKey);
    pending.sort((a, b) => compareIds(a.id, b.id));
    for (const child of pending) {
      this.pendingIds.delete(JSON.stringify(child.id));
      this.insertRGAElement(child);
    }
  }
  insertRGAElement(element) {
    const key = JSON.stringify(element.id);
    if (this.elementMap.has(key)) return;
    const parentKey = JSON.stringify(element.after);
    if (element.after !== "HEAD" && !this.elementMap.has(parentKey)) {
      this.enqueuePending(parentKey, element);
      return;
    }
    const parent = this.elementMap.get(parentKey) ?? this.head;
    parent.insertChild(element);
    this.elementMap.set(key, element);
    this.drainPendingForParent(key);
  }
  delete(id) {
    const el = this.elementMap.get(JSON.stringify(id));
    if (el) el.deleted = true;
  }
  visible() {
    const result = [];
    const traverse = (node) => {
      for (const child of node.children) {
        if (!child.deleted) {
          result.push(child.value);
        }
        traverse(child);
      }
    };
    traverse(this.head);
    return result;
  }
  lastVisibleId() {
    let last = "HEAD";
    const traverse = (node) => {
      for (const child of node.children) {
        if (!child.deleted) {
          last = child.id;
        }
        traverse(child);
      }
    };
    traverse(this.head);
    return last;
  }
  toJSON() {
    return this.head.toJSON();
  }
};

// ../block-crdt/src/block.mts
var Block = class {
  constructor(type) {
    this.type = type;
  }
};
var TextBlock = class extends Block {
  /**
   * String represents a character in the block. Not an actual string.
   * Am using string type since typescript doesn't have a built-in char type.
   */
  content;
  constructor(type) {
    super(type);
    this.content = new RGA();
  }
  insertChar(after, char, id) {
    this.content.insertRGAElement(
      new RGAElement(id, char, after)
    );
  }
  deleteChar(id) {
    this.content.delete(id);
  }
  apply(op) {
    if (op.kind === "insert_char") {
      this.content.insertRGAElement(
        new RGAElement(op.id, op.char, op.after)
      );
    }
    if (op.kind === "delete_char") {
      this.content.delete(op.id);
    }
  }
  toString() {
    return this.content.visible().join("");
  }
};
var HeadingBlock = class extends TextBlock {
  level;
  constructor(level) {
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
};
var ParagraphBlock = class extends TextBlock {
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
};
var ListItem = class {
  content = new RGA();
  constructor() {
  }
  toJSON() {
    return {
      content: this.content.toJSON(),
      text: this.content.visible().join("")
    };
  }
};
var ListBlock = class extends Block {
  style;
  items;
  constructor(style) {
    super("list");
    this.style = style;
    this.items = new RGA();
  }
  insertItem(after, item, id) {
    this.items.insertRGAElement(new RGAElement(id, item, after));
  }
  deleteItem(id) {
    this.items.delete(id);
  }
  apply(op) {
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
  toString() {
    return this.items.visible().map((item) => item.content.visible().join("")).join("\n");
  }
  toJSON() {
    return {
      type: this.type,
      style: this.style,
      items: this.items.toJSON(),
      text: this.toString()
    };
  }
};
var TableRow = class {
  toJSON() {
    return { type: "row" };
  }
};
var TableColumn = class {
  toJSON() {
    return { type: "column" };
  }
};
function cellKey(rowId, colId) {
  return `${JSON.stringify(rowId)}:${JSON.stringify(colId)}`;
}
var TableCell = class {
  content = new RGA();
  constructor() {
  }
  toJSON() {
    return {
      content: this.content.toJSON(),
      text: this.content.visible().join("")
    };
  }
};
var TableCellStore = class {
  constructor(cells = /* @__PURE__ */ new Map()) {
    this.cells = cells;
  }
  getCell(rowId, colId) {
    return this.cells.get(cellKey(rowId, colId));
  }
  ensureCell(rowId, colId) {
    const key = cellKey(rowId, colId);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new TableCell();
      this.cells.set(key, cell);
    }
    return cell;
  }
  toJSON() {
    const cells = {};
    for (const [key, cell] of this.cells.entries()) {
      cells[key] = cell.toJSON();
    }
    return cells;
  }
};
var TableBlock = class extends Block {
  rows;
  columns;
  cells;
  constructor() {
    super("table");
    this.rows = new RGA();
    this.columns = new RGA();
    this.cells = new TableCellStore();
  }
  insertRow(after, row, id) {
    this.rows.insertRGAElement(new RGAElement(id, row, after));
  }
  deleteRow(id) {
    this.rows.delete(id);
  }
  insertColumn(after, column, id) {
    this.columns.insertRGAElement(new RGAElement(id, column, after));
  }
  deleteColumn(id) {
    this.columns.delete(id);
  }
  apply(op) {
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
};

// ../block-crdt/src/crdtDocument.mts
var CRDTDocument = class _CRDTDocument {
  type = "document";
  replicaId;
  clock;
  blocks;
  constructor(replicaId2) {
    this.replicaId = replicaId2;
    this.clock = 0;
    this.blocks = new RGA();
  }
  static fromState(replicaId2, clock, blocks) {
    const doc2 = new _CRDTDocument(replicaId2);
    doc2.clock = clock;
    doc2.blocks = blocks;
    return doc2;
  }
  /**
   * Create a new replica of this document with a different replica ID.
   * Useful when a new client joins a collaborative session.
   */
  fork(newReplicaId) {
    return _CRDTDocument.fromState(
      newReplicaId,
      this.clock,
      this.blocks.clone()
    );
  }
  nextId() {
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
  insertParagraphBlock(after) {
    const afterId = after ?? this.lastBlockId();
    const block = new ParagraphBlock();
    return this.insertBlock(afterId, block);
  }
  /**
   * Insert a heading block with the specified level (1-6).
   */
  insertHeadingBlock(level, after) {
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
  insertListBlock(style, after) {
    const afterId = after ?? this.lastBlockId();
    const block = new ListBlock(style);
    return this.insertBlock(afterId, block);
  }
  /**
   * Insert a table block.
   */
  insertTableBlock(after) {
    const afterId = after ?? this.lastBlockId();
    const block = new TableBlock();
    return this.insertBlock(afterId, block);
  }
  /**
   * Low-level block insertion (used internally).
   */
  insertBlock(after, block) {
    const op = {
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
  deleteBlock(id) {
    const op = {
      kind: "delete_block",
      id
    };
    this.apply(op);
    return op;
  }
  /**
   * Get the ID of the last visible block.
   */
  lastBlockId() {
    return this.blocks.lastVisibleId();
  }
  /**
   * Get all visible blocks in order.
   */
  visibleBlocks() {
    return this.blocks.visible();
  }
  /**
   * Get a specific block by ID.
   */
  getBlock(id) {
    const element = this.blocks.getElement(id);
    return element && !element.deleted ? element.value : void 0;
  }
  /**
   * Get block at a specific index in the visible blocks.
   */
  getBlockAt(index) {
    const blocks = this.visibleBlocks();
    return blocks[index];
  }
  /**
   * Get the index of a block in the visible blocks list.
   */
  getBlockIndex(id) {
    const blocks = this.visibleBlocks();
    const element = this.blocks.getElement(id);
    if (!element || element.deleted) return -1;
    return blocks.indexOf(element.value);
  }
  /**
   * Get the total number of visible blocks.
   */
  blockCount() {
    return this.visibleBlocks().length;
  }
  // ============================================================================
  // PARAGRAPH OPERATIONS
  // ============================================================================
  /**
   * Insert text into a paragraph block.
   * Returns an array of operations (one per character).
   */
  insertText(blockId, text, after) {
    const blockEl = this.blocks.getElement(blockId);
    if (!blockEl || blockEl.deleted) {
      throw new Error("Block not found or deleted");
    }
    const block = blockEl.value;
    if (!(block instanceof TextBlock)) {
      throw new Error("Block is not a text block (paragraph or heading)");
    }
    const ops = [];
    let currentAfter = after ?? block.content.lastVisibleId();
    for (const char of text) {
      const op = {
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
  deleteChar(blockId, charId) {
    const op = {
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
  getParagraphText(blockId) {
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
  insertListItem(blockId, after) {
    const blockEl = this.blocks.getElement(blockId);
    if (!blockEl || blockEl.deleted) {
      throw new Error("Block not found or deleted");
    }
    const block = blockEl.value;
    if (!(block instanceof ListBlock)) {
      throw new Error("Block is not a list");
    }
    const afterId = after ?? block.items.lastVisibleId();
    const op = {
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
  deleteListItem(blockId, itemId) {
    const op = {
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
  insertListItemText(blockId, itemId, text, after) {
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
    const ops = [];
    let currentAfter = after ?? itemEl.value.content.lastVisibleId();
    for (const char of text) {
      const op = {
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
  deleteListItemChar(blockId, itemId, charId) {
    const op = {
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
  getListItemText(blockId, itemId) {
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
  insertTableRow(blockId, after) {
    const blockEl = this.blocks.getElement(blockId);
    if (!blockEl || blockEl.deleted) {
      throw new Error("Block not found or deleted");
    }
    const block = blockEl.value;
    if (!(block instanceof TableBlock)) {
      throw new Error("Block is not a table");
    }
    const afterId = after ?? block.rows.lastVisibleId();
    const op = {
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
  insertTableColumn(blockId, after) {
    const blockEl = this.blocks.getElement(blockId);
    if (!blockEl || blockEl.deleted) {
      throw new Error("Block not found or deleted");
    }
    const block = blockEl.value;
    if (!(block instanceof TableBlock)) {
      throw new Error("Block is not a table");
    }
    const afterId = after ?? block.columns.lastVisibleId();
    const op = {
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
  deleteTableRow(blockId, rowId) {
    const op = {
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
  deleteTableColumn(blockId, columnId) {
    const op = {
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
  insertTableCellText(blockId, rowId, columnId, text, after) {
    const blockEl = this.blocks.getElement(blockId);
    if (!blockEl || blockEl.deleted) {
      throw new Error("Block not found or deleted");
    }
    const block = blockEl.value;
    if (!(block instanceof TableBlock)) {
      throw new Error("Block is not a table");
    }
    const cell = block.cells.ensureCell(rowId, columnId);
    const ops = [];
    let currentAfter = after ?? cell.content.lastVisibleId();
    for (const char of text) {
      const op = {
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
  deleteTableCellChar(blockId, rowId, columnId, charId) {
    const op = {
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
  getTableCellText(blockId, rowId, columnId) {
    const block = this.getBlock(blockId);
    if (!(block instanceof TableBlock)) return "";
    const cell = block.cells.getCell(rowId, columnId);
    if (!cell) return "";
    return cell.content.visible().join("");
  }
  /**
   * Get table dimensions.
   */
  getTableDimensions(blockId) {
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
  apply(op) {
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
  applyMany(ops) {
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
};

// src/client.mts
var doc = null;
var replicaId = 0;
var userName = "";
var isOnline = true;
var pendingOps = [];
var initialOpLog = [];
var ws = new WebSocket(`ws://${location.host}`);
var wsReady = false;
var editorEl = document.getElementById("editor");
var statusEl = document.getElementById("status");
var presenceEl = document.getElementById("presence");
var userNameEl = document.getElementById("user-name");
var toggleOnlineBtn = document.getElementById("toggle-online");
var addParagraphBtn = document.getElementById("add-paragraph");
var addListBtn = document.getElementById("add-list");
var addTableBtn = document.getElementById("add-table");
var presenceMap = /* @__PURE__ */ new Map();
function init() {
  const storedId = Number(sessionStorage.getItem("replicaId"));
  const storedName = sessionStorage.getItem("userName") || `User ${Date.now() % 1e3}`;
  userName = storedName;
  userNameEl.textContent = userName;
  if (Number.isInteger(storedId) && storedId > 0) {
    replicaId = storedId;
  }
}
ws.addEventListener("open", () => {
  wsReady = true;
  ws.send(JSON.stringify({ type: "register", replicaId: replicaId || null, name: userName }));
  if (isOnline) {
    while (pendingOps.length > 0) {
      const op = pendingOps.shift();
      ws.send(JSON.stringify({ type: "operation", op }));
    }
  }
});
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  switch (message.type) {
    case "init":
      if (Array.isArray(message.opLog)) {
        initialOpLog = message.opLog;
        console.log(`Received ${initialOpLog.length} operations from server`);
      }
      break;
    case "registered":
      replicaId = message.replicaId;
      userName = message.name;
      sessionStorage.setItem("replicaId", String(replicaId));
      sessionStorage.setItem("userName", userName);
      doc = new CRDTDocument(replicaId);
      if (initialOpLog.length > 0) {
        console.log(`Applying ${initialOpLog.length} operations to new replica ${replicaId}`);
        initialOpLog.forEach((op) => {
          const reconstructed = reconstructOperation(op);
          doc.apply(reconstructed);
        });
        initialOpLog = [];
      } else {
        const op = doc.insertParagraphBlock();
        sendOp(op);
      }
      userNameEl.textContent = `${userName} (R${replicaId})`;
      updateStatus();
      renderDocument();
      break;
    case "operation":
      if (!isOnline) {
        console.log(`Ignoring operation while offline:`, message.op);
        break;
      }
      if (doc && message.op) {
        console.log(`Received operation:`, message.op);
        const reconstructed = reconstructOperation(message.op);
        const opReplicaId = reconstructed.id?.[0];
        if (opReplicaId !== replicaId) {
          logOperation(reconstructed, "remote");
          doc.apply(reconstructed);
          renderDocument();
        }
      }
      break;
    case "presence":
      if (Array.isArray(message.presence)) {
        presenceMap.clear();
        message.presence.forEach((p) => {
          presenceMap.set(p.id, { online: p.online, name: p.name });
        });
        renderPresence();
      }
      break;
    case "user-joined":
      console.log(`${message.name} joined`);
      break;
    case "user-left":
      console.log(`User ${message.replicaId} left`);
      break;
    case "sync":
      if (doc && Array.isArray(message.operations)) {
        console.log(`Received sync with ${message.operations.length} missed operations`);
        message.operations.forEach((op, index) => {
          console.log(`Applying missed operation ${index + 1}:`, op.kind);
          const reconstructed = reconstructOperation(op);
          const opReplicaId = reconstructed.id?.[0];
          if (opReplicaId !== replicaId) {
            doc.apply(reconstructed);
          } else {
            console.log(`Skipping own operation:`, op.kind);
          }
        });
        console.log(`Sync complete, rendering document`);
        renderDocument();
      }
      break;
  }
});
ws.addEventListener("close", () => {
  wsReady = false;
  updateStatus();
});
var operationHistory = [];
var conflictHistory = [];
function logOperation(op, source) {
  operationHistory.push({
    op,
    timestamp: Date.now(),
    source
  });
  if (operationHistory.length > 50) {
    operationHistory.shift();
  }
  updateOperationLog();
  updateRGATree();
  updateDocumentState();
  detectConflicts(op);
}
function detectConflicts(op) {
  if (op.kind === "insert_char" || op.kind === "insert_list_char" || op.kind === "insert_cell_char") {
    const after = op.after;
    const opId = op.id;
    const opReplicaId = opId[0];
    const recentOps = operationHistory.slice(-10);
    const concurrent = recentOps.filter(({ op: otherOp }) => {
      if (otherOp.kind !== op.kind) return false;
      const otherAfter = otherOp.after;
      const otherId = otherOp.id;
      const otherReplicaId = otherId[0];
      return JSON.stringify(after) === JSON.stringify(otherAfter) && JSON.stringify(opId) !== JSON.stringify(otherId) && opReplicaId !== otherReplicaId;
    });
    if (concurrent.length > 0) {
      const char = op.char || "";
      const otherChar = concurrent[0].op.char || "";
      const otherReplicaId = concurrent[0].op.id[0];
      logConflict(
        `Concurrent insertion from R${opReplicaId} and R${otherReplicaId}`,
        `Replica ${opReplicaId} inserted "${char}" and Replica ${otherReplicaId} inserted "${otherChar}" at the same position. Deterministic ordering by replica ID: R${opReplicaId} ${opReplicaId < otherReplicaId ? "<" : ">"} R${otherReplicaId} = "${opReplicaId < otherReplicaId ? char + otherChar : otherChar + char}"`
      );
    }
  }
}
function logConflict(description, resolution) {
  conflictHistory.push({
    description,
    resolution,
    timestamp: Date.now()
  });
  if (conflictHistory.length > 20) {
    conflictHistory.shift();
  }
  updateConflictLog();
}
function sendOp(op) {
  logOperation(op, "local");
  if (doc) {
    doc.apply(op);
    const isBlockOp = op.kind.includes("block") || op.kind.includes("row") || op.kind.includes("column") || op.kind.includes("item");
    if (isBlockOp || !isOnline) {
      renderDocument();
    }
  }
  if (!isOnline) {
    pendingOps.push(op);
    console.log(`Queued operation while offline:`, op.kind, `(${pendingOps.length} pending)`);
    return;
  }
  if (wsReady) {
    console.log(`Sending operation:`, op);
    ws.send(JSON.stringify({ type: "operation", op }));
  } else {
    pendingOps.push(op);
  }
}
function reconstructOperation(op) {
  if (op.kind === "insert_block" && op.block) {
    const blockData = op.block;
    let block;
    if (blockData.type === "paragraph") {
      block = new ParagraphBlock();
      if (blockData.content) {
        block.content = reconstructRGA(blockData.content);
      }
    } else if (blockData.type === "heading") {
      block = new class extends Block {
        level;
        content;
        constructor(level) {
          super("heading");
          this.level = level;
          this.content = new RGA();
        }
        toJSON() {
          return { type: this.type, level: this.level, content: this.content };
        }
        toString() {
          return this.content.visible().join("");
        }
      }(blockData.level || 1);
      if (blockData.content) {
        block.content = reconstructRGA(blockData.content);
      }
    } else if (blockData.type === "list") {
      block = new ListBlock(blockData.style || "bullet");
      if (blockData.items) {
        block.items = reconstructRGA(blockData.items);
      }
    } else if (blockData.type === "table") {
      block = new TableBlock();
      if (blockData.rows) {
        block.rows = reconstructRGA(blockData.rows);
      }
      if (blockData.columns) {
        block.columns = reconstructRGA(blockData.columns);
      }
    } else {
      block = new ParagraphBlock();
    }
    return { ...op, block };
  }
  if (op.kind === "insert_list_item" && op.item) {
    const item = new ListItem();
    return { ...op, item };
  }
  if (op.kind === "insert_row" && op.row) {
    const row = new TableRow();
    return { ...op, row };
  }
  if (op.kind === "insert_column" && op.column) {
    const column = new TableColumn();
    return { ...op, column };
  }
  return op;
}
function reconstructRGA(data) {
  return new RGA();
}
function renderDocument() {
  if (!doc) {
    editorEl.innerHTML = '<div class="empty-state">Connecting...</div>';
    return;
  }
  const blocks = doc.visibleBlocks();
  console.log(`Rendering ${blocks.length} blocks`);
  if (blocks.length === 0) {
    editorEl.innerHTML = '<div class="empty-state">Empty document. Click "Add Paragraph" to start.</div>';
    return;
  }
  const activeElement = document.activeElement;
  let cursorPosition = 0;
  let activeBlockIndex = -1;
  if (activeElement && activeElement.isContentEditable) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      cursorPosition = range.startOffset;
      let parent = activeElement;
      while (parent && !parent.classList.contains("block")) {
        parent = parent.parentElement;
      }
      if (parent) {
        activeBlockIndex = parseInt(parent.dataset.blockIndex || "-1");
      }
    }
  }
  editorEl.innerHTML = "";
  blocks.forEach((block, index) => {
    const blockEl = renderBlock(block, index);
    editorEl.appendChild(blockEl);
    console.log(`Rendered block ${index}:`, block.type, block.toString ? block.toString() : "");
  });
  if (activeBlockIndex >= 0 && activeBlockIndex < blocks.length) {
    setTimeout(() => {
      const blockEl = editorEl.querySelector(`[data-block-index="${activeBlockIndex}"]`);
      if (blockEl) {
        const editableEl = blockEl.querySelector('[contenteditable="true"]');
        if (editableEl) {
          editableEl.focus();
          const selection = window.getSelection();
          const range = document.createRange();
          try {
            const textNode = editableEl.firstChild || editableEl;
            const offset = Math.min(cursorPosition, (textNode.textContent || "").length);
            range.setStart(textNode, offset);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
          } catch (e) {
            console.warn("Could not restore cursor position:", e);
          }
        }
      }
    }, 0);
  }
}
function renderBlock(block, index) {
  const container = document.createElement("div");
  container.className = "block";
  container.dataset.blockIndex = String(index);
  const dragHandle = document.createElement("div");
  dragHandle.className = "drag-handle";
  dragHandle.draggable = true;
  dragHandle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.5"/>
      <circle cx="11" cy="3" r="1.5"/>
      <circle cx="5" cy="8" r="1.5"/>
      <circle cx="11" cy="8" r="1.5"/>
      <circle cx="5" cy="13" r="1.5"/>
      <circle cx="11" cy="13" r="1.5"/>
    </svg>
  `;
  dragHandle.title = "Drag to reorder";
  dragHandle.addEventListener("dragstart", (e) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    container.classList.add("dragging");
  });
  dragHandle.addEventListener("dragend", () => {
    container.classList.remove("dragging");
    document.querySelectorAll(".block").forEach((el) => el.classList.remove("drag-over"));
  });
  container.appendChild(dragHandle);
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const dragging = document.querySelector(".dragging");
    if (dragging && dragging !== container) {
      container.classList.add("drag-over");
    }
  });
  container.addEventListener("dragleave", () => {
    container.classList.remove("drag-over");
  });
  container.addEventListener("drop", (e) => {
    e.preventDefault();
    container.classList.remove("drag-over");
    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
    const toIndex = index;
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      moveBlock(fromIndex, toIndex);
    }
  });
  if (block instanceof ParagraphBlock) {
    const p = document.createElement("div");
    p.className = "paragraph-block";
    p.contentEditable = "true";
    p.textContent = block.toString();
    p.addEventListener("input", () => handleParagraphEdit(index, p.textContent || ""));
    p.addEventListener("keydown", (e) => handleKeyDown(e, index));
    container.appendChild(p);
  } else if (block instanceof ListBlock) {
    const list = document.createElement(block.style === "ordered" ? "ol" : "ul");
    list.className = "list-block";
    const items = block.items.visible();
    items.forEach((item, itemIndex) => {
      const li = document.createElement("li");
      li.contentEditable = "true";
      li.textContent = item.content.visible().join("");
      li.addEventListener("input", () => handleListItemEdit(index, itemIndex, li.textContent || ""));
      li.addEventListener("keydown", (e) => handleListKeyDown(e, index, itemIndex));
      list.appendChild(li);
    });
    const addItemBtn = document.createElement("button");
    addItemBtn.className = "add-item-btn";
    addItemBtn.textContent = "+ Add item";
    addItemBtn.onclick = () => addListItem(index);
    container.appendChild(list);
    container.appendChild(addItemBtn);
  } else if (block instanceof TableBlock) {
    const table = document.createElement("table");
    table.className = "table-block";
    const rowIds = [];
    const colIds = [];
    const getIds = (node, ids) => {
      for (const child of node.children) {
        if (!child.deleted) {
          ids.push(child.id);
        }
        getIds(child, ids);
      }
    };
    getIds(block.rows.head, rowIds);
    getIds(block.columns.head, colIds);
    rowIds.forEach((rowId, rowIndex) => {
      const tr = document.createElement("tr");
      colIds.forEach((colId, colIndex) => {
        const td = document.createElement("td");
        td.contentEditable = "true";
        td.dataset.col = String(colIndex + 1);
        td.dataset.row = String(rowIndex + 1);
        td.textContent = doc.getTableCellText(getBlockId(index), rowId, colId);
        td.addEventListener(
          "input",
          () => handleTableCellEdit(index, rowIndex, colIndex, td.textContent || "")
        );
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    const controls = document.createElement("div");
    controls.className = "table-controls";
    const addRowBtn = document.createElement("button");
    addRowBtn.textContent = "+ Row";
    addRowBtn.onclick = () => addTableRow(index);
    const addColBtn = document.createElement("button");
    addColBtn.textContent = "+ Column";
    addColBtn.onclick = () => addTableColumn(index);
    controls.appendChild(addRowBtn);
    controls.appendChild(addColBtn);
    container.appendChild(table);
    container.appendChild(controls);
  }
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-block-btn";
  deleteBtn.textContent = "\xD7";
  deleteBtn.onclick = () => deleteBlock(index);
  container.appendChild(deleteBtn);
  return container;
}
function getBlockId(index) {
  if (!doc) throw new Error("Document not initialized");
  const blocks = doc.visibleBlocks();
  const block = blocks[index];
  const blockRGA = doc.blocks;
  const found = findElementId(blockRGA.head, block);
  if (!found) throw new Error("Block ID not found");
  return found;
}
function findElementId(node, target) {
  for (const child of node.children) {
    if (child.value === target && !child.deleted) {
      return child.id;
    }
    const found = findElementId(child, target);
    if (found) return found;
  }
  return null;
}
function getListItemId(blockIndex, itemIndex) {
  if (!doc) throw new Error("Document not initialized");
  const block = doc.visibleBlocks()[blockIndex];
  if (!(block instanceof ListBlock)) {
    throw new Error("Block is not a list");
  }
  const items = block.items.visible();
  const item = items[itemIndex];
  const found = findElementId(block.items.head, item);
  if (!found) throw new Error("List item ID not found");
  return found;
}
function getTableRowId(blockIndex, rowIndex) {
  if (!doc) throw new Error("Document not initialized");
  const block = doc.visibleBlocks()[blockIndex];
  if (!(block instanceof TableBlock)) {
    throw new Error("Block is not a table");
  }
  const rows = block.rows.visible();
  const row = rows[rowIndex];
  const found = findElementId(block.rows.head, row);
  if (!found) throw new Error("Row ID not found");
  return found;
}
function getTableColumnId(blockIndex, colIndex) {
  if (!doc) throw new Error("Document not initialized");
  const block = doc.visibleBlocks()[blockIndex];
  if (!(block instanceof TableBlock)) {
    throw new Error("Block is not a table");
  }
  const columns = block.columns.visible();
  const column = columns[colIndex];
  const found = findElementId(block.columns.head, column);
  if (!found) throw new Error("Column ID not found");
  return found;
}
var editTimeout = null;
var previousTexts = /* @__PURE__ */ new Map();
function handleParagraphEdit(blockIndex, newText) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const oldText = previousTexts.get(blockIndex) || doc.getParagraphText(blockId);
  if (oldText === newText) return;
  if (editTimeout) clearTimeout(editTimeout);
  editTimeout = window.setTimeout(() => {
    applyTextEdit(blockId, oldText, newText);
    previousTexts.set(blockIndex, newText);
  }, 100);
}
function applyTextEdit(blockId, oldText, newText) {
  if (!doc) return;
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }
  let oldEnd = oldText.length - 1;
  let newEnd = newText.length - 1;
  while (oldEnd >= start && newEnd >= start && oldText[oldEnd] === newText[newEnd]) {
    oldEnd--;
    newEnd--;
  }
  const deleted = oldText.slice(start, oldEnd + 1);
  const inserted = newText.slice(start, newEnd + 1);
  const block = doc.getBlock(blockId);
  if (!block || !(block instanceof ParagraphBlock)) return;
  const chars = block.content.visible();
  for (let i = 0; i < deleted.length; i++) {
    const charIndex = start;
    if (charIndex < chars.length) {
      let currentIndex = 0;
      const findCharId = (node) => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === charIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      const charId = findCharId(block.content.head);
      if (charId) {
        const op = doc.deleteChar(blockId, charId);
        sendOp(op);
      }
    }
  }
  if (inserted.length > 0) {
    const prevCharIndex = start - 1;
    let afterId;
    if (prevCharIndex >= 0 && chars.length > 0) {
      let currentIndex = 0;
      const findCharId = (node) => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === prevCharIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      const foundId = findCharId(block.content.head);
      afterId = foundId || "HEAD";
    } else {
      afterId = "HEAD";
    }
    const ops = doc.insertText(blockId, inserted, afterId);
    ops.forEach((op) => sendOp(op));
  }
  previousTexts.set(
    Array.from(editorEl.querySelectorAll(".block")).findIndex(
      (el) => el.querySelector(".paragraph-block")?.textContent === newText
    ),
    newText
  );
}
var listEditTimeout = null;
var previousListTexts = /* @__PURE__ */ new Map();
function handleListItemEdit(blockIndex, itemIndex, newText) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const itemId = getListItemId(blockIndex, itemIndex);
  const key = `${blockIndex}-${itemIndex}`;
  const oldText = previousListTexts.get(key) || doc.getListItemText(blockId, itemId);
  if (oldText === newText) return;
  if (listEditTimeout) clearTimeout(listEditTimeout);
  listEditTimeout = window.setTimeout(() => {
    applyListItemTextEdit(blockId, itemId, oldText, newText);
    previousListTexts.set(key, newText);
  }, 100);
}
function applyListItemTextEdit(blockId, itemId, oldText, newText) {
  if (!doc) return;
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }
  let oldEnd = oldText.length - 1;
  let newEnd = newText.length - 1;
  while (oldEnd >= start && newEnd >= start && oldText[oldEnd] === newText[newEnd]) {
    oldEnd--;
    newEnd--;
  }
  const deleted = oldText.slice(start, oldEnd + 1);
  const inserted = newText.slice(start, newEnd + 1);
  const block = doc.getBlock(blockId);
  if (!block || !(block instanceof ListBlock)) return;
  const item = block.items.getElement(itemId);
  if (!item) return;
  const chars = item.value.content.visible();
  for (let i = 0; i < deleted.length; i++) {
    const charIndex = start;
    if (charIndex < chars.length) {
      let currentIndex = 0;
      const findCharId = (node) => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === charIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      const charId = findCharId(item.value.content.head);
      if (charId) {
        const op = doc.deleteListItemChar(blockId, itemId, charId);
        sendOp(op);
      }
    }
  }
  if (inserted.length > 0) {
    const prevCharIndex = start - 1;
    let afterId;
    if (prevCharIndex >= 0 && chars.length > 0) {
      let currentIndex = 0;
      const findCharId = (node) => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === prevCharIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      const foundId = findCharId(item.value.content.head);
      afterId = foundId || "HEAD";
    } else {
      afterId = "HEAD";
    }
    const ops = doc.insertListItemText(blockId, itemId, inserted, afterId);
    ops.forEach((op) => sendOp(op));
  }
}
var tableCellEditTimeout = null;
var previousTableCellTexts = /* @__PURE__ */ new Map();
function handleTableCellEdit(blockIndex, rowIndex, colIndex, newText) {
  if (!doc) return;
  const key = `${blockIndex}-${rowIndex}-${colIndex}`;
  const blockId = getBlockId(blockIndex);
  const rowId = getTableRowId(blockIndex, rowIndex);
  const colId = getTableColumnId(blockIndex, colIndex);
  const oldText = previousTableCellTexts.get(key) || doc.getTableCellText(blockId, rowId, colId);
  if (oldText === newText) return;
  if (tableCellEditTimeout) clearTimeout(tableCellEditTimeout);
  tableCellEditTimeout = window.setTimeout(() => {
    applyTableCellTextEdit(blockId, rowId, colId, oldText, newText);
    previousTableCellTexts.set(key, newText);
  }, 100);
}
function applyTableCellTextEdit(blockId, rowId, colId, oldText, newText) {
  if (!doc) return;
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }
  let oldEnd = oldText.length - 1;
  let newEnd = newText.length - 1;
  while (oldEnd >= start && newEnd >= start && oldText[oldEnd] === newText[newEnd]) {
    oldEnd--;
    newEnd--;
  }
  const deleted = oldText.slice(start, oldEnd + 1);
  const inserted = newText.slice(start, newEnd + 1);
  const block = doc.getBlock(blockId);
  if (!block || !(block instanceof TableBlock)) return;
  const cell = block.cells.getCell(rowId, colId);
  if (!cell) {
    if (inserted.length > 0) {
      const ops = doc.insertTableCellText(blockId, rowId, colId, inserted);
      ops.forEach((op) => sendOp(op));
    }
    return;
  }
  const chars = cell.content.visible();
  for (let i = 0; i < deleted.length; i++) {
    const charIndex = start;
    if (charIndex < chars.length) {
      let currentIndex = 0;
      const findCharId = (node) => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === charIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      const charId = findCharId(cell.content.head);
      if (charId) {
        const op = doc.deleteTableCellChar(blockId, rowId, colId, charId);
        sendOp(op);
      }
    }
  }
  if (inserted.length > 0) {
    const prevCharIndex = start - 1;
    let afterId;
    if (prevCharIndex >= 0 && chars.length > 0) {
      let currentIndex = 0;
      const findCharId = (node) => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === prevCharIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      const foundId = findCharId(cell.content.head);
      afterId = foundId || "HEAD";
    } else {
      afterId = "HEAD";
    }
    const ops = doc.insertTableCellText(blockId, rowId, colId, inserted, afterId);
    ops.forEach((op) => sendOp(op));
  }
}
function handleKeyDown(e, blockIndex) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    addParagraphAfter(blockIndex);
  }
}
function handleListKeyDown(e, blockIndex, itemIndex) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    addListItem(blockIndex);
  }
}
function addParagraph() {
  if (!doc) return;
  const op = doc.insertParagraphBlock();
  sendOp(op);
  setTimeout(() => {
    const blocks = editorEl.querySelectorAll(".block");
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
      lastBlock.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = lastBlock.querySelector("[contenteditable]");
      if (input) input.focus();
    }
  }, 100);
}
function addParagraphAfter(blockIndex) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const op = doc.insertParagraphBlock(blockId);
  sendOp(op);
  setTimeout(() => {
    const blocks = editorEl.querySelectorAll(".block");
    const newBlock = blocks[blockIndex + 1];
    if (newBlock) {
      const input = newBlock.querySelector("[contenteditable]");
      if (input) input.focus();
    }
  }, 100);
}
function addList() {
  if (!doc) return;
  const op = doc.insertListBlock("bullet");
  sendOp(op);
  const blockId = op.id;
  const itemOp = doc.insertListItem(blockId);
  sendOp(itemOp);
  setTimeout(() => {
    const blocks = editorEl.querySelectorAll(".block");
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
      lastBlock.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = lastBlock.querySelector("li[contenteditable]");
      if (input) input.focus();
    }
  }, 100);
}
function addListItem(blockIndex) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const op = doc.insertListItem(blockId);
  sendOp(op);
}
function addTable() {
  if (!doc) return;
  const tableOp = doc.insertTableBlock();
  sendOp(tableOp);
  const blockId = tableOp.id;
  const row1Op = doc.insertTableRow(blockId);
  sendOp(row1Op);
  const row2Op = doc.insertTableRow(blockId, row1Op.id);
  sendOp(row2Op);
  const col1Op = doc.insertTableColumn(blockId);
  sendOp(col1Op);
  const col2Op = doc.insertTableColumn(blockId, col1Op.id);
  sendOp(col2Op);
  setTimeout(() => {
    const blocks = editorEl.querySelectorAll(".block");
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
      lastBlock.scrollIntoView({ behavior: "smooth", block: "center" });
      const firstCell = lastBlock.querySelector("td[contenteditable]");
      if (firstCell) firstCell.focus();
    }
  }, 100);
}
function addTableRow(blockIndex) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const op = doc.insertTableRow(blockId);
  sendOp(op);
}
function addTableColumn(blockIndex) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const op = doc.insertTableColumn(blockId);
  sendOp(op);
}
function deleteBlock(blockIndex) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const op = doc.deleteBlock(blockId);
  sendOp(op);
}
function moveBlock(fromIndex, toIndex) {
  if (!doc) return;
  console.log(`moveBlock called: from ${fromIndex} to ${toIndex}`);
  const blocks = doc.visibleBlocks();
  if (fromIndex < 0 || fromIndex >= blocks.length) {
    console.error(`Invalid fromIndex: ${fromIndex}`);
    return;
  }
  if (toIndex < 0 || toIndex >= blocks.length) {
    console.error(`Invalid toIndex: ${toIndex}`);
    return;
  }
  if (fromIndex === toIndex) {
    console.log(`Same position, no move needed`);
    return;
  }
  const blockToMove = blocks[fromIndex];
  console.log(`Moving block type: ${blockToMove.type}`);
  const blockIdToDelete = getBlockId(fromIndex);
  let afterId = "HEAD";
  if (fromIndex < toIndex) {
    afterId = getBlockId(toIndex);
    console.log(`Moving down: inserting after block ${toIndex}`);
  } else {
    if (toIndex > 0) {
      afterId = getBlockId(toIndex - 1);
      console.log(`Moving up: inserting after block ${toIndex - 1}`);
    } else {
      console.log(`Moving up: inserting at HEAD`);
    }
  }
  const text = blockToMove.toString();
  console.log(`Block content: "${text}"`);
  console.log(`Deleting block at index ${fromIndex}`);
  const deleteOp = doc.deleteBlock(blockIdToDelete);
  sendOp(deleteOp);
  if (blockToMove instanceof ParagraphBlock) {
    console.log(`Re-inserting paragraph block`);
    const insertOp = doc.insertParagraphBlock(afterId);
    sendOp(insertOp);
    if (text) {
      const textOps = doc.insertText(insertOp.id, text);
      textOps.forEach((op) => sendOp(op));
    }
  } else if (blockToMove instanceof ListBlock) {
    console.log(`Re-inserting list block`);
    const insertOp = doc.insertListBlock(blockToMove.style, afterId);
    sendOp(insertOp);
    const items = blockToMove.items.visible();
    let prevItemId = "HEAD";
    items.forEach((item) => {
      const itemOp = doc.insertListItem(insertOp.id, prevItemId);
      sendOp(itemOp);
      const itemText = item.content.visible().join("");
      if (itemText) {
        const textOps = doc.insertListItemText(insertOp.id, itemOp.id, itemText);
        textOps.forEach((op) => sendOp(op));
      }
      prevItemId = itemOp.id;
    });
  } else if (blockToMove instanceof TableBlock) {
    console.log(`Re-inserting table block`);
    const insertOp = doc.insertTableBlock(afterId);
    sendOp(insertOp);
    const rows = blockToMove.rows.visible();
    let prevRowId = "HEAD";
    rows.forEach(() => {
      const rowOp = doc.insertTableRow(insertOp.id, prevRowId);
      sendOp(rowOp);
      prevRowId = rowOp.id;
    });
    const cols = blockToMove.columns.visible();
    let prevColId = "HEAD";
    cols.forEach(() => {
      const colOp = doc.insertTableColumn(insertOp.id, prevColId);
      sendOp(colOp);
      prevColId = colOp.id;
    });
    const rowIds = [];
    const colIds = [];
    const getIds = (node, ids) => {
      for (const child of node.children) {
        if (!child.deleted) ids.push(child.id);
        getIds(child, ids);
      }
    };
    getIds(blockToMove.rows.head, rowIds);
    getIds(blockToMove.columns.head, colIds);
    const newBlock = doc.getBlock(insertOp.id);
    const newRowIds = [];
    const newColIds = [];
    getIds(newBlock.rows.head, newRowIds);
    getIds(newBlock.columns.head, newColIds);
    rowIds.forEach((oldRowId, ri) => {
      colIds.forEach((oldColId, ci) => {
        const text2 = blockToMove.cells.getCell(oldRowId, oldColId)?.content.visible().join("") || "";
        if (text2 && newRowIds[ri] && newColIds[ci]) {
          const textOps = doc.insertTableCellText(insertOp.id, newRowIds[ri], newColIds[ci], text2);
          textOps.forEach((op) => sendOp(op));
        }
      });
    });
  }
  console.log(`Move complete, forcing render`);
  setTimeout(() => {
    renderDocument();
  }, 100);
}
function toggleOnline() {
  const wasOffline = !isOnline;
  isOnline = !isOnline;
  console.log(`Toggling to ${isOnline ? "ONLINE" : "OFFLINE"} mode`);
  if (isOnline && wsReady && wasOffline) {
    console.log(`Requesting sync for missed operations (have ${pendingOps.length} pending to send)`);
    ws.send(JSON.stringify({ type: "sync_request", replicaId }));
    console.log(`Flushing ${pendingOps.length} pending operations`);
    const opsToSend = [...pendingOps];
    pendingOps.length = 0;
    opsToSend.forEach((op) => {
      console.log(`Sending queued operation:`, op.kind);
      ws.send(JSON.stringify({ type: "operation", op }));
    });
  }
  ws.send(JSON.stringify({ type: "status", replicaId, online: isOnline }));
  updateStatus();
}
function updateStatus() {
  const status = wsReady ? isOnline ? "Online" : "Offline" : "Disconnected";
  statusEl.textContent = status;
  statusEl.className = `status ${status.toLowerCase()}`;
  if (toggleOnlineBtn) {
    toggleOnlineBtn.textContent = isOnline ? "Go Offline" : "Go Online";
  }
}
function renderPresence() {
  presenceEl.innerHTML = "";
  for (const [id, info] of presenceMap.entries()) {
    const badge = document.createElement("span");
    badge.className = `presence-badge ${info.online ? "online" : "offline"}`;
    badge.textContent = `${info.name} (R${id})`;
    if (id === replicaId) {
      badge.classList.add("self");
    }
    presenceEl.appendChild(badge);
  }
}
addParagraphBtn?.addEventListener("click", addParagraph);
addListBtn?.addEventListener("click", addList);
addTableBtn?.addEventListener("click", addTable);
toggleOnlineBtn?.addEventListener("click", toggleOnline);
init();
updateStatus();
var operationLogEl = document.getElementById("operation-log");
var rgaTreeEl = document.getElementById("rga-tree");
var conflictLogEl = document.getElementById("conflict-log");
var documentStateEl = document.getElementById("document-state");
var showTombstonesCheckbox = document.getElementById("show-tombstones");
var viewToggleBtns = document.querySelectorAll(".view-toggle-btn");
var tabContents = document.querySelectorAll(".tab-content");
viewToggleBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabName = btn.dataset.tab;
    viewToggleBtns.forEach((b) => b.classList.remove("active"));
    tabContents.forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${tabName}`)?.classList.add("active");
    if (tabName === "inspector") {
      updateInspector();
    }
  });
});
showTombstonesCheckbox?.addEventListener("change", () => {
  updateRGATree();
});
function updateOperationLog() {
  if (!operationLogEl) return;
  operationLogEl.innerHTML = "";
  const recentOps = [...operationHistory].reverse().slice(0, 20);
  recentOps.forEach(({ op, timestamp, source }) => {
    const entry = document.createElement("div");
    entry.className = `operation-entry ${getOperationClass(op.kind)}`;
    const header = document.createElement("div");
    header.className = "operation-header";
    const type = document.createElement("span");
    type.className = "operation-type";
    type.textContent = op.kind.replace(/_/g, " ");
    const replica = document.createElement("span");
    replica.className = "operation-replica";
    replica.textContent = `${source} \u2022 ${new Date(timestamp).toLocaleTimeString()}`;
    header.appendChild(type);
    header.appendChild(replica);
    const details = document.createElement("div");
    details.className = "operation-details";
    details.innerHTML = formatOperationDetails(op);
    entry.appendChild(header);
    entry.appendChild(details);
    operationLogEl.appendChild(entry);
  });
  operationLogEl.scrollTop = 0;
}
function getOperationClass(kind) {
  if (kind.includes("insert")) return "insert";
  if (kind.includes("delete")) return "delete";
  if (kind.includes("block")) return "block";
  return "";
}
function formatOperationDetails(op) {
  const id = op.id;
  const idStr = Array.isArray(id) ? `<span class="operation-id">[${id[0]}, ${id[1]}]</span>` : "";
  switch (op.kind) {
    case "insert_block":
      return `Block type: ${op.block.type} \u2022 ID: ${idStr}`;
    case "delete_block":
      return `ID: ${idStr}`;
    case "insert_char":
      return `Char: "${op.char}" \u2022 ID: ${idStr} \u2022 After: ${formatId(op.after)}`;
    case "delete_char":
      return `ID: ${idStr}`;
    case "insert_list_item":
      return `ID: ${idStr}`;
    case "insert_list_char":
      return `Char: "${op.char}" \u2022 ID: ${idStr}`;
    case "insert_cell_char":
      return `Char: "${op.char}" \u2022 ID: ${idStr}`;
    default:
      return `ID: ${idStr}`;
  }
}
function formatId(id) {
  if (id === "HEAD") return "HEAD";
  return `[${id[0]}, ${id[1]}]`;
}
function updateRGATree() {
  if (!rgaTreeEl || !doc) return;
  const showTombstones = showTombstonesCheckbox?.checked ?? true;
  const blocksRGA = doc.blocks;
  const treeHtml = renderRGANode(blocksRGA.head, showTombstones, 0);
  rgaTreeEl.innerHTML = treeHtml;
  rgaTreeEl.scrollTop = 0;
}
function renderRGANode(node, showTombstones, depth) {
  if (!node) return "";
  const isHead = node.id === "HEAD";
  const isDeleted = node.deleted && !isHead;
  if (isDeleted && !showTombstones) {
    let childrenHtml = "";
    for (const child of node.children) {
      childrenHtml += renderRGANode(child, showTombstones, depth);
    }
    return childrenHtml;
  }
  const nodeClass = `tree-node ${isHead ? "head" : ""} ${isDeleted ? "deleted" : ""}`;
  const indent = depth * 20;
  let value = "HEAD";
  if (!isHead && node.value) {
    if (typeof node.value === "string") {
      value = node.value;
    } else if (node.value.type) {
      value = `${node.value.type} block`;
    } else {
      value = "node";
    }
  }
  const idStr = isHead ? "" : formatId(node.id);
  const replicaId2 = Array.isArray(node.id) ? node.id[0] : 0;
  let html = `
    <div class="${nodeClass}" style="margin-left: ${indent}px">
      <div class="tree-node-content">
        <span class="tree-node-value">${value}</span>
        ${idStr ? `<span class="tree-node-id">${idStr}</span>` : ""}
        ${replicaId2 > 0 ? `<span class="tree-node-replica" style="background: ${getReplicaColor(replicaId2)}">R${replicaId2}</span>` : ""}
      </div>
    </div>
  `;
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      html += renderRGANode(child, showTombstones, depth + 1);
    }
  }
  return html;
}
function getReplicaColor(id) {
  const colors = [
    "rgba(13, 110, 253, 0.2)",
    // blue
    "rgba(220, 53, 69, 0.2)",
    // red
    "rgba(25, 135, 84, 0.2)",
    // green
    "rgba(255, 193, 7, 0.2)",
    // yellow
    "rgba(111, 66, 193, 0.2)"
    // purple
  ];
  return colors[(id - 1) % colors.length];
}
function updateConflictLog() {
  if (!conflictLogEl) return;
  conflictLogEl.innerHTML = "";
  if (conflictHistory.length === 0) {
    conflictLogEl.innerHTML = '<div class="conflict-empty">No concurrent operations detected yet. Open this page in multiple tabs and type at the same position simultaneously to see how CRDTs handle concurrent edits!</div>';
    return;
  }
  const recentConflicts = [...conflictHistory].reverse();
  recentConflicts.forEach(({ description, resolution, timestamp }) => {
    const entry = document.createElement("div");
    entry.className = "conflict-entry";
    const header = document.createElement("div");
    header.className = "conflict-header";
    header.textContent = `\u{1F500} ${description}`;
    const time = document.createElement("div");
    time.className = "conflict-description";
    time.textContent = new Date(timestamp).toLocaleTimeString();
    const resolutionEl = document.createElement("div");
    resolutionEl.className = "conflict-resolution";
    resolutionEl.textContent = resolution;
    entry.appendChild(header);
    entry.appendChild(time);
    entry.appendChild(resolutionEl);
    conflictLogEl.appendChild(entry);
  });
  conflictLogEl.scrollTop = 0;
}
function updateDocumentState() {
  if (!documentStateEl || !doc) return;
  const blocks = doc.visibleBlocks();
  const blockCount = blocks.length;
  const totalChars = blocks.reduce((sum, block) => {
    if (block.toString) {
      return sum + block.toString().length;
    }
    return sum;
  }, 0);
  documentStateEl.innerHTML = `
    <div class="state-section">
      <div class="state-label">Replica ID</div>
      <div class="state-value">${replicaId}</div>
    </div>
    <div class="state-section">
      <div class="state-label">Block Count</div>
      <div class="state-value">${blockCount}</div>
    </div>
    <div class="state-section">
      <div class="state-label">Total Characters</div>
      <div class="state-value">${totalChars}</div>
    </div>
    <div class="state-section">
      <div class="state-label">Operations Received</div>
      <div class="state-value">${operationHistory.length}</div>
    </div>
    <div class="state-section">
      <div class="state-label">Concurrent Operations</div>
      <div class="state-value">${conflictHistory.length}</div>
    </div>
  `;
}
function updateInspector() {
  updateOperationLog();
  updateRGATree();
  updateConflictLog();
  updateDocumentState();
}
