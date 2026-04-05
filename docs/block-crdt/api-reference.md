# block-crdt API Reference

Full API documentation for the `block-crdt` package.

## Table of Contents

- [CRDTDocument](#crdtdocument)
  - [Creating and Forking](#creating-and-forking)
  - [Block Operations](#block-operations)
  - [Paragraph / Heading Text Operations](#paragraph--heading-text-operations)
  - [List Operations](#list-operations)
  - [Table Operations](#table-operations)
  - [Document Queries](#document-queries)
  - [Applying Remote Operations](#applying-remote-operations)
  - [Serialization](#serialization)
- [Types](#types)
  - [CRDTId](#crdtid)
  - [CRDTOp](#crdtop)
  - [Block Classes](#block-classes)
  - [RGA](#rga)
  - [RGAElement](#rgaelement)
- [Error Conditions](#error-conditions)

---

## CRDTDocument

The top-level document. Owns an `RGA<Block>` and exposes all editing operations.

```ts
import { CRDTDocument } from 'block-crdt';
```

### Creating and Forking

#### `new CRDTDocument(replicaId: ReplicaId)`

Creates a new empty document for a given replica.

```ts
const doc = new CRDTDocument(1);
doc.replicaId; // 1
doc.blockCount(); // 0
```

#### `fork(newReplicaId: ReplicaId): CRDTDocument`

Creates a deep copy of the document state with a new replica ID. Use this when a second peer joins an existing session.

```ts
const alice = new CRDTDocument(1);
alice.insertParagraphBlock();

const bob = alice.fork(2);
bob.blockCount(); // 1 -- same initial state
```

The fork includes all blocks, their content, and tombstones. Operations from either replica can then be exchanged via `apply()`.

---

### Block Operations

#### `insertParagraphBlock(after?: CRDTId): CRDTOp`

Inserts a new `ParagraphBlock`. Appends after the given ID, or at the end of the document if `after` is omitted.

```ts
const op = doc.insertParagraphBlock();         // append to end
const op2 = doc.insertParagraphBlock(op.id);   // insert after op
```

Returns a `CRDTOp` with `kind: "insert_block"`.

#### `insertHeadingBlock(level: number, after?: CRDTId): CRDTOp`

Inserts a new `HeadingBlock` with the given level (1–6).

```ts
const h1 = doc.insertHeadingBlock(1);
const h2 = doc.insertHeadingBlock(2, h1.id);
```

**Throws:** `Error("Heading level must be between 1 and 6")` if `level < 1` or `level > 6`.

#### `insertListBlock(style: "bullet" | "ordered", after?: CRDTId): CRDTOp`

Inserts a new `ListBlock`.

```ts
const bullet  = doc.insertListBlock('bullet');
const ordered = doc.insertListBlock('ordered', bullet.id);
```

#### `insertTableBlock(after?: CRDTId): CRDTOp`

Inserts a new empty `TableBlock`.

```ts
const table = doc.insertTableBlock();
```

#### `deleteBlock(id: CRDTId): CRDTOp`

Marks a block as deleted (tombstone). The block is removed from `visibleBlocks()` and `blockCount()`, but its ID remains valid for causal ordering of any in-flight operations.

```ts
doc.deleteBlock(op.id);
doc.blockCount(); // 0
```

---

### Paragraph / Heading Text Operations

These methods work on any block that extends `TextBlock`, i.e., `ParagraphBlock` and `HeadingBlock`.

#### `insertText(blockId: CRDTId, text: string, after?: CRDTId): CRDTOp[]`

Inserts a string of text into a text block. Internally splits the string into individual characters, each producing one `CRDTOp`. Returns an array of ops in insertion order.

If `after` is omitted, text is appended after the current end of the block's content.

```ts
const para = doc.insertParagraphBlock();
const ops = doc.insertText(para.id, 'Hello');
// ops.length === 5

// Insert " World" after the last character of "Hello"
doc.insertText(para.id, ' World', ops[ops.length - 1].id);
doc.getParagraphText(para.id); // "Hello World"
```

**Throws:** `Error("Block not found or deleted")` if `blockId` refers to a missing or deleted block.  
**Throws:** `Error("Block is not a text block (paragraph or heading)")` if the block is a list or table.

#### `deleteChar(blockId: CRDTId, charId: CRDTId): CRDTOp`

Deletes a single character from a text block by its character-level `CRDTId`. The character ID is the `id` field from the `CRDTOp` returned by `insertText`.

```ts
const ops = doc.insertText(para.id, 'Hi!');
doc.deleteChar(para.id, ops[2].id); // delete '!'
doc.getParagraphText(para.id); // "Hi"
```

#### `getParagraphText(blockId: CRDTId): string`

Returns the current visible text of a paragraph or heading block. Returns `""` if the block doesn't exist or is not a text block.

```ts
doc.getParagraphText(para.id); // "Hello World"
```

---

### List Operations

#### `insertListItem(blockId: CRDTId, after?: CRDTId): CRDTOp`

Inserts a new empty `ListItem` into a list block. Appends to the end of the list if `after` is omitted.

```ts
const list = doc.insertListBlock('bullet');
const item1 = doc.insertListItem(list.id);
const item2 = doc.insertListItem(list.id, item1.id); // after item1
```

**Throws:** `Error("Block not found or deleted")` if `blockId` is invalid.  
**Throws:** `Error("Block is not a list")` if the block is not a `ListBlock`.

#### `deleteListItem(blockId: CRDTId, itemId: CRDTId): CRDTOp`

Tombstones a list item. The item is hidden from the visible item list.

```ts
doc.deleteListItem(list.id, item1.id);
```

#### `insertListItemText(blockId: CRDTId, itemId: CRDTId, text: string, after?: CRDTId): CRDTOp[]`

Inserts text into a list item's content RGA. Returns one op per character.

```ts
const ops = doc.insertListItemText(list.id, item1.id, 'Buy milk');
doc.getListItemText(list.id, item1.id); // "Buy milk"
```

**Throws:** `Error("Block not found or deleted")` or `Error("List item not found or deleted")` for invalid IDs.

#### `deleteListItemChar(blockId: CRDTId, itemId: CRDTId, charId: CRDTId): CRDTOp`

Deletes a single character from a list item.

```ts
const ops = doc.insertListItemText(list.id, item1.id, 'Hello!');
doc.deleteListItemChar(list.id, item1.id, ops[5].id); // delete '!'
doc.getListItemText(list.id, item1.id); // "Hello"
```

#### `getListItemText(blockId: CRDTId, itemId: CRDTId): string`

Returns the visible text of a single list item. Returns `""` for missing or deleted items.

---

### Table Operations

#### `insertTableRow(blockId: CRDTId, after?: CRDTId): CRDTOp`

Inserts a new row into a table. Appends to the end of the row list if `after` is omitted.

```ts
const table = doc.insertTableBlock();
const row1 = doc.insertTableRow(table.id);
const row2 = doc.insertTableRow(table.id, row1.id);
```

#### `insertTableColumn(blockId: CRDTId, after?: CRDTId): CRDTOp`

Inserts a new column into a table. Columns and rows are independent RGAs and can be inserted in any order.

```ts
const col1 = doc.insertTableColumn(table.id);
const col2 = doc.insertTableColumn(table.id, col1.id);
```

#### `deleteTableRow(blockId: CRDTId, rowId: CRDTId): CRDTOp`

Tombstones a row. Any cell content for that row is also hidden.

```ts
doc.deleteTableRow(table.id, row1.id);
doc.getTableDimensions(table.id); // { rows: 1, columns: 2 }
```

#### `deleteTableColumn(blockId: CRDTId, columnId: CRDTId): CRDTOp`

Tombstones a column.

#### `insertTableCellText(blockId: CRDTId, rowId: CRDTId, columnId: CRDTId, text: string, after?: CRDTId): CRDTOp[]`

Inserts text into a specific cell. The cell is identified by `(rowId, columnId)` and is created lazily if it doesn't exist yet. Returns one op per character.

If the referenced row or column has been deleted, the insertion is silently ignored.

```ts
doc.insertTableCellText(table.id, row1.id, col1.id, 'Alice');
doc.getTableCellText(table.id, row1.id, col1.id); // "Alice"
```

#### `deleteTableCellChar(blockId: CRDTId, rowId: CRDTId, columnId: CRDTId, charId: CRDTId): CRDTOp`

Deletes a character from a table cell.

```ts
const ops = doc.insertTableCellText(table.id, row1.id, col1.id, 'Hi!');
doc.deleteTableCellChar(table.id, row1.id, col1.id, ops[2].id);
doc.getTableCellText(table.id, row1.id, col1.id); // "Hi"
```

#### `getTableCellText(blockId: CRDTId, rowId: CRDTId, columnId: CRDTId): string`

Returns the visible text in a cell. Returns `""` if the cell has never been written to, or the block/cell is missing.

#### `getTableDimensions(blockId: CRDTId): { rows: number; columns: number }`

Returns the number of visible rows and columns.

```ts
doc.getTableDimensions(table.id); // { rows: 2, columns: 3 }
```

---

### Document Queries

#### `visibleBlocks(): Block[]`

Returns an array of all visible (non-deleted) blocks in document order.

```ts
const blocks = doc.visibleBlocks();
blocks.forEach(b => console.log(b.type));
```

#### `blockCount(): number`

Returns the count of visible blocks.

#### `getBlock(id: CRDTId): Block | undefined`

Returns the block with the given ID, or `undefined` if it doesn't exist or has been deleted.

```ts
const block = doc.getBlock(para.id);
// block instanceof ParagraphBlock
```

#### `getBlockAt(index: number): Block | undefined`

Returns the block at the given 0-based index in the visible block list.

```ts
doc.getBlockAt(0); // first block
doc.getBlockAt(99); // undefined if out of range
```

#### `getBlockIndex(id: CRDTId): number`

Returns the 0-based index of a block in the visible list. Returns `-1` if the block doesn't exist or is deleted.

#### `lastBlockId(): CRDTId`

Returns the `CRDTId` of the last visible block, or `"HEAD"` if the document is empty. Used internally but available for advanced use cases.

---

### Applying Remote Operations

#### `apply(op: CRDTOp): void`

Applies a single operation to the document. Used for both local operations (called internally) and remote operations received from other replicas.

This method is idempotent -- applying the same operation twice has no effect.

It also updates the Lamport clock: if the incoming op has a counter higher than the local clock, the local clock advances to `counter + 1`.

```ts
const op = alice.insertParagraphBlock();
bob.apply(op);
```

#### `applyMany(ops: CRDTOp[]): void`

Applies an array of operations in sequence.

```ts
const ops = [
  alice.insertHeadingBlock(1),
  alice.insertParagraphBlock(),
];
bob.applyMany(ops);
```

---

### Serialization

#### `toJSON(): object`

Returns a plain object snapshot of the document suitable for storage or transmission.

```ts
const snapshot = doc.toJSON();
// {
//   type: "document",
//   replicaId: 1,
//   clock: 7,
//   blocks: { /* RGA tree */ }
// }
```

---

## Types

### CRDTId

```ts
type CRDTId = [replicaId: number, counter: number] | "HEAD";
```

Every element in the RGA has a `CRDTId`. `"HEAD"` is the sentinel node at the beginning of every sequence. Tuple IDs are `[replicaId, counter]`.

### ReplicaId

```ts
type ReplicaId = number;
```

A numeric identifier uniquely assigned to each peer/client.

### CRDTOp

A discriminated union of all operations. The `kind` field distinguishes them.

| `kind` | Description |
|--------|-------------|
| `insert_block` | Insert a block into the document |
| `delete_block` | Delete a block from the document |
| `insert_char` | Insert a character into a paragraph or heading |
| `delete_char` | Delete a character from a paragraph or heading |
| `insert_list_item` | Insert a list item into a list block |
| `delete_list_item` | Delete a list item |
| `insert_list_char` | Insert a character into a list item |
| `delete_list_char` | Delete a character from a list item |
| `insert_row` | Insert a row into a table |
| `delete_row` | Delete a row from a table |
| `insert_column` | Insert a column into a table |
| `delete_column` | Delete a column from a table |
| `insert_cell_char` | Insert a character into a table cell |
| `delete_cell_char` | Delete a character from a table cell |

Every op carries an `id: CRDTId` that uniquely identifies it. Insert ops also carry an `after: CRDTId` referencing the element they follow.

### Block Classes

| Class | `type` | Extends |
|-------|--------|---------|
| `ParagraphBlock` | `"paragraph"` | `TextBlock` |
| `HeadingBlock` | `"heading"` | `TextBlock` |
| `ListBlock` | `"list"` | `Block` |
| `TableBlock` | `"table"` | `Block` |

All blocks have a `toJSON()` method. `TextBlock` subclasses expose a `content: RGA<string>` property and a `toString()` method.

`HeadingBlock` additionally exposes:
- `level: number` -- heading level 1–6

`ListBlock` additionally exposes:
- `style: "bullet" | "ordered"`
- `items: RGA<ListItem>` -- the list item sequence

`TableBlock` additionally exposes:
- `rows: RGA<TableRow>` -- the row sequence
- `columns: RGA<TableColumn>` -- the column sequence
- `cells: TableCellStore` -- keyed cell store

### RGA

The generic Replicated Growable Array data structure. Used internally for all sequences.

```ts
class RGA<T> {
  head: RGAElement<T>;

  insertRGAElement(element: RGAElement<T>): void;
  delete(id: CRDTId): void;
  getElement(id: CRDTId): RGAElement<T> | undefined;
  visible(): T[];
  lastVisibleId(): CRDTId;
  clone(): RGA<T>;
  toJSON(): RGAJSON<T>;
}
```

Key behaviors:
- **Idempotent inserts**: inserting an element whose ID is already known is a no-op
- **Out-of-order delivery**: inserting an element whose `after` parent is not yet known queues it internally and flushes when the parent arrives
- **Deterministic ordering**: concurrent children of the same parent are sorted by `(counter asc, replicaId asc)`

### RGAElement

```ts
class RGAElement<T> {
  id: CRDTId;
  value: T;
  after: CRDTId;
  deleted: boolean;
  children: RGAElement<T>[];
}
```

---

## Error Conditions

| Method | Condition | Error |
|--------|-----------|-------|
| `insertHeadingBlock(level)` | `level < 1` or `level > 6` | `"Heading level must be between 1 and 6"` |
| `insertText(blockId, ...)` | `blockId` is missing or deleted | `"Block not found or deleted"` |
| `insertText(blockId, ...)` | block is not a `TextBlock` | `"Block is not a text block (paragraph or heading)"` |
| `insertListItem(blockId, ...)` | `blockId` is missing or deleted | `"Block not found or deleted"` |
| `insertListItem(blockId, ...)` | block is not a `ListBlock` | `"Block is not a list"` |
| `insertListItemText(...)` | `blockId` is missing/deleted | `"Block not found or deleted"` |
| `insertListItemText(...)` | `itemId` is missing/deleted | `"List item not found or deleted"` |
| `insertTableRow(...)` | `blockId` is missing or deleted | `"Block not found or deleted"` |
| `insertTableRow(...)` | block is not a `TableBlock` | `"Block is not a table"` |
| `insertTableColumn(...)` | same as `insertTableRow` | same as above |
| `insertTableCellText(...)` | `blockId` is missing or deleted | `"Block not found or deleted"` |
| `insertTableCellText(...)` | block is not a `TableBlock` | `"Block is not a table"` |

Operations targeting already-deleted elements (characters, list items, rows, columns, cells) are silently ignored and do not throw.
