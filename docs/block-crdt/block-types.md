# Block Types Guide

Detailed usage guide for all block types in `block-crdt`.

## Table of Contents

- [ParagraphBlock](#paragraphblock)
- [HeadingBlock](#headingblock)
- [ListBlock](#listblock)
- [TableBlock](#tableblock)
- [Working with Multiple Block Types](#working-with-multiple-block-types)
- [Collaborative Editing Patterns](#collaborative-editing-patterns)

---

## ParagraphBlock

A plain text paragraph. The simplest block type. Uses an `RGA<string>` internally to hold characters.

### Creating and Inserting Text

```ts
const doc = new CRDTDocument(1);

// Insert a paragraph (appended to end by default)
const para = doc.insertParagraphBlock();

// Append text
doc.insertText(para.id, 'Hello, world!');
doc.getParagraphText(para.id); // "Hello, world!"
```

### Inserting at a Specific Position

`insertText` accepts an optional `after` parameter — the `CRDTId` of the character to insert after:

```ts
const ops = doc.insertText(para.id, 'Hello');
// ops[4].id is the id of 'o'

doc.insertText(para.id, ' World', ops[4].id);
doc.getParagraphText(para.id); // "Hello World"
```

### Deleting Characters

Each op returned by `insertText` carries an `id` field — use this to delete the character later:

```ts
const ops = doc.insertText(para.id, 'Hello!');
const exclamId = ops[5].id; // id of '!'

doc.deleteChar(para.id, exclamId);
doc.getParagraphText(para.id); // "Hello"
```

Deletion is a tombstone: the character is hidden but its ID remains valid for causal ordering.

### Serialization

```ts
const block = doc.getBlock(para.id);
block.toJSON();
// {
//   type: "paragraph",
//   text: "Hello",
//   content: { /* RGA tree */ }
// }
```

---

## HeadingBlock

A heading with a level between 1 and 6. Behaves exactly like a `ParagraphBlock` for text operations, with the addition of a `level` property.

### Creating Headings

```ts
const h1 = doc.insertHeadingBlock(1);
const h2 = doc.insertHeadingBlock(2, h1.id);  // after h1
const h6 = doc.insertHeadingBlock(6, h2.id);

// Invalid levels throw immediately
doc.insertHeadingBlock(0); // throws: "Heading level must be between 1 and 6"
doc.insertHeadingBlock(7); // throws
```

### Inserting Text

Text methods are identical to `ParagraphBlock`. Both `insertText` and `getParagraphText` work on headings:

```ts
doc.insertText(h1.id, 'Chapter 1: Getting Started');
doc.getParagraphText(h1.id); // "Chapter 1: Getting Started"
```

### Inspecting Level

```ts
import { HeadingBlock } from 'block-crdt';

const block = doc.getBlock(h2.id) as HeadingBlock;
block.level; // 2
block.type;  // "heading"
```

### Serialization

```ts
block.toJSON();
// {
//   type: "heading",
//   level: 2,
//   text: "Chapter 1: Getting Started",
//   content: { /* RGA tree */ }
// }
```

---

## ListBlock

An ordered or unordered list. Each item has its own `RGA<string>` for text content, enabling independent concurrent editing of items.

### Creating a List

```ts
const bullet  = doc.insertListBlock('bullet');
const ordered = doc.insertListBlock('ordered', bullet.id);
```

### Adding Items

Items are inserted into the list's own RGA. Like blocks, each item has a `CRDTId` you use for subsequent operations:

```ts
const item1 = doc.insertListItem(list.id);
const item2 = doc.insertListItem(list.id, item1.id); // after item1
const item3 = doc.insertListItem(list.id, item2.id); // after item2
```

If the `after` argument is omitted, the item is appended to the end of the current visible list.

### Adding Text to Items

```ts
doc.insertListItemText(list.id, item1.id, 'First item');
doc.insertListItemText(list.id, item2.id, 'Second item');
doc.insertListItemText(list.id, item3.id, 'Third item');

doc.getListItemText(list.id, item1.id); // "First item"
doc.getListItemText(list.id, item3.id); // "Third item"
```

### Deleting Characters from Items

```ts
const ops = doc.insertListItemText(list.id, item1.id, 'Hello!');
doc.deleteListItemChar(list.id, item1.id, ops[5].id); // delete '!'
doc.getListItemText(list.id, item1.id); // "Hello"
```

### Deleting Items

```ts
doc.deleteListItem(list.id, item2.id);

const listBlock = doc.getBlock(list.id) as ListBlock;
listBlock.items.visible().length; // 2 (item2 is gone)
```

### Inspecting the List

```ts
import { ListBlock } from 'block-crdt';

const listBlock = doc.getBlock(list.id) as ListBlock;
listBlock.style;                  // "bullet" or "ordered"
listBlock.items.visible().length; // number of live items
listBlock.toString();             // items joined by "\n"
```

### Serialization

```ts
listBlock.toJSON();
// {
//   type: "list",
//   style: "bullet",
//   text: "First item\nThird item",
//   items: { /* RGA tree of list items */ }
// }
```

### Concurrent Item Editing

Two replicas can concurrently add and edit items:

```ts
const alice = new CRDTDocument(1);
const bob = alice.fork(2);

const listOp = alice.insertListBlock('bullet');
bob.apply(listOp);

// Both add an item concurrently
const aliceItem = alice.insertListItem(listOp.id);
const bobItem   = bob.insertListItem(listOp.id);

bob.apply(aliceItem);
alice.apply(bobItem);

const aliceList = alice.getBlock(listOp.id) as ListBlock;
const bobList   = bob.getBlock(listOp.id) as ListBlock;

aliceList.items.visible().length === 2; // true
bobList.items.visible().length === 2;   // true
// Both replicas have the same two items in the same deterministic order
```

---

## TableBlock

A table with independent RGAs for rows and columns, and a cell store keyed by `(rowId, columnId)`. Rows and columns can be added concurrently and in any order.

### Creating a Table

```ts
const tableOp = doc.insertTableBlock();
const tableId = tableOp.id;
```

### Adding Rows and Columns

Rows and columns are independent sequences. You can add them in any order:

```ts
const row1 = doc.insertTableRow(tableId);
const row2 = doc.insertTableRow(tableId, row1.id); // after row1

const col1 = doc.insertTableColumn(tableId);
const col2 = doc.insertTableColumn(tableId, col1.id); // after col1
```

### Writing Cell Content

Cells are addressed by `(rowId, columnId)`. They are created lazily on first write:

```ts
doc.insertTableCellText(tableId, row1.id, col1.id, 'Name');
doc.insertTableCellText(tableId, row1.id, col2.id, 'Score');
doc.insertTableCellText(tableId, row2.id, col1.id, 'Alice');
doc.insertTableCellText(tableId, row2.id, col2.id, '100');

doc.getTableCellText(tableId, row2.id, col1.id); // "Alice"
doc.getTableCellText(tableId, row2.id, col2.id); // "100"
```

Empty cells (never written) return `""`.

### Table Dimensions

```ts
doc.getTableDimensions(tableId); // { rows: 2, columns: 2 }
```

### Deleting Rows and Columns

```ts
doc.deleteTableRow(tableId, row1.id);
doc.getTableDimensions(tableId); // { rows: 1, columns: 2 }

doc.deleteTableColumn(tableId, col2.id);
doc.getTableDimensions(tableId); // { rows: 1, columns: 1 }
```

Any cell content in a deleted row or column is automatically hidden (ops targeting deleted rows/columns are silently ignored).

### Deleting Characters in Cells

```ts
const ops = doc.insertTableCellText(tableId, row1.id, col1.id, 'Hi!');
doc.deleteTableCellChar(tableId, row1.id, col1.id, ops[2].id);
doc.getTableCellText(tableId, row1.id, col1.id); // "Hi"
```

### Inspecting a Table

```ts
import { TableBlock } from 'block-crdt';

const table = doc.getBlock(tableId) as TableBlock;
table.rows.visible().length;    // number of visible rows
table.columns.visible().length; // number of visible columns
table.cells;                    // TableCellStore
```

### Serialization

```ts
table.toJSON();
// {
//   type: "table",
//   rows: { /* RGA tree of TableRow elements */ },
//   columns: { /* RGA tree of TableColumn elements */ },
//   cells: {
//     "[1,1]:[1,3]": { text: "Name", content: {...} },
//     ...
//   }
// }
```

### Three-Way Concurrent Table Editing

Rows, columns, and cell content can all be edited concurrently across replicas:

```ts
const alice = new CRDTDocument(1);
const bob   = alice.fork(2);
const carol = alice.fork(3);

const tableOp = alice.insertTableBlock();
bob.apply(tableOp);
carol.apply(tableOp);

// Each adds something concurrently
const aliceRow = alice.insertTableRow(tableOp.id);
const bobCol   = bob.insertTableColumn(tableOp.id);
const carolRow = carol.insertTableRow(tableOp.id);

// Exchange
bob.apply(aliceRow);   carol.apply(aliceRow);
alice.apply(bobCol);   carol.apply(bobCol);
alice.apply(carolRow); bob.apply(carolRow);

// All three see 2 rows and 1 column
alice.getTableDimensions(tableOp.id); // { rows: 2, columns: 1 }
bob.getTableDimensions(tableOp.id);   // { rows: 2, columns: 1 }
carol.getTableDimensions(tableOp.id); // { rows: 2, columns: 1 }
```

---

## Working with Multiple Block Types

Blocks in a document are independent. You can mix types freely and reorder them with the `after` parameter:

```ts
const doc = new CRDTDocument(1);

// Build: H1 → paragraph → bullet list → table
const title = doc.insertHeadingBlock(1);
doc.insertText(title.id, 'Project Overview');

const intro = doc.insertParagraphBlock(title.id);
doc.insertText(intro.id, 'This is the introduction.');

const section = doc.insertHeadingBlock(2, intro.id);
doc.insertText(section.id, 'Features');

const features = doc.insertListBlock('bullet', section.id);
const f1 = doc.insertListItem(features.id);
doc.insertListItemText(features.id, f1.id, 'Real-time sync');
const f2 = doc.insertListItem(features.id, f1.id);
doc.insertListItemText(features.id, f2.id, 'Conflict-free');

const dataTable = doc.insertTableBlock(features.id);
const r1 = doc.insertTableRow(dataTable.id);
const c1 = doc.insertTableColumn(dataTable.id);
doc.insertTableCellText(dataTable.id, r1.id, c1.id, 'Status: Active');

doc.blockCount(); // 5
doc.visibleBlocks().map(b => b.type);
// ["heading", "paragraph", "heading", "list", "table"]
```

---

## Collaborative Editing Patterns

### Pattern 1: Sequential sync (each op broadcast immediately)

Best for real-time editors over a low-latency channel:

```ts
const alice = new CRDTDocument(1);
const bob = alice.fork(2);

// Every op is sent to the other side as it's produced
function aliceSend(op) { bob.apply(op); }

const h1 = alice.insertHeadingBlock(1);
aliceSend(h1);

alice.insertText(h1.id, 'H').forEach(aliceSend);
```

### Pattern 2: Batch sync (collect ops, send later)

Good for offline-first or coarser sync intervals:

```ts
const ops: CRDTOp[] = [];

const para = alice.insertParagraphBlock();
ops.push(para);
alice.insertText(para.id, 'Offline work').forEach(op => ops.push(op));

// Later, when back online:
bob.applyMany(ops);
```

### Pattern 3: Conflict resolution on delete

If Alice deletes a block while Bob is typing into it, Bob's typing ops are silently ignored (the block element is tombstoned). Alice's replica ends up with the block deleted; Bob's replica also ends up with the block deleted after applying Alice's delete op. Neither replica throws an error.

```ts
const para = alice.insertParagraphBlock();
bob.apply(para); // Bob gets the block

// Concurrently:
const aliceDel = alice.deleteBlock(para.id);
const bobOps = bob.insertText(para.id, 'Hello');

// Cross-apply
alice.applyMany(bobOps);  // ignored: block is already deleted locally
bob.apply(aliceDel);      // Bob's block is now deleted

alice.blockCount() === bob.blockCount(); // true: both 0
```
