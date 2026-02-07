import { describe, it, expect } from "vitest";
import { CRDTDocument } from "../src/crdtDocument.mjs";
import { HeadingBlock, ParagraphBlock } from "../src/block.mjs";
import { RGAElement } from "../src/rga.mjs";


describe("HeadingBlock", () => {
  it("serializes level and text", () => {
    const heading = new HeadingBlock(2);

    heading.content.insertRGAElement(new RGAElement([1, 1], "H", "HEAD"));
    heading.content.insertRGAElement(new RGAElement([1, 2], "i", [1, 1]));

    const json = heading.toJSON();

    expect(json.level).toBe(2);
    expect(json.text).toBe("Hi");
  });

  it("appears in document JSON", () => {
    const doc = new CRDTDocument(1);
    const heading = new HeadingBlock(3);

    doc.insertBlock("HEAD", heading);

    const json = doc.toJson();
    const value = json.blocks.children?.[0]?.value as any;

    expect(value.type).toBe("heading");
    expect(value.level).toBe(3);
  });

  it("orders concurrent headings deterministically", () => {
    const base = new CRDTDocument(1);
    const paragraph = new ParagraphBlock();
    const p1 = base.insertBlock("HEAD", paragraph);

    const replica2 = base.fork(2);

    const h1 = new HeadingBlock(1);
    const h1Op = base.insertBlock(p1.id, h1);

    const h2 = new HeadingBlock(2);
    const h2Op = replica2.insertBlock(p1.id, h2);

    base.apply(h2Op);
    replica2.apply(h1Op);

    const order1 = base.visibleBlocks().map((b) => (b as HeadingBlock | ParagraphBlock).type === "heading" ? (b as HeadingBlock).level : b.type);
    const order2 = replica2.visibleBlocks().map((b) => (b as HeadingBlock | ParagraphBlock).type === "heading" ? (b as HeadingBlock).level : b.type);

    expect(order1).toEqual(["paragraph", 1, 2]);
    expect(order2).toEqual(["paragraph", 1, 2]);
  });
});
