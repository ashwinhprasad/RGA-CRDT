# Architecture Overview

How the two packages in this monorepo are structured and how they relate to each other.

## Package Relationship

```
text-crdt                        block-crdt
─────────────────                ──────────────────────────────────
RgaReplica                       CRDTDocument
  └── RgaDocument                  └── RGA<Block>
        └── RgaNode[]                    └── ParagraphBlock
              (tree)                     │     └── RGA<string>
                                         ├── HeadingBlock
                                         │     └── RGA<string>
                                         ├── ListBlock
                                         │     └── RGA<ListItem>
                                         │           └── RGA<string>
                                         └── TableBlock
                                               ├── RGA<TableRow>
                                               ├── RGA<TableColumn>
                                               └── TableCellStore
                                                     └── RGA<string> per cell
```

Both packages implement the same core RGA algorithm but at different layers of abstraction:

- **`text-crdt`** is a minimal, self-contained implementation with its own node/document types. It's optimized for clarity and learning.
- **`block-crdt`** is a higher-level abstraction. Its `RGA<T>` is generic and composable — it is used recursively to build up a full document model with block-level structure, list items, and table cells.

---

## text-crdt Architecture

```
src/
├── identifier.mts    -- Identifier class: (counter, replicaId)
├── operation.mts     -- InsertOp, DeleteOp, Operation union
├── rgaDocument.mts   -- RgaDocument: the RGA tree + traversal
└── rgaReplica.mts    -- RgaReplica: clock + local/remote op dispatch
```

### Layers

| Layer | Class | Responsibility |
|-------|-------|----------------|
| Identity | `Identifier` | Globally unique ID for each character |
| Operations | `InsertOp`, `DeleteOp` | Immutable records of edits; the unit of sync |
| Document | `RgaDocument` | RGA tree; apply ops; read text |
| Replica | `RgaReplica` | Lamport clock; generate ops; fork; apply remote ops |

### Data Flow

```
User action
    │
    ▼
RgaReplica.insert(prevId, char)
    │  increments clock
    │  creates InsertOp { id: (clock, replicaId), prevId, char }
    │  calls doc.applyInsert(op)
    │
    ▼
RgaDocument.applyInsert(op)
    │  finds parent node by prevId
    │  creates RgaNode
    │  inserts into parent.children in sorted order
    │
    ▼
Returns InsertOp → broadcast to peers

Peer calls replica.apply(op) → doc.applyInsert(op) → same path
```

---

## block-crdt Architecture

```
src/
├── rga.mts           -- Generic RGA<T>, RGAElement<T>, CRDTId types
├── block.mts         -- Block class hierarchy + CRDTOp union
└── crdtDocument.mts  -- CRDTDocument: orchestrates all block operations
```

### Layers

| Layer | File | Responsibility |
|-------|------|----------------|
| Core data structure | `rga.mts` | Generic RGA tree with causal buffer and cloning |
| Block types | `block.mts` | `ParagraphBlock`, `HeadingBlock`, `ListBlock`, `TableBlock`, supporting types, `CRDTOp` union |
| Document | `crdtDocument.mts` | Owns `RGA<Block>`, manages Lamport clock, dispatches all operations |

### CRDTOp Dispatch

`CRDTDocument.apply(op)` is the central dispatcher. It:

1. Updates the Lamport clock (`if op.id[1] > clock: clock = op.id[1] + 1`)
2. Routes the op by `kind`:
   - `insert_block` / `delete_block` → directly into `this.blocks` RGA
   - `insert_char` / `delete_char` → forwarded to the target `TextBlock.apply(op)`
   - `insert_list_*` / `delete_list_*` → forwarded to the target `ListBlock.apply(op)`
   - `insert_row` / `delete_row` / `insert_column` / `delete_column` / `insert_cell_char` / `delete_cell_char` → forwarded to the target `TableBlock.apply(op)`

Ops targeting blocks that are deleted or not yet visible are silently dropped.

### Causal Buffering

`block-crdt`'s `RGA<T>` has a built-in causal buffer. If an `insertRGAElement` call arrives and the element's `after` parent is not yet known:

1. The element is queued in `pendingByAfter` (keyed by the missing parent's ID)
2. `pendingIds` tracks which IDs are already queued (prevents duplicates)
3. When the parent eventually arrives via another `insertRGAElement` call, `drainPendingForParent` is called, which re-applies all queued children of that parent

This allows operations to be applied in any order, even if earlier ops in the causal chain haven't arrived yet.

`text-crdt` does **not** implement this buffer -- if a parent is missing, the insert is silently dropped.

### RGA Traversal and Ordering

Both packages use a **tree** representation of the RGA sequence. This is subtler than it first appears:

- Each element's `children` list contains elements that named it as their `after` parent
- When two elements have the **same parent** (concurrent inserts), they are sorted within the children list by `(counter asc, replicaId asc)`
- Document order is recovered by DFS traversal of the tree, visiting children in sorted order at each node

This means the "left-to-right" document order isn't stored explicitly -- it's implicit in the tree structure.

**Example:**

```
HEAD
├── A(replicaId=1, counter=1)     ← inserted first
│   └── C(replicaId=1, counter=2) ← inserted after A by replica 1
└── B(replicaId=2, counter=1)     ← inserted after HEAD by replica 2, concurrent with A
    └── D(replicaId=2, counter=2) ← inserted after B
```

DFS order: `A, C, B, D` -- but wait, HEAD's children are `[A, B]`. Sorted by `(counter, replicaId)`: both have counter=1, so by replicaId: A(1,1) < B(2,1). DFS gives `A → (A's children: C) → B → (B's children: D)` = `"ACBD"`.

---

## Convergence Guarantee

Both packages guarantee **strong eventual consistency** via:

1. **Deterministic sort**: children of the same parent are always sorted identically, regardless of insertion order
2. **Idempotent inserts**: inserting an element whose ID is already present is a no-op
3. **Commutative operations**: inserting/deleting in any order produces the same final tree
4. **Lamport clocks**: ensure IDs increase monotonically, preventing ID collisions across replicas

---

## Choosing Between the Two Packages

| Concern | text-crdt | block-crdt |
|---------|-----------|------------|
| Use case | Plain text, learning, minimal footprint | Rich documents with blocks, lists, tables |
| API surface | Minimal (insert char, delete char) | Full document editing API |
| Causal buffer | No | Yes |
| Out-of-order delivery | Silently drops orphaned ops | Buffers and retries |
| Generic RGA | No (hardcoded to `string`) | Yes (`RGA<T>`) |
| Complexity | Low | Higher |

If you're building a plain text collaborative field, `text-crdt` is sufficient. If you need document structure (headings, lists, tables), use `block-crdt`.

---

## Extension Points

Both packages intentionally omit the following, which are natural places to extend:

- **Tombstone garbage collection** -- once all replicas have seen a delete op, the tombstone can be removed. This requires a membership protocol to know when it's safe.
- **Snapshot / hydration** -- `toJSON()` produces a snapshot, but there's no corresponding `fromJSON()`. Implementing this would allow persisting and restoring documents.
- **Network transport** -- operations are exchanged manually via `apply()`. A real system would layer WebSocket, WebRTC, or a CRDTs sync protocol on top.
- **Undo/redo** -- since ops are append-only, undo can be modeled as a new inverse operation (re-insert a tombstoned element, or tombstone a re-inserted element).
