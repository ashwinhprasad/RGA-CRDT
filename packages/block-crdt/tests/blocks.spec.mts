import { describe, it, expect } from "vitest";
import { CRDTDocument } from "../src/crdtDocument.mjs";
import {
  ParagraphBlock,
  HeadingBlock,
  ListBlock,
  TableBlock
} from "../src/block.mjs";


describe("CRDTDocument blocks", () => {
  it("creates a document and inserts a block", () => {
    const doc = new CRDTDocument(1);

    const paragraph = new ParagraphBlock();
    const op = doc.insertBlock("HEAD", paragraph);

    expect(op.kind).toBe("insert_block");
    expect(doc.visibleBlocks()).toEqual([paragraph]);

    const json = doc.toJson();
    expect(json.blocks.children?.length).toBe(1);
    expect((json.blocks.children?.[0]?.value as any).type).toBe("paragraph");
  });

  it("deletes a block and hides it from the visible set", () => {
    const doc = new CRDTDocument(1);

    const paragraph = new ParagraphBlock();
    const insertOp = doc.insertBlock("HEAD", paragraph);

    const deleteOp = doc.deleteBlock(insertOp.id);

    expect(deleteOp.kind).toBe("delete_block");
    expect(doc.visibleBlocks().length).toBe(0);

    const json = doc.toJson();
    expect(json.blocks.children?.[0]?.deleted).toBe(true);
  });

  it("converges deterministically for concurrent block inserts", () => {
    const r1 = new CRDTDocument(1);
    const r2 = r1.fork(2);

    const heading = new HeadingBlock(1);
    const h1 = r1.insertBlock(r1.lastBlockId(), heading);

    const paragraph = new ParagraphBlock();
    const p1 = r2.insertBlock(r2.lastBlockId(), paragraph);

    r1.apply(p1);
    r2.apply(h1);

    const r1Blocks = r1.visibleBlocks();
    const r2Blocks = r2.visibleBlocks();

    expect(r1Blocks.length).toBe(2);
    expect(r2Blocks.length).toBe(2);
    expect(r1Blocks.map((b) => b.type)).toEqual(r2Blocks.map((b) => b.type));
  });

  it("merges deletes and new inserts across replicas", () => {
    const base = new CRDTDocument(1);

    const firstParagraph = new ParagraphBlock();
    const p1 = base.insertBlock("HEAD", firstParagraph);
    const heading = new HeadingBlock(2);
    const h1 = base.insertBlock(p1.id, heading);

    const replica2 = base.fork(2);

    const table = new TableBlock();
    const tableOp = base.insertBlock(h1.id, table);
    const deleteFirst = base.deleteBlock(p1.id);

    const list = new ListBlock("bullet");
    const listOp = replica2.insertBlock(h1.id, list);

    replica2.apply(tableOp);
    replica2.apply(deleteFirst);
    base.apply(listOp);

    const r1Types = base.visibleBlocks().map((b) => b.type);
    const r2Types = replica2.visibleBlocks().map((b) => b.type);

    expect(r1Types).toEqual(["heading", "table", "list"]);
    expect(r2Types).toEqual(["heading", "table", "list"]);

    const json = base.toJson();
    const headChildren = json.blocks.children ?? [];
    const headingJson = headChildren[0]?.children?.[0];
    const nestedTypes = (headingJson?.children ?? []).map((child: any) => child.value.type).sort();

    expect(headChildren.length).toBe(1);
    expect(nestedTypes).toEqual(["list", "table"]);
  });
});
