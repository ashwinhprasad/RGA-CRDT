# CRDT Document Engine - Client API Design

## Overview

This API design focuses on providing a clean, intuitive interface for clients to work with collaborative documents while hiding the complexity of CRDT operations.

## Core Principles

1. **Simple for common operations** - Text editing should feel natural
2. **Support for multiple replicas** - Built-in collaboration
3. **Operation broadcasting** - Easy integration with sync layers
4. **Immutable operations** - Operations can be serialized and transmitted
5. **Idempotent application** - Safe to apply operations multiple times

## API Structure

### 1. Document Creation & Management

```typescript
// Create a new document with a unique replica ID
const doc = new CRDTDocument(replicaId: number);

// Fork a document for a new replica (useful when a new client joins)
const replica = doc.fork(newReplicaId: number): CRDTDocument;

// Get document state as JSON (for persistence/transmission)
const state = doc.toJSON();
```

### 2. Block Operations

```typescript
// Insert a paragraph block
const op = doc.insertParagraphBlock(after?: CRDTId): CRDTOp;

// Insert a heading block
const op = doc.insertHeadingBlock(level: 1-6, after?: CRDTId): CRDTOp;

// Insert a list block
const op = doc.insertListBlock(style: 'bullet' | 'ordered', after?: CRDTId): CRDTOp;

// Insert a table block
const op = doc.insertTableBlock(after?: CRDTId): CRDTOp;

// Delete a block
const op = doc.deleteBlock(blockId: CRDTId): CRDTOp;

// Get all visible blocks
const blocks = doc.visibleBlocks(): Block[];

// Get the last block ID (useful for appending)
const lastId = doc.lastBlockId(): CRDTId;
```

### 3. Paragraph Operations

```typescript
// Insert text into a paragraph
const op = doc.insertText(
  blockId: CRDTId,
  text: string,
  after?: CRDTId
): CRDTOp[];

// Delete a character
const op = doc.deleteChar(blockId: CRDTId, charId: CRDTId): CRDTOp;

// Get paragraph text
const text = doc.getParagraphText(blockId: CRDTId): string;
```

### 4. List Operations

```typescript
// Add a list item
const op = doc.insertListItem(
  blockId: CRDTId,
  after?: CRDTId
): CRDTOp;

// Delete a list item
const op = doc.deleteListItem(blockId: CRDTId, itemId: CRDTId): CRDTOp;

// Insert text into a list item
const ops = doc.insertListItemText(
  blockId: CRDTId,
  itemId: CRDTId,
  text: string,
  after?: CRDTId
): CRDTOp[];

// Delete character from list item
const op = doc.deleteListItemChar(
  blockId: CRDTId,
  itemId: CRDTId,
  charId: CRDTId
): CRDTOp;
```

### 5. Table Operations

```typescript
// Insert a row
const op = doc.insertTableRow(
  blockId: CRDTId,
  after?: CRDTId
): CRDTOp;

// Insert a column
const op = doc.insertTableColumn(
  blockId: CRDTId,
  after?: CRDTId
): CRDTOp;

// Delete row/column
const op = doc.deleteTableRow(blockId: CRDTId, rowId: CRDTId): CRDTOp;
const op = doc.deleteTableColumn(blockId: CRDTId, columnId: CRDTId): CRDTOp;

// Insert text into a cell
const ops = doc.insertTableCellText(
  blockId: CRDTId,
  rowId: CRDTId,
  columnId: CRDTId,
  text: string,
  after?: CRDTId
): CRDTOp[];

// Delete character from cell
const op = doc.deleteTableCellChar(
  blockId: CRDTId,
  rowId: CRDTId,
  columnId: CRDTId,
  charId: CRDTId
): CRDTOp;

// Get table dimensions
const { rows, columns } = doc.getTableDimensions(blockId: CRDTId);
```

### 6. Operation Handling

```typescript
// Apply operations from remote replicas
doc.apply(op: CRDTOp): void;

// Apply multiple operations
doc.applyMany(ops: CRDTOp[]): void;
```

### 7. Query & Navigation

```typescript
// Get a specific block
const block = doc.getBlock(blockId: CRDTId): Block | undefined;

// Get block by index in visible order
const block = doc.getBlockAt(index: number): Block | undefined;

// Get block index
const index = doc.getBlockIndex(blockId: CRDTId): number;

// Get block count
const count = doc.blockCount(): number;
```

## Usage Examples

### Example 1: Single User Editing

```typescript
import { CRDTDocument } from './crdtDocument.mjs';

// Create a document
const doc = new CRDTDocument(1);

// Insert a heading
const headingOp = doc.insertHeadingBlock(1);
const headingId = headingOp.id;

// Insert text into heading
const textOps = doc.insertText(headingId, "My Document");

// Insert a paragraph
const paraOp = doc.insertParagraphBlock(headingId);
const paraId = paraOp.id;

// Type some text
const text = "Hello, world!";
const ops = doc.insertText(paraId, text);

// Get the document content
const blocks = doc.visibleBlocks();
console.log(blocks);
```

### Example 2: Collaborative Editing (Two Replicas)

```typescript
// Replica 1 (Alice)
const alice = new CRDTDocument(1);

// Replica 2 (Bob) - forks from Alice's initial state
const bob = alice.fork(2);

// Alice creates a paragraph
const op1 = alice.insertParagraphBlock();
const blockId = op1.id;

// Bob receives and applies Alice's operation
bob.apply(op1);

// Both Alice and Bob type in the same paragraph concurrently
const aliceOps = alice.insertText(blockId, "Alice was here");
const bobOps = bob.insertText(blockId, "Bob was here");

// They exchange operations
aliceOps.forEach(op => bob.apply(op));
bobOps.forEach(op => alice.apply(op));

// Both converge to the same state (CRDT guarantee)
console.log(alice.getParagraphText(blockId));
console.log(bob.getParagraphText(blockId));
// Both will show the same text (order determined by CRDT)
```

### Example 3: Real-time Collaboration with WebSocket

```typescript
class CollaborativeEditor {
  private doc: CRDTDocument;
  private ws: WebSocket;
  
  constructor(replicaId: number, serverUrl: string) {
    this.doc = new CRDTDocument(replicaId);
    this.ws = new WebSocket(serverUrl);
    
    // Receive operations from server
    this.ws.onmessage = (event) => {
      const op = JSON.parse(event.data);
      this.doc.apply(op);
      this.render();
    };
  }
  
  // User types in a paragraph
  insertText(blockId: CRDTId, text: string, after?: CRDTId) {
    const ops = this.doc.insertText(blockId, text, after);
    
    // Broadcast operations to other clients
    ops.forEach(op => {
      this.ws.send(JSON.stringify(op));
    });
    
    this.render();
  }
  
  // User creates a new block
  addParagraph(after?: CRDTId) {
    const op = this.doc.insertParagraphBlock(after);
    this.ws.send(JSON.stringify(op));
    this.render();
    return op.id;
  }
  
  render() {
    const blocks = this.doc.visibleBlocks();
    // Update UI with blocks
  }
}
```

### Example 4: Building a List

```typescript
const doc = new CRDTDocument(1);

// Create a bullet list
const listOp = doc.insertListBlock('bullet');
const listId = listOp.id;

// Add first item
const item1Op = doc.insertListItem(listId);
const item1Id = item1Op.id;
doc.insertListItemText(listId, item1Id, "First item");

// Add second item after first
const item2Op = doc.insertListItem(listId, item1Id);
const item2Id = item2Op.id;
doc.insertListItemText(listId, item2Id, "Second item");

// Add third item
const item3Op = doc.insertListItem(listId, item2Id);
const item3Id = item3Op.id;
doc.insertListItemText(listId, item3Id, "Third item");
```

### Example 5: Creating a Table

```typescript
const doc = new CRDTDocument(1);

// Create a table
const tableOp = doc.insertTableBlock();
const tableId = tableOp.id;

// Add 3 rows
const row1Op = doc.insertTableRow(tableId);
const row2Op = doc.insertTableRow(tableId, row1Op.id);
const row3Op = doc.insertTableRow(tableId, row2Op.id);

// Add 2 columns
const col1Op = doc.insertTableColumn(tableId);
const col2Op = doc.insertTableColumn(tableId, col1Op.id);

// Fill in cells
doc.insertTableCellText(tableId, row1Op.id, col1Op.id, "Header 1");
doc.insertTableCellText(tableId, row1Op.id, col2Op.id, "Header 2");
doc.insertTableCellText(tableId, row2Op.id, col1Op.id, "Row 2, Col 1");
doc.insertTableCellText(tableId, row2Op.id, col2Op.id, "Row 2, Col 2");
```