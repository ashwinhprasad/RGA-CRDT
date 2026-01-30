# RGA CRDT (Plain Text)

This project is a **minimal, educational implementation of an RGA (Replicated Growable Array)** CRDT for plain text.

It is designed as a **learning tool** for students and developers who want to understand:
- How sequence CRDTs work
- How concurrent text edits converge
- How tombstones and deterministic ordering are used in RGAs

This is **not** a production-ready editor engine. The focus is correctness, clarity, and approachability.

---

##  What is an RGA?

An **RGA (Replicated Growable Array)** is a CRDT designed to represent ordered sequences (like text).

Instead of indexing characters by position (which breaks under concurrency), each character:
- Has a **globally unique identifier**
- Is inserted *after* another identifier
- Is never physically removed (deleted elements become *tombstones*)

Because all replicas apply the same deterministic rules, they **eventually converge**, regardless of message order or concurrency.

---

## High-Level Design

This implementation is split into three main layers:

```
Replica (RgaReplica)
└── Document (RgaDocument)
└── Nodes (RgaNode, internal)
```

### Core ideas:
- **Identifiers** are `(counter, replicaId)` pairs
- **Insert operations** reference a previous identifier
- **Delete operations** mark nodes as tombstones
- **Children of a node are kept in deterministic order**
- **Forking a replica clones full state (including tombstones)**

---

## Project Structure

```
src/
├── identifier.mts # Unique ID logic
├── operation.mts # Insert / Delete operations
├── rgaDocument.mts # RGA tree structure
├── rgaReplica.mts # Replica + clock management
tests/
└── rga.spec.mts # Unit tests for RGA behavior
```

## Limitations (Intentional)

This project intentionally avoids:

- Garbage collection of tombstones
- Network / transport logic
- Multi-character inserts

These are excellent extensions for further learning.