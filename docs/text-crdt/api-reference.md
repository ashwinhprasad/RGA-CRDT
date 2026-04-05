# text-crdt API Reference

Full API documentation for the `text-crdt` package.

## Table of Contents

- [RgaReplica](#rgareplica)
- [RgaDocument](#rgadocument)
- [Identifier](#identifier)
- [Operations](#operations)
- [Error Conditions](#error-conditions)

---

## RgaReplica

The primary entry point. Wraps an `RgaDocument` with clock management and operation generation.

```ts
import { RgaReplica } from 'text-crdt';
```

### Constructor

```ts
new RgaReplica(replicaId: number, clock?: number, doc?: RgaDocument)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `replicaId` | `number` | Unique numeric identifier for this replica. Must be distinct from all other replicas in the same collaborative session. |
| `clock` | `number` (optional) | Initial logical clock value. Defaults to `0`. Set automatically when forking. |
| `doc` | `RgaDocument` (optional) | Initial document state. Defaults to a fresh empty document. Set automatically when forking. |

### Methods

#### `document(): RgaDocument`

Returns the underlying document. Use this to read state (e.g., `getText()`).

```ts
const r = new RgaReplica(0);
r.document().getText(); // ""
```

#### `insert(prevId: Identifier, char: string): InsertOp`

Inserts a single character after the element identified by `prevId`.

| Parameter | Description |
|-----------|-------------|
| `prevId` | The identifier of the element to insert after. Use `document().lastId()` to append, or use a specific element's `id` to insert at a position. |
| `char` | A single character string. Throws if `char.length !== 1`. |

Returns an `InsertOp` that must be broadcast to all other replicas.

```ts
const r = new RgaReplica(0);
const op1 = r.insert(r.document().lastId(), 'H');
const op2 = r.insert(op1.id, 'i');
r.document().getText(); // "Hi"
```

**Throws:** `Error("Only single characters supported")` if `char.length !== 1`.

#### `delete(id: Identifier): DeleteOp`

Marks the character with the given identifier as deleted (tombstone).

| Parameter | Description |
|-----------|-------------|
| `id` | The identifier of the character to delete. This is the `id` field from a prior `InsertOp`. |

Returns a `DeleteOp` that must be broadcast to all other replicas.

```ts
const r = new RgaReplica(0);
const op = r.insert(r.document().lastId(), 'X');
r.delete(op.id);
r.document().getText(); // ""
```

Deleting an already-deleted character is a no-op and does not throw.

#### `apply(op: Operation): void`

Applies a remote operation received from another replica. This is idempotent -- applying the same operation twice has no effect.

| Parameter | Description |
|-----------|-------------|
| `op` | An `InsertOp` or `DeleteOp` received from a remote replica. |

```ts
const r1 = new RgaReplica(0);
const r2 = r1.fork(1);

const op = r1.insert(r1.document().lastId(), 'A');
r2.apply(op);

r2.document().getText(); // "A"
```

Operations may be applied in any order. There is no requirement for causal ordering -- if an insert's parent doesn't yet exist locally, the insert is silently ignored. (For causal buffer support, use `block-crdt`'s `RGA` class.)

#### `fork(newReplicaId: number): RgaReplica`

Creates a new replica with a deep copy of the current document state. The new replica starts with the same content, including tombstones, but has a different `replicaId`.

Used when a new peer joins and needs to inherit the current document state.

```ts
const alice = new RgaReplica(0);
alice.insert(alice.document().lastId(), 'A');

const bob = alice.fork(1); // bob starts with "A"
bob.document().getText(); // "A"
```

---

## RgaDocument

Holds the RGA tree structure. Obtained via `replica.document()`.

### Methods

#### `getText(): string`

Returns the current visible text content by performing an in-order tree traversal, skipping tombstoned nodes.

```ts
r.document().getText(); // "Hello"
```

#### `lastId(): Identifier`

Returns the `Identifier` of the last visible element in document order. Returns the HEAD sentinel identifier if the document is empty.

Use this as the `prevId` argument to `insert()` when you want to append to the end.

```ts
const lastPos = r.document().lastId();
r.insert(lastPos, 'Z'); // appends to end
```

---

## Identifier

A globally unique identifier for every element in the RGA, composed of a logical clock counter and a replica ID.

```ts
import { Identifier } from 'text-crdt';
```

### Constructor

```ts
new Identifier(counter: number, replicaId: number)
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `counter` | `number` | Logical clock value at the time of creation. Higher = later. |
| `replicaId` | `number` | The replica that created this identifier. |

### Methods

#### `compare(other: Identifier): boolean`

Returns `true` if `this` is greater than `other` in the sort order (by counter descending, then replicaId descending). Used internally for deterministic child ordering.

#### `equals(other: Identifier): boolean`

Returns `true` if both `counter` and `replicaId` match.

#### `toString(): string`

Returns a human-readable string in the form `(counter,replicaId)`.

---

## Operations

Operations are the unit of exchange between replicas. Every mutating method on `RgaReplica` returns an operation that must be sent to all other replicas.

### `InsertOp`

```ts
class InsertOp {
  readonly type: "insert";
  readonly id: Identifier;       // globally unique ID for the new character
  readonly prevId: Identifier;   // the character this is inserted after
  readonly value: string;        // the character (single char)
}
```

### `DeleteOp`

```ts
class DeleteOp {
  readonly type: "delete";
  readonly targetId: Identifier; // the ID of the character to tombstone
}
```

### `Operation`

```ts
type Operation = InsertOp | DeleteOp;
```

Passed to `replica.apply()` on remote replicas.

---

## Error Conditions

| Method | Condition | Error message |
|--------|-----------|---------------|
| `insert()` | `char.length !== 1` | `"Only single characters supported"` |

All other operations are silent no-ops for invalid/missing inputs (e.g., deleting a non-existent ID, applying an op whose parent is missing).

---

## Complete Example

```ts
import { RgaReplica } from 'text-crdt';

// Setup: three replicas
const r1 = new RgaReplica(0);
const r2 = r1.fork(1);
const r3 = r1.fork(2);

// Each types a character concurrently
const op1 = r1.insert(r1.document().lastId(), 'A');
const op2 = r2.insert(r2.document().lastId(), 'B');
const op3 = r3.insert(r3.document().lastId(), 'C');

// All-to-all exchange
r1.apply(op2); r1.apply(op3);
r2.apply(op1); r2.apply(op3);
r3.apply(op1); r3.apply(op2);

// All three converge to the same string
const text = r1.document().getText();
r2.document().getText() === text; // true
r3.document().getText() === text; // true

// r1 deletes its character
const del = r1.delete(op1.id);
r2.apply(del);
r3.apply(del);

// All three converge again
r1.document().getText() === r2.document().getText(); // true
```
