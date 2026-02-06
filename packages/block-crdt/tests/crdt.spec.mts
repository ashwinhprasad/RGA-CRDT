import { describe, it, expect } from "vitest";
import { CRDTDocument } from "../src/crdtDocument.mjs";
import { ParagraphBlock, HeadingBlock } from "../src/block.mjs";
import { RGA } from "../src/rga.mjs";

describe("CRDT Document", () => {
    it("should create a document and insert a block", () => {
        const doc = new CRDTDocument("document", 1, 0, new RGA());
        
        const paragraph = new ParagraphBlock(new RGA<string>());
        const op = doc.insertBlock("HEAD", paragraph);
        
        expect(op.kind).toBe("insert_block");
        expect(doc.blocks.visible().length).toBe(1);
        expect(doc.blocks.visible()[0]).toBe(paragraph);
    });

    it("should delete a block", () => {
        const doc = new CRDTDocument("document", 1, 0, new RGA());
        
        const paragraph = new ParagraphBlock(new RGA<string>());
        const insertOp = doc.insertBlock("HEAD", paragraph);
        
        expect(doc.blocks.visible().length).toBe(1);
        
        const deleteOp = doc.deleteBlock(insertOp.id);
        
        expect(deleteOp.kind).toBe("delete_block");
        expect(doc.blocks.visible().length).toBe(0);
    });

    it("concurrent block inserts converge deterministically", () => {
        const r1 = new CRDTDocument("document", 1, 0, new RGA());
        const r2 = r1.fork(2);

        const heading = new HeadingBlock(1, new RGA<string>());
        const h1 = r1.insertBlock(
            r1.lastBlockId(),
            heading
        );

        const paragraph = new ParagraphBlock(new RGA<string>());
        const p1 = r2.insertBlock(
            r2.lastBlockId(),
            paragraph
        );

        r1.apply(p1);
        r2.apply(h1);

        const r1Blocks = r1.blocks.visible();
        const r2Blocks = r2.blocks.visible();
        
        expect(r1Blocks.length).toBe(r2Blocks.length);
        expect(r1Blocks.length).toBe(2);
        // Both replicas should have the same blocks in the same order
        expect(r1Blocks[0].type).toBe(r2Blocks[0].type);
        expect(r1Blocks[1].type).toBe(r2Blocks[1].type);
    });
});