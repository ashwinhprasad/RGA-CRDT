import { describe, it, expect, beforeEach } from "vitest";
import { RGA, RGAElement, CRDTId } from "../src/rga.mjs";

describe("RGA (Replicated Growable Array)", () => {
  let rga: RGA<string>;

  beforeEach(() => {
    rga = new RGA<string>();
  });

  it("inserts a single element after HEAD", () => {
    rga.insertRGAElement(
      new RGAElement([1, 1], "A", "HEAD")
    );

    expect(rga.visible()).toEqual(["A"]);
  });

  it("inserts elements sequentially", () => {
    rga.insertRGAElement(new RGAElement([1, 1], "A", "HEAD"));
    rga.insertRGAElement(new RGAElement([1, 2], "B", [1, 1]));
    rga.insertRGAElement(new RGAElement([1, 3], "C", [1, 2]));

    expect(rga.visible()).toEqual(["A", "B", "C"]);
  });

  it("orders concurrent inserts by counter then replicaId", () => {
    rga.insertRGAElement(new RGAElement([1, 1], "A", "HEAD"));

    // concurrent inserts after A
    rga.insertRGAElement(new RGAElement([2, 2], "B", [1, 1]));
    rga.insertRGAElement(new RGAElement([1, 2], "C", [1, 1]));
    rga.insertRGAElement(new RGAElement([3, 2], "D", [1, 1]));

    expect(rga.visible()).toEqual(["A", "C", "B", "D"]);
  });

  it("handles interleaved concurrent inserts at different positions", () => {
    rga.insertRGAElement(new RGAElement([1, 1], "A", "HEAD"));
    rga.insertRGAElement(new RGAElement([1, 2], "B", [1, 1]));

    // concurrent inserts
    rga.insertRGAElement(new RGAElement([2, 3], "X", [1, 1]));
    rga.insertRGAElement(new RGAElement([3, 4], "Y", [1, 2]));

    expect(rga.visible()).toEqual(["A", "B", "Y", "X"]);
  });

  it("does not re-insert an element with the same ID", () => {
    const el = new RGAElement([1, 1], "A", "HEAD");

    rga.insertRGAElement(el);
    rga.insertRGAElement(el);

    expect(rga.visible()).toEqual(["A"]);
  });

  it("marks elements as deleted without removing them structurally", () => {
    rga.insertRGAElement(new RGAElement([1, 1], "A", "HEAD"));
    rga.insertRGAElement(new RGAElement([1, 2], "B", [1, 1]));
    rga.insertRGAElement(new RGAElement([1, 3], "C", [1, 2]));

    rga.delete([1, 2]);

    expect(rga.visible()).toEqual(["A", "C"]);
  });

  it("preserves children of deleted elements", () => {
    rga.insertRGAElement(new RGAElement([1, 1], "A", "HEAD"));
    rga.insertRGAElement(new RGAElement([1, 2], "B", [1, 1]));

    // delete B
    rga.delete([1, 2]);

    // insert after deleted B
    rga.insertRGAElement(new RGAElement([2, 3], "C", [1, 2]));

    expect(rga.visible()).toEqual(["A", "C"]);
  });

  it("produces deterministic order regardless of insertion order", () => {
    const ops: RGAElement<string>[] = [
      new RGAElement([2, 2], "B", [1, 1]),
      new RGAElement([1, 1], "A", "HEAD"),
      new RGAElement([1, 2], "C", [1, 1]),
    ];

    // shuffle application order
    rga.insertRGAElement(ops[0]);
    rga.insertRGAElement(ops[1]);
    rga.insertRGAElement(ops[2]);

    expect(rga.visible()).toEqual(["A", "C", "B"]);
  });
});
