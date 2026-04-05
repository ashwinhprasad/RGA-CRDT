# text-crdt

A character-level RGA (Replicated Growable Array) CRDT for plain text collaborative editing. Designed for correctness, clarity, and as a learning tool for understanding sequence CRDTs.

## Installation

```bash
npm install
npm run build
```

## Usage

### Basic Example

```ts
import { RgaReplica } from 'text-crdt';

// Create a replica
const replica = new RgaReplica(0);

// Insert characters one at a time
const h = replica.insert(replica.document().lastId(), 'H');
const e = replica.insert(h.id, 'e');
const l1 = replica.insert(e.id, 'l');
const l2 = replica.insert(l1.id, 'l');
const o = replica.insert(l2.id, 'o');

replica.document().getText(); // "Hello"
```

### Collaborative Editing

```ts
import { RgaReplica } from 'text-crdt';

// Create two replicas from the same initial state
const alice = new RgaReplica(0);
const bob = alice.fork(1);

// Alice types "Hi"
const h = alice.insert(alice.document().lastId(), 'H');
const i = alice.insert(h.id, 'i');

// Bob types "!"
const ex = bob.insert(bob.document().lastId(), '!');

// Exchange operations (order doesn't matter)
bob.apply(h);
bob.apply(i);
alice.apply(ex);

// Both converge to the same text
alice.document().getText(); // "Hi!"
bob.document().getText();   // "Hi!"
```

### Deletions

```ts
const r1 = new RgaReplica(0);
const r2 = r1.fork(1);

// r1 creates "Hi"
const h = r1.insert(r1.document().lastId(), 'H');
const i = r1.insert(h.id, 'i');
r2.apply(h);
r2.apply(i);

// r2 deletes 'H'
const del = r2.delete(h.id);
r1.apply(del);

r1.document().getText(); // "i"
r2.document().getText(); // "i"
```

## API

### `RgaReplica`

The main entry point. Each replica represents a peer/user in a collaborative session.

#### Constructor

```ts
new RgaReplica(replicaId: number, clock?: number, doc?: RgaDocument)
```

- `replicaId` -- unique numeric identifier for this replica
- `clock` -- optional initial clock value (used when forking)
- `doc` -- optional existing document (used when forking)

#### Methods

| Method | Description |
|--------|-------------|
| `document()` | Returns the underlying `RgaDocument` |
| `insert(prevId: Identifier, char: string): InsertOp` | Insert a character after the given identifier |
| `delete(id: Identifier): DeleteOp` | Delete the character with the given identifier |
| `apply(op: Operation): void` | Apply a remote operation |
| `fork(newReplicaId: number): RgaReplica` | Create a new replica with the same state |

### `RgaDocument`

The document holds the RGA tree structure and provides read access.

| Method | Description |
|--------|-------------|
| `getText(): string` | Returns the visible text content |
| `lastId(): Identifier` | Returns the identifier of the last visible element (or HEAD) |

### `Identifier`

Unique identifiers for elements in the RGA.

```ts
class Identifier {
  constructor(public counter: number, public replicaId: number)
}
```

### `Operation`

Discriminated union of insert and delete operations.

```ts
type Operation = InsertOp | DeleteOp;

interface InsertOp {
  id: Identifier;
  after: Identifier;
  char: string;
}

interface DeleteOp {
  id: Identifier;
}
```

## Design

Each character in the document is an RGA node with:
- A globally unique `(counter, replicaId)` identifier
- A reference to the identifier it was inserted after
- A tombstone flag (deleted nodes are hidden but retained for convergence)
- An ordered list of children (elements inserted after this character)

Children are sorted deterministically by `(counter, replicaId)` to ensure all replicas converge regardless of operation delivery order.

## Running Tests

```bash
npm test            # Run once
npm run test:watch  # Watch mode
```

## Limitations

- Single-character inserts only (no multi-character batch inserts)
- No tombstone garbage collection
- No network/transport layer (operations are exchanged manually)

These are intentional simplifications to keep the implementation focused and educational. See the [main README](../../README.md) for more context.
