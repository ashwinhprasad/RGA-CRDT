import { describe, it, expect } from "vitest";
import { CRDTDocument } from "../src/crdtDocument.mjs";
import { ParagraphBlock } from "../src/block.mjs";


describe("ParagraphBlock", () => {
  it("builds text sequentially", () => {
    const paragraph = new ParagraphBlock();

    paragraph.insertChar("HEAD", "H", [1, 1]);
    paragraph.insertChar([1, 1], "i", [1, 2]);

    expect(paragraph.toString()).toBe("Hi");
    expect(paragraph.toJSON().text).toBe("Hi");
  });

  it("deletes a character and keeps order", () => {
    const paragraph = new ParagraphBlock();

    paragraph.insertChar("HEAD", "C", [1, 1]);
    paragraph.insertChar([1, 1], "a", [1, 2]);
    paragraph.insertChar([1, 2], "t", [1, 3]);

    paragraph.deleteChar([1, 2]);

    expect(paragraph.toString()).toBe("Ct");
  });

  it("applies character operations through the document", () => {
    const doc = new CRDTDocument(1);
    const paragraph = new ParagraphBlock();
    doc.insertBlock("HEAD", paragraph);

    paragraph.insertChar("HEAD", "H", [7, 1]);
    paragraph.insertChar([7, 1], "i", [7, 2]);
    paragraph.insertChar([7, 2], "!", [7, 3]);

    expect((doc.visibleBlocks()[0] as ParagraphBlock).toString()).toBe("Hi!");
  });

  it("converges on concurrent inserts across replicas", () => {
    const r1 = new CRDTDocument(1);
    const paragraph = new ParagraphBlock();
    r1.insertBlock("HEAD", paragraph);

    const r2 = r1.fork(2);

    (r1.visibleBlocks()[0] as ParagraphBlock).insertChar("HEAD", "A", [1, 5]);
    (r2.visibleBlocks()[0] as ParagraphBlock).insertChar("HEAD", "B", [2, 5]);

    // simulate receiving the remote inserts
    (r1.visibleBlocks()[0] as ParagraphBlock).insertChar("HEAD", "B", [2, 5]);
    (r2.visibleBlocks()[0] as ParagraphBlock).insertChar("HEAD", "A", [1, 5]);

    expect((r1.visibleBlocks()[0] as ParagraphBlock).toString()).toBe("AB");
    expect((r2.visibleBlocks()[0] as ParagraphBlock).toString()).toBe("AB");
  });

  it("removes characters across replicas", () => {
    const r1 = new CRDTDocument(1);
    const paragraph = new ParagraphBlock();
    r1.insertBlock("HEAD", paragraph);
    const r2 = r1.fork(2);

    const p1 = r1.visibleBlocks()[0] as ParagraphBlock;
    const p2 = r2.visibleBlocks()[0] as ParagraphBlock;

    p1.insertChar("HEAD", "X", [1, 6]);
    p1.insertChar([1, 6], "Y", [2, 6]);

    // simulate delivery to replica 2
    p2.insertChar("HEAD", "X", [1, 6]);
    p2.insertChar([1, 6], "Y", [2, 6]);

    p1.deleteChar([1, 6]);
    p2.deleteChar([1, 6]);

    expect((r1.visibleBlocks()[0] as ParagraphBlock).toString()).toBe("Y");
    expect((r2.visibleBlocks()[0] as ParagraphBlock).toString()).toBe("Y");
  });
});
