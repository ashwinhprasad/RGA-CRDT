
import { CRDTId, ReplicaId, RGA, RGAElement } from "./rga.mjs";
import {
  Block,
  CRDTOp,
  ListBlock,
  ParagraphBlock,
  TableBlock
} from "./block.mjs";


export class CRDTDocument {
  public readonly type = "document";
  public readonly replicaId: ReplicaId;
  private clock: number;
  private blocks: RGA<Block>;

  constructor(replicaId: ReplicaId) {
    this.replicaId = replicaId;
    this.clock = 0;
    this.blocks = new RGA<Block>();
  }

  private static fromState(
    replicaId: ReplicaId,
    clock: number,
    blocks: RGA<Block>
  ): CRDTDocument {
    const doc = new CRDTDocument(replicaId);
    doc.clock = clock;
    doc.blocks = blocks;
    return doc;
  }

  fork(newReplicaId: ReplicaId) {
    return CRDTDocument.fromState(
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

      case "insert_list_item":
      case "delete_list_item":
      case "insert_list_char":
      case "delete_list_char": {
        const blockEl = this.blocks.getElement(op.blockId);
        if (!blockEl || blockEl.deleted) return;

        const block = blockEl.value;
        if (block instanceof ListBlock) {
          block.apply(op);
        }
        break;
      }

      case "insert_row":
      case "delete_row":
      case "insert_column":
      case "delete_column":
      case "insert_cell_char":
      case "delete_cell_char": {
        const blockEl = this.blocks.getElement(op.blockId);
        if (!blockEl || blockEl.deleted) return;

        const block = blockEl.value;
        if (block instanceof TableBlock) {
          block.apply(op);
        }
        break;
      }
    }
  }


  lastBlockId(): CRDTId {
    return this.blocks.lastVisibleId();
  }

  visibleBlocks(): Block[] {
    return this.blocks.visible();
  }

  toJSON() {
    return {
      type: this.type,
      replicaId: this.replicaId,
      clock: this.clock,
      blocks: this.blocks.toJSON()
    };
  }

  toJson() {
    return this.toJSON();
  }

}