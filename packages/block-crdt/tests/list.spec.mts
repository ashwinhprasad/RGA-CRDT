import { describe, it, expect } from "vitest";
import { CRDTDocument } from "../src/crdtDocument.mjs";
import { ListBlock, ListItem } from "../src/block.mjs";
import { RGAElement } from "../src/rga.mjs";


describe("ListBlock", () => {
  it("inserts list items and characters", () => {
    const doc = new CRDTDocument(1);
    const list = new ListBlock("bullet");
    doc.insertBlock("HEAD", list);

    list.insertItem("HEAD", new ListItem(), [1, 2]);
    list.insertItem([1, 2], new ListItem(), [1, 3]);

    const item1 = list.items.getElement([1, 2])?.value as ListItem;
    const item2 = list.items.getElement([1, 3])?.value as ListItem;

    item1.content.insertRGAElement(new RGAElement([1, 4], "A", "HEAD"));
    item1.content.insertRGAElement(new RGAElement([1, 5], "1", [1, 4]));
    item2.content.insertRGAElement(new RGAElement([1, 6], "B", "HEAD"));

    expect(list.items.visible().length).toBe(2);
    expect(list.toString()).toBe("A1\nB");
  });

  it("deletes a list item", () => {
    const doc = new CRDTDocument(1);
    const list = new ListBlock("ordered");
    doc.insertBlock("HEAD", list);

    list.insertItem("HEAD", new ListItem(), [1, 2]);
    list.insertItem([1, 2], new ListItem(), [1, 3]);

    list.deleteItem([1, 2]);

    expect(list.items.visible().length).toBe(1);
    expect(list.items.visible()[0]).toBe(item2.item);
  });

  it("converges for concurrent list item inserts", () => {
    const base = new CRDTDocument(1);
    const list = new ListBlock("bullet");
    base.insertBlock("HEAD", list);

    const replica2 = base.fork(2);

    list.insertItem("HEAD", new ListItem(), [1, 2]);
    (replica2.visibleBlocks()[0] as ListBlock).insertItem("HEAD", new ListItem(), [2, 2]);

    // simulate delivery of remote inserts
    list.insertItem("HEAD", new ListItem(), [2, 2]);
    (replica2.visibleBlocks()[0] as ListBlock).insertItem("HEAD", new ListItem(), [1, 2]);

    const itemA = list.items.getElement([1, 2])?.value as ListItem;
    const itemB = list.items.getElement([2, 2])?.value as ListItem;

    itemA.content.insertRGAElement(new RGAElement([1, 3], "X", "HEAD"));
    itemB.content.insertRGAElement(new RGAElement([2, 3], "Y", "HEAD"));

    const itemA2 = (replica2.visibleBlocks()[0] as ListBlock).items.getElement([1, 2])?.value as ListItem;
    const itemB2 = (replica2.visibleBlocks()[0] as ListBlock).items.getElement([2, 2])?.value as ListItem;
    itemA2.content.insertRGAElement(new RGAElement([1, 3], "X", "HEAD"));
    itemB2.content.insertRGAElement(new RGAElement([2, 3], "Y", "HEAD"));

    expect(list.toString()).toBe("X\nY");
    expect((replica2.visibleBlocks()[0] as ListBlock).toString()).toBe("X\nY");
  });

  it("deletes characters inside a list item", () => {
    const doc = new CRDTDocument(1);
    const list = new ListBlock("bullet");
    doc.insertBlock("HEAD", list);

    list.insertItem("HEAD", new ListItem(), [1, 2]);

    const item = list.items.getElement([1, 2])?.value as ListItem;
    item.content.insertRGAElement(new RGAElement([1, 3], "Z", "HEAD"));
    item.content.delete([1, 3]);

    expect(list.toString()).toBe("");
  });
});
