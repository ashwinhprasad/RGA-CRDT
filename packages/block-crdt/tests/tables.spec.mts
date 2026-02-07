import { describe, it, expect } from "vitest";
import { CRDTDocument } from "../src/crdtDocument.mjs";
import {
  TableBlock,
  TableRow,
  TableColumn
} from "../src/block.mjs";
import { RGAElement } from "../src/rga.mjs";


describe("TableBlock", () => {
  it("creates rows, columns, and cell text", () => {
    const doc = new CRDTDocument(1);
    const table = new TableBlock();
    doc.insertBlock("HEAD", table);

    table.insertRow("HEAD", new TableRow(), [1, 2]);
    table.insertColumn("HEAD", new TableColumn(), [1, 3]);

    const cell = table.cells.ensureCell([1, 2], [1, 3]);
    cell.content.insertRGAElement(new RGAElement([1, 4], "R", "HEAD"));
    cell.content.insertRGAElement(new RGAElement([1, 5], "1", [1, 4]));

    expect(cell?.content.visible().join("")).toBe("R1");
    expect(table.rows.visible().length).toBe(1);
    expect(table.columns.visible().length).toBe(1);
  });

  it("deletes rows without removing stored cells", () => {
    const doc = new CRDTDocument(1);
    const table = new TableBlock();
    doc.insertBlock("HEAD", table);

    table.insertRow("HEAD", new TableRow(), [1, 2]);
    table.insertRow([1, 2], new TableRow(), [1, 3]);
    table.insertColumn("HEAD", new TableColumn(), [1, 4]);

    const cell = table.cells.ensureCell([1, 2], [1, 4]);
    cell.content.insertRGAElement(new RGAElement([1, 5], "X", "HEAD"));

    table.deleteRow([1, 2]);

    expect(table.rows.visible().length).toBe(1);
    const deletedCell = table.cells.getCell([1, 2], [1, 4]);
    expect(deletedCell?.content.visible().join("")).toBe("X");
  });

  it("converges for concurrent row and column inserts", () => {
    const base = new CRDTDocument(1);
    const table = new TableBlock();
    base.insertBlock("HEAD", table);

    table.insertRow("HEAD", new TableRow(), [1, 2]);
    table.insertColumn("HEAD", new TableColumn(), [1, 3]);

    const replica2 = base.fork(2);
    const table2 = replica2.visibleBlocks()[0] as TableBlock;

    table.insertRow([1, 2], new TableRow(), [1, 4]);
    table2.insertColumn([1, 3], new TableColumn(), [2, 4]);

    // simulate delivery of remote inserts
    table.insertColumn([1, 3], new TableColumn(), [2, 4]);
    table2.insertRow([1, 2], new TableRow(), [1, 4]);

    const cellR1 = table.cells.ensureCell([1, 4], [1, 3]);
    const cellR2 = table.cells.ensureCell([1, 2], [2, 4]);
    cellR1.content.insertRGAElement(new RGAElement([1, 5], "A", "HEAD"));
    cellR2.content.insertRGAElement(new RGAElement([2, 5], "B", "HEAD"));

    const cellR1Replica = table2.cells.ensureCell([1, 4], [1, 3]);
    const cellR2Replica = table2.cells.ensureCell([1, 2], [2, 4]);
    cellR1Replica.content.insertRGAElement(new RGAElement([1, 5], "A", "HEAD"));
    cellR2Replica.content.insertRGAElement(new RGAElement([2, 5], "B", "HEAD"));

    const table1 = base.visibleBlocks()[0] as TableBlock;
    const table2After = replica2.visibleBlocks()[0] as TableBlock;

    expect(table1.rows.visible().length).toBe(2);
    expect(table1.columns.visible().length).toBe(2);
    expect(table1.cells.getCell(row2.id, col1.id)?.content.visible().join("")).toBe("A");
    expect(table1.cells.getCell(row1.id, col2.id)?.content.visible().join("")).toBe("B");

    expect(table2After.rows.visible().length).toBe(2);
    expect(table2After.columns.visible().length).toBe(2);
    expect(table2After.cells.getCell([1, 4], [1, 3])?.content.visible().join("")).toBe("A");
    expect(table2After.cells.getCell([1, 2], [2, 4])?.content.visible().join("")).toBe("B");
  });
});
