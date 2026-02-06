import { describe, it, expect } from "vitest";
import { RgaReplica } from "../src/rgaReplica.mjs";
import { Identifier } from "../src/identifier.mjs";

describe("RGA CRDT", () => {

  it("single replica sequential insert", () => {
    const r1 = new RgaReplica(0);

    r1.insert(r1.document().lastId(), "H");
    r1.insert(r1.document().lastId(), "e");
    r1.insert(r1.document().lastId(), "l");
    r1.insert(r1.document().lastId(), "l");
    r1.insert(r1.document().lastId(), "o");

    expect(r1.document().getText()).toBe("Hello");
  });

  it("forked replica has same state", () => {
    const r1 = new RgaReplica(0);

    r1.insert(r1.document().lastId(), "H");
    r1.insert(r1.document().lastId(), "i");

    const r2 = r1.fork(1);

    expect(r1.document().getText()).toBe("Hi");
    expect(r2.document().getText()).toBe("Hi");
  });

  it("manual operation delivery", () => {
    const r1 = new RgaReplica(0);
    const r2 = r1.fork(1);

    const op = r1.insert(r1.document().lastId(), "X");
    r2.apply(op);

    expect(r1.document().getText()).toBe("X");
    expect(r2.document().getText()).toBe("X");
  });

  it("concurrent inserts converge deterministically", () => {
    const r1 = new RgaReplica(0);
    const r2 = r1.fork(1);

    const op1 = r1.insert(r1.document().lastId(), "A");
    const op2 = r2.insert(r2.document().lastId(), "B");

    r1.apply(op2);
    r2.apply(op1);

    expect(r1.document().getText()).toBe(r2.document().getText());
  });

  it("delete converges correctly", () => {
    const r1 = new RgaReplica(0);
    const r2 = r1.fork(1);

    const op1 = r1.insert(r1.document().lastId(), "H");
    const op2 = r1.insert(op1.id, "i");

    r2.apply(op1);
    r2.apply(op2);

    const del = r2.delete(op1.id);

    r1.apply(del);

    expect(r1.document().getText()).toBe("i");
    expect(r2.document().getText()).toBe("i");
  });

  it("empty replica starts with empty document", () => {
    const r = new RgaReplica(0);
    expect(r.document().getText()).toBe("");
  });


  it("deleting the same id twice is idempotent", () => {
    const r = new RgaReplica(0);

    const op = r.insert(r.document().lastId(), "X");
    r.delete(op.id);

    expect(() => r.delete(op.id)).not.toThrow();
    expect(r.document().getText()).toBe("");
  });


  it("applying the same insert twice does not duplicate content", () => {
    const r1 = new RgaReplica(0);
    const r2 = r1.fork(1);

    const op = r1.insert(r1.document().lastId(), "X");

    r2.apply(op);
    r2.apply(op); // duplicate delivery

    expect(r2.document().getText()).toBe("X");
  });


  it("three replicas converge after mixed operations", () => {
    const r1 = new RgaReplica(0);
    const r2 = r1.fork(1);
    const r3 = r1.fork(2);

    const op1 = r1.insert(r1.document().lastId(), "A");
    const op2 = r2.insert(r2.document().lastId(), "B");
    const op3 = r3.insert(r3.document().lastId(), "C");

    // Shuffle delivery
    r1.apply(op2);
    r1.apply(op3);

    r2.apply(op1);
    r2.apply(op3);

    r3.apply(op1);
    r3.apply(op2);

    expect(r1.document().getText()).toBe(r2.document().getText());
    expect(r2.document().getText()).toBe(r3.document().getText());
  });


  it("insert after a deleted element still works", () => {
    const r = new RgaReplica(0);

    const h = r.insert(r.document().lastId(), "H");
    const i = r.insert(h.id, "i");

    r.delete(h.id);

    const ex = r.insert(h.id, "!");

    expect(r.document().getText()).toBe("i!");
  });


  it("forked replica preserves tombstones", () => {
    const r1 = new RgaReplica(0);

    const op = r1.insert(r1.document().lastId(), "X");
    r1.delete(op.id);

    const r2 = r1.fork(1);

    expect(r1.document().getText()).toBe("");
    expect(r2.document().getText()).toBe("");
  });

  it("concurrent inserts at same position with delete", () => {
    const r1 = new RgaReplica(0);
    const r2 = r1.fork(1);

    const a = r1.insert(r1.document().lastId(), "A");
    r2.apply(a);

    const b1 = r1.insert(a.id, "B");
    const c2 = r2.insert(a.id, "C");

    r1.apply(c2);
    r2.apply(b1);

    // delete one of the concurrently inserted characters
    const del = r1.delete(b1.id);
    r2.apply(del);

    expect(r1.document().getText()).toBe(r2.document().getText());
  });

  it("interleaved deletes and inserts converge", () => {
    const r1 = new RgaReplica(0);
    const r2 = r1.fork(1);

    const a = r1.insert(r1.document().lastId(), "A");
    const b = r1.insert(a.id, "B");
    const c = r1.insert(b.id, "C");

    r2.apply(a);
    r2.apply(b);
    r2.apply(c);

    const delB = r1.delete(b.id);
    const x = r2.insert(a.id, "X");

    r1.apply(x);
    r2.apply(delB);

    expect(r1.document().getText()).toBe(r2.document().getText());
  });


  it("concurrent updates to same character converge", () => {
    const r1 = new RgaReplica(0);
    const r2 = r1.fork(1);

    const a = r1.insert(r1.document().lastId(), "A");
    r2.apply(a);

    // r1 updates A -> B
    const delA1 = r1.delete(a.id);
    const b = r1.insert(r1.document().lastId(), "B");

    // r2 updates A -> C
    const delA2 = r2.delete(a.id);
    const c = r2.insert(r2.document().lastId(), "C");

    r1.apply(delA2);
    r1.apply(c);

    r2.apply(delA1);
    r2.apply(b);

    expect(r1.document().getText()).toBe(r2.document().getText());
  });

  it("delete parent while concurrent child insert", () => {
    const r1 = new RgaReplica(0);
    const r2 = r1.fork(1);

    const a = r1.insert(r1.document().lastId(), "A");
    r2.apply(a);

    const b = r2.insert(a.id, "B");
    const delA = r1.delete(a.id);

    r1.apply(b);
    r2.apply(delA);

    expect(r1.document().getText()).toBe(r2.document().getText());
  });

  it("multiple mixed operations converge", () => {
    const r1 = new RgaReplica(0);
    const r2 = r1.fork(1);

    const h = r1.insert(r1.document().lastId(), "H");
    const e = r1.insert(h.id, "e");

    r2.apply(h);
    r2.apply(e);

    const l1 = r2.insert(e.id, "l");
    const delE = r1.delete(e.id);
    const a = r1.insert(h.id, "a");

    r1.apply(l1);
    r2.apply(delE);
    r2.apply(a);

    expect(r1.document().getText()).toBe(r2.document().getText());
  });

  it("insert after deleted element converges", () => {
    const r1 = new RgaReplica(0);
    const r2 = r1.fork(1);

    const a = r1.insert(r1.document().lastId(), "A");
    r2.apply(a);

    const delA = r1.delete(a.id);
    const b = r2.insert(a.id, "B");

    r1.apply(b);
    r2.apply(delA);

    expect(r1.document().getText()).toBe(r2.document().getText());
  });

});
