import { Identifier } from "./identifier.mjs";
import { InsertOp, DeleteOp } from "./operation.mjs";
import type { Operation } from "./operation.mjs";
import { RgaDocument } from "./rgaDocument.mjs";

export class RgaReplica {
  private clock = 0;
  private readonly doc: RgaDocument;

  constructor(
    private readonly replicaId: number,
    clock?: number,
    doc?: RgaDocument
  ) {
    this.clock = clock ?? 0;
    this.doc = doc ?? new RgaDocument();
  }

  document(): RgaDocument {
    return this.doc;
  }

  /* ---------------- local ops ---------------- */

  insert(prevId: Identifier, char: string): InsertOp {
    if (char.length !== 1) {
      throw new Error("Only single characters supported");
    }

    const id = new Identifier(++this.clock, this.replicaId);
    const op = new InsertOp(id, prevId, char);
    this.doc.applyInsert(op);
    return op;
  }

  delete(id: Identifier): DeleteOp {
    const op = new DeleteOp(id);
    this.doc.applyDelete(op);
    return op;
  }

  /* ---------------- remote ops ---------------- */

  apply(op: Operation): void {
    if (op instanceof InsertOp) {
      this.doc.applyInsert(op);
    } else {
      this.doc.applyDelete(op);
    }
  }

  /* ---------------- fork ---------------- */

  fork(newReplicaId: number): RgaReplica {
  return new RgaReplica(
    newReplicaId,
    this.clock,
    new RgaDocument(this.doc)
  );
}
}
