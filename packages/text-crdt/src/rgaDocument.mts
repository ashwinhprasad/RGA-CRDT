import { Identifier } from "./identifier.mjs";
import { InsertOp, DeleteOp } from "./operation.mjs";

class RgaNode {
  readonly id: Identifier;
  readonly prevId: Identifier | null;
  readonly value: string;
  deleted = false;
  readonly children: RgaNode[] = [];

  constructor(id: Identifier, prevId: Identifier | null, value: string) {
    this.id = id;
    this.prevId = prevId;
    this.value = value;
  }
}

export class RgaDocument {

  private readonly nodes = new Map<string, RgaNode>();
  private readonly head: RgaNode;

  constructor(source?: RgaDocument) {
    if (!source) {
      const headId = new Identifier(0, 0);
      this.head = new RgaNode(headId, null, "");
      this.nodes.set(this.key(headId), this.head);
    } else {
      // deep clone
      const map = new Map<string, RgaNode>();

      for (const node of source.nodes.values()) {
        map.set(
          this.key(node.id),
          new RgaNode(node.id, node.prevId, node.value)
        );
      }

      for (const node of source.nodes.values()) {
        const clone = map.get(this.key(node.id))!;
        clone.deleted = node.deleted;
        for (const child of node.children) {
          clone.children.push(map.get(this.key(child.id))!);
        }
      }

      this.nodes.clear();
      for (const [k, v] of map) {
        this.nodes.set(k, v);
      }

      this.head = map.get(this.key(source.head.id))!;
    }
  }

  /* ---------------- apply ops ---------------- */

  applyInsert(op: InsertOp): void {
    const k = this.key(op.id);
    if (this.nodes.has(k)) return;

    const parent = this.nodes.get(this.key(op.prevId));
    if (!parent) return; // causal gap ignored for now

    const node = new RgaNode(op.id, op.prevId, op.value);
    this.nodes.set(k, node);

    this.insertOrdered(parent.children, node);
  }

  applyDelete(op: DeleteOp): void {
    const node = this.nodes.get(this.key(op.targetId));
    if (node) node.deleted = true;
  }

  /* ---------------- read ---------------- */

  getText(): string {
    const out: string[] = [];
    this.traverse(this.head, out);
    return out.join("");
  }

  lastId(): Identifier {
    return this.findLast(this.head);
  }

  /* ---------------- internals ---------------- */

  private traverse(node: RgaNode, out: string[]): void {
    for (const child of node.children) {
      if (!child.deleted) out.push(child.value);
      this.traverse(child, out);
    }
  }

  private findLast(node: RgaNode): Identifier {
    let last = node.id;
    for (const child of node.children) {
      last = this.findLast(child);
    }
    return last;
  }

  private insertOrdered(list: RgaNode[], node: RgaNode): void {
    let i = 0;
    while (i < list.length) {
      const current = list[i];
      if (!current) break;
      if (current.id.compare(node.id)) break;
      i++;
    }
    list.splice(i, 0, node);
  }

  private key(id: Identifier): string {
    return `${id.counter}:${id.replicaId}`;
  }

  headId(): Identifier {
    return this.head.id;
  }
}
