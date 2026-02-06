import { Identifier } from "./identifier.mjs";

export type Operation = InsertOp | DeleteOp;

export class InsertOp {
  readonly type = "insert" as const;

  constructor(
    public readonly id: Identifier,
    public readonly prevId: Identifier,
    public readonly value: string // single char
  ) {}
}

export class DeleteOp {
  readonly type = "delete" as const;

  constructor(
    public readonly targetId: Identifier
  ) {}
}
