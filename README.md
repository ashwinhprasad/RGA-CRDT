# RGA-CRDT Monorepo

A collection of Conflict-free Replicated Data Types (CRDTs) based on the Replicated Growable Array (RGA) algorithm for building collaborative, real-time text editing experiences.

## Overview

This monorepo contains two packages:

| Package | Description |
|---------|-------------|
| [`@text-crdt`](packages/text-crdt/) | A pure character-level RGA CRDT for plain text collaborative editing |
| [`@block-crdt`](packages/block-crdt/) | A block-based RGA CRDT supporting paragraphs, headings, lists, and tables |

Both packages enable multiple replicas (e.g., browser tabs, users) to concurrently edit shared content and **converge to the same state** without requiring a central coordinator.

### Key Properties

- **Conflict-free** -- concurrent inserts and deletes are resolved deterministically
- **Out-of-order delivery** -- operations whose parent has not yet arrived are buffered and applied automatically
- **Idempotent** -- applying the same operation twice has no effect
- **Strong eventual consistency** -- all replicas that have received the same set of operations will have identical state

## Quickstart

### Prerequisites

- Node.js (LTS recommended)
- npm

### Install Dependencies

```bash
npm install
```

### `text-crdt` -- Plain Text Collaboration

A minimal, character-level CRDT ideal for understanding RGA fundamentals or building simple collaborative text editors.

```ts
import { RgaReplica } from 'text-crdt';

// Create two replicas (e.g., two users)
const alice = new RgaReplica(0);
const bob = alice.fork(1); // same state, different replica ID

// Alice types
const opA = alice.insert(alice.document().lastId(), 'H');
const opB = alice.insert(opA.id, 'i');

// Bob types concurrently
const opC = bob.insert(bob.document().lastId(), '!');

// Exchange operations (order doesn't matter)
bob.apply(opA);
bob.apply(opB);
alice.apply(opC);

// Both replicas converge
alice.document().getText(); // "Hi!"
bob.document().getText();   // "Hi!"
```

Run tests:

```bash
npm test -- packages/text-crdt
```

### `block-crdt` -- Block-Based Collaboration

A production-oriented CRDT for block-based editors (think Notion, Linear, or Coda-style editors).

```ts
import { CRDTDocument } from 'block-crdt';

// Create a document
const doc = new CRDTDocument(1);

// Insert a heading
const h1 = doc.insertHeadingBlock(1);
doc.insertText(h1.id, 'My Document');

// Insert a paragraph after the heading
const para = doc.insertParagraphBlock(h1.id);
doc.insertText(para.id, 'Hello, world!');

// Insert a bullet list
const list = doc.insertListBlock('bullet', para.id);
const item1 = doc.insertListItem(list.id);
doc.insertListItemText(list.id, item1.id, 'First item');

// Read it back
doc.getParagraphText(h1.id);   // "My Document"
doc.getParagraphText(para.id); // "Hello, world!"
doc.getListItemText(list.id, item1.id); // "First item"
doc.blockCount(); // 3
```

#### Collaborative Editing with `block-crdt`

```ts
import { CRDTDocument } from 'block-crdt';

// Alice and Bob start from the same document
const alice = new CRDTDocument(1);
const bob = alice.fork(2);

// Both create a paragraph and type concurrently
const blockOp = alice.insertParagraphBlock();
bob.apply(blockOp); // sync the block creation

const aliceOps = alice.insertText(blockOp.id, 'Alice');
const bobOps = bob.insertText(blockOp.id, 'Bob');

// Exchange ops -- order doesn't matter
aliceOps.forEach(op => bob.apply(op));
bobOps.forEach(op => alice.apply(op));

// Converged!
alice.getParagraphText(blockOp.id) === bob.getParagraphText(blockOp.id); // true
```

#### Tables

```ts
const tableOp = doc.insertTableBlock();
const tableId = tableOp.id;

// Add rows and columns
const row1 = doc.insertTableRow(tableId);
const row2 = doc.insertTableRow(tableId, row1.id);
const col1 = doc.insertTableColumn(tableId);
const col2 = doc.insertTableColumn(tableId, col1.id);

// Write into cells
doc.insertTableCellText(tableId, row1.id, col1.id, 'Name');
doc.insertTableCellText(tableId, row1.id, col2.id, 'Age');
doc.insertTableCellText(tableId, row2.id, col1.id, 'Alice');
doc.insertTableCellText(tableId, row2.id, col2.id, '30');

doc.getTableCellText(tableId, row2.id, col2.id); // "30"
doc.getTableDimensions(tableId); // { rows: 2, columns: 2 }
```

Run tests:

```bash
npm test -- packages/block-crdt
```

## Project Structure

```
RGA-CRDT/
├── packages/
│   ├── text-crdt/          # Character-level RGA CRDT
│   │   ├── src/
│   │   │   ├── identifier.mts
│   │   │   ├── operation.mts
│   │   │   ├── rgaDocument.mts
│   │   │   └── rgaReplica.mts
│   │   └── tests/
│   │       └── rga.spec.mts
│   │
│   └── block-crdt/         # Block-based RGA CRDT
│       ├── src/
│       │   ├── rga.mts
│       │   ├── block.mts
│       │   └── crdtDocument.mts
│       └── tests/
│           ├── rga.test.mts
│           ├── block.test.mts
│           └── crdtDocument.test.mts
│
└── docs/
    ├── understanding-crdts.md   # CRDT/RGA concepts explained
    ├── architecture.md          # Architecture overview
    ├── text-crdt/
    │   └── api-reference.md     # text-crdt API documentation
    └── block-crdt/
        ├── api-reference.md     # block-crdt API documentation
        └── block-types.md       # Detailed block types guide
```

## Further Reading

- [Understanding CRDTs and RGA](docs/understanding-crdts.md) -- Learn how RGA works
- [Architecture](docs/architecture.md) -- How the two packages relate to each other
- [text-crdt API Reference](docs/text-crdt/api-reference.md) -- Full API docs for text-crdt
- [block-crdt API Reference](docs/block-crdt/api-reference.md) -- Full API docs for block-crdt
- [Block Types Guide](docs/block-crdt/block-types.md) -- Detailed guide on paragraphs, headings, lists, and tables
- [Development Guide](docs/development.md) -- Build, test, and contribution workflow

## Development

For the full development guide (Docker setup, watch mode, debugging, Lerna reference) see [docs/development.md](docs/development.md).

### Build all packages

```bash
npm run build
```

### Run all tests

```bash
npm test
```

### Watch mode

```bash
npm run test:watch
```

## Limitations

These packages are designed for correctness and clarity. The following are intentionally not implemented:

- Garbage collection of tombstones
- Network / transport logic (ops are exchanged manually via `apply()`)
- Multi-character insert operations in `text-crdt` (one char at a time)

These are excellent extension points for further development.

## License

MIT
