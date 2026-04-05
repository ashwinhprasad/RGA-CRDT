# block-crdt

A block-based RGA (Replicated Growable Array) CRDT engine for collaborative rich-text editing. Supports paragraphs, headings, lists, and tables — all with concurrent, conflict-free editing across multiple peers.

## Installation

```bash
npm install
npm run build
```

## Quickstart

```ts
import { CRDTDocument } from 'block-crdt';

// Create a document (replica ID 1)
const doc = new CRDTDocument(1);

// Add a heading
const h1 = doc.insertHeadingBlock(1);
doc.insertText(h1.id, 'My Document');

// Add a paragraph after the heading
const para = doc.insertParagraphBlock(h1.id);
doc.insertText(para.id, 'Hello, world!');

// Add a bullet list
const list = doc.insertListBlock('bullet', para.id);
const item = doc.insertListItem(list.id);
doc.insertListItemText(list.id, item.id, 'First item');

// Query
doc.blockCount();                          // 3
doc.getParagraphText(para.id);             // "Hello, world!"
doc.getListItemText(list.id, item.id);     // "First item"
```

## Collaborative Editing

Every mutating method returns a `CRDTOp` (or `CRDTOp[]` for multi-character inserts). Broadcast these to all peers and apply with `apply()` or `applyMany()`.

```ts
const alice = new CRDTDocument(1);
const bob = alice.fork(2); // inherit current state, different replica ID

const blockOp = alice.insertParagraphBlock();
bob.apply(blockOp); // sync block creation to Bob

// Both type concurrently
const aliceOps = alice.insertText(blockOp.id, 'Hello');
const bobOps   = bob.insertText(blockOp.id, 'World');

// Exchange (any order)
aliceOps.forEach(op => bob.apply(op));
bobOps.forEach(op => alice.apply(op));

// Converged
alice.getParagraphText(blockOp.id) === bob.getParagraphText(blockOp.id); // true
```

## Documentation

For full documentation, see:

- [API Reference](../../docs/block-crdt/api-reference.md) -- Complete API for `CRDTDocument` and all types
- [Block Types Guide](../../docs/block-crdt/block-types.md) -- Detailed usage for paragraphs, headings, lists, and tables
- [Architecture Overview](../../docs/architecture.md) -- How block-crdt and text-crdt relate
- [Understanding CRDTs](../../docs/understanding-crdts.md) -- RGA concepts explained

## Block Types at a Glance

| Block Type | Insert Method | Text Access |
|---|---|---|
| `ParagraphBlock` | `insertParagraphBlock()` | `getParagraphText(blockId)` |
| `HeadingBlock` | `insertHeadingBlock(level)` | `getParagraphText(blockId)` |
| `ListBlock` | `insertListBlock(style)` | `getListItemText(blockId, itemId)` |
| `TableBlock` | `insertTableBlock()` | `getTableCellText(blockId, rowId, colId)` |

## Running Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode
```
