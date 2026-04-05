# Understanding CRDTs and RGA

This document explains the fundamental concepts behind the two packages in this monorepo. No prior knowledge of distributed systems is required.

## What is a CRDT?

A **CRDT (Conflict-free Replicated Data Type)** is a data structure that can be replicated across multiple nodes, each of which can be updated independently and concurrently, with the guarantee that all replicas will eventually converge to the same value.

The key insight is that instead of resolving conflicts after they happen (like Git merge), CRDTs are designed so that conflicts **cannot happen** -- operations are structured to always be composable in a deterministic way.

### The Problem CRDTs Solve

Imagine Alice and Bob are both editing the same text document simultaneously, but they're offline from each other:

- Alice's version: `"Hello world"`
- Bob's version: `"Hello there"`

When they sync, how do you merge these? This is the classic "conflict" problem.

CRDTs sidestep this entirely by:
1. Never editing "by position" (positions shift when others insert/delete)
2. Giving every element a unique, stable identity
3. Defining operations that commute -- applying `op_alice` then `op_bob` gives the same result as `op_bob` then `op_alice`

---

## What is an RGA?

An **RGA (Replicated Growable Array)** is a CRDT algorithm specifically designed for ordered sequences, like text. It was introduced by Roh et al. (2011).

### Core Ideas

**1. Unique Identifiers Instead of Positions**

Instead of saying "insert 'A' at position 3", RGA says "insert 'A' after element with ID `(5, alice)`". Positions are fragile under concurrency; stable IDs are not.

An `Identifier` / `CRDTId` is a `(replicaId, counter)` pair:
- `replicaId` uniquely identifies the peer that created the element
- `counter` is a logical clock value, incremented on every operation

This guarantees global uniqueness: no two operations from any replica will ever produce the same ID.

**2. Insert-After Semantics**

Every insertion specifies which element it comes *after*. The sentinel **HEAD** node represents the beginning of the sequence.

```
HEAD → 'H' → 'e' → 'l' → 'l' → 'o'
```

Inserting 'X' after 'e' gives:

```
HEAD → 'H' → 'e' → 'X' → 'l' → 'l' → 'o'
```

**3. Tombstones Instead of Physical Deletion**

Deleted elements are never actually removed. They are marked with a *tombstone* flag and hidden from the visible output. This is critical because:

- A concurrent insert might reference a deleted element as its parent
- Without the tombstone, the parent would be missing and the insert would be orphaned

**4. Deterministic Ordering for Concurrent Inserts**

When two replicas concurrently insert after the same element, both inserts arrive at the other replica in some order. The RGA uses the identifier to break ties deterministically:

- Elements with the same `after` parent are sorted by their own ID: first by `counter` (ascending), then by `replicaId` (ascending) as a tiebreaker

This guarantees every replica sorts concurrent inserts identically, regardless of delivery order.

---

## Worked Example: Convergence

Alice (replica 0) and Bob (replica 1) start with `"AB"`:

```
HEAD → A(0,1) → B(0,2)
```

Concurrently, Alice inserts 'X' after `A(0,1)`, and Bob inserts 'Y' after `A(0,1)`:

- Alice produces: `InsertOp { id: (0,3), after: (0,1), char: 'X' }`
- Bob produces:   `InsertOp { id: (1,1), after: (0,1), char: 'Y' }`

Both operations reference the same parent `(0,1)`.

**At Alice's replica**, when Bob's op arrives, both `X` and `Y` are children of `A`. Sorted by counter then replica:
- `(0,3)` → X  (counter=3)
- `(1,1)` → Y  (counter=1, **lower counter wins**)

Result: `HEAD → A → Y → X → B`

**At Bob's replica**, when Alice's op arrives, same children, same sort:

Result: `HEAD → A → Y → X → B`

Both replicas produce `"AYXB"` -- they converged.

---

## The Tree Structure

RGA is often depicted as a linked list, but the implementation here uses a **tree**. Each node's children list holds elements inserted directly after it. In-order traversal of the tree produces the sequence.

```
HEAD
└── A(0,1)
    ├── Y(1,1)   ← inserted after A, lower counter
    │   └── X(0,3)   ← X is after Y in sort order
    │       └── B(0,2)  ← originally after A, re-parented by sort
```

Wait -- actually in RGA's tree model, each node's children are elements that declared *that* node as their `after`. The document order is recovered via DFS traversal of the tree.

This structure makes out-of-order delivery natural: if an operation references a parent that doesn't exist yet, it can be buffered until the parent arrives.

---

## Logical Clocks

Both packages use **Lamport clocks** for the `counter` component of IDs:

- On each local operation, the counter is incremented by 1
- When a remote operation is applied with a higher counter value, the local clock advances to `remote_counter + 1`

This guarantees that operations generated after observing another are always assigned a higher counter, establishing a causal ordering.

---

## Strong Eventual Consistency

The property the RGA provides is called **Strong Eventual Consistency (SEC)**:

- **Eventual consistency**: all replicas that have received the same set of operations will have the same state
- **Strong**: the state is identical (not just "equivalent") -- no manual conflict resolution needed

This is achieved because:
1. Every operation is idempotent (applying it twice has no effect)
2. Operations commute (applying them in any order gives the same result)
3. The deterministic sort order breaks all ties

---

## Further Reading

- Roh et al., "Replicated abstract data types: Building blocks for collaborative applications", 2011
- [CRDT.tech](https://crdt.tech) -- community resource on CRDTs
- [Architecture Overview](architecture.md) -- how the two packages in this repo are structured
