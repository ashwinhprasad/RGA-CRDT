
import { CRDTId, ReplicaId, RGA, RGAElement } from "./rga.mjs";
import { Block, CRDTOp, ParagraphBlock } from "./block.mjs";  


export class CRDTDocument {
  constructor(
    public type: "document",
    public replicaId: ReplicaId,
    public clock: number,
    public blocks: RGA<Block>
  ) {}

  fork(newReplicaId: ReplicaId) {
    return new CRDTDocument(
      "document",
      newReplicaId,
      this.clock,
      this.blocks.clone()
    );
  }

  nextId(): CRDTId {
    this.clock += 1;
    return [this.replicaId, this.clock];
  }

  insertBlock(after: CRDTId, block: Block): CRDTOp {
    const op: CRDTOp = {
      kind: "insert_block",
      id: this.nextId(),
      after,
      block
    };

    this.apply(op);
    return op;
  }

  deleteBlock(id: CRDTId): CRDTOp {
    const op: CRDTOp = {
      kind: "delete_block",
      id
    };

    this.apply(op);
    return op;
  }

  apply(op: CRDTOp) {
    switch (op.kind) {
      case "insert_block": {
        this.blocks.insertRGAElement(
          new RGAElement(op.id, op.block, op.after)
        );
        break;
      }

      case "delete_block": {
        this.blocks.delete(op.id);
        break;
      }

      case "insert_char":
      case "delete_char": {
        const blockEl = this.blocks.getElement(op.blockId);
        if (!blockEl || blockEl.deleted) return;

        const block = blockEl.value;
        if (block instanceof ParagraphBlock) {
          block.apply(op);
        }
        break;
      }
    }
  }


  lastBlockId(): CRDTId {
    return this.blocks.lastVisibleId();
  }

}