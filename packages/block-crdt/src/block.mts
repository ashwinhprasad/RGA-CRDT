import { CRDTId, RGA, RGAElement } from "./rga.mjs";


export type BlockType = "paragraph" 
| "heading" 
// | "list" 
// | "table";

export type CRDTOp =
  | {
      kind: "insert_block";
      id: CRDTId;
      after: CRDTId;
      block: Block;
    }
  | {
      kind: "delete_block";
      id: CRDTId;
    }
  | {
      kind: "insert_char";
      blockId: CRDTId;
      id: CRDTId;
      after: CRDTId;
      char: string;
    }
  | {
      kind: "delete_char";
      blockId: CRDTId;
      id: CRDTId;
    };

export abstract class Block {
  constructor(
    public type: BlockType
  ) {}
}


export class HeadingBlock extends Block {
  constructor(
    public level: number,
    public content: RGA<string>
  ) {
    super("heading");
  }
}


export class ParagraphBlock extends Block {
  constructor(
    /**
     * String represents a character in the paragraph. Not an actual string.
     * Am using string type since typescript doesn't have a built-in char type.
     */
    public content: RGA<string> 
  ) {
    super("paragraph");
  }

  insertChar(
    after: CRDTId,
    char: string,
    id: CRDTId
  ) {
    this.content.insertRGAElement(
      new RGAElement(id, char, after)
    );
  }

  deleteChar(id: CRDTId) {
    this.content.delete(id);
  }

  apply(op: CRDTOp) {
    if (op.kind === "insert_char") {
      this.content.insertRGAElement(
        new RGAElement(op.id, op.char, op.after)
      );
    }

    if (op.kind === "delete_char") {
      this.content.delete(op.id);
    }
  }

  toString(): string {
    return this.content.visible().join("");
  }
}

// export class ListItem {
//   constructor(
//     public content: RGA<string>
//   ) {}
// }

// export type ListStyle = "bullet" | "ordered";

// export class ListBlock extends Block {
//   constructor(
//     public style: ListStyle,
//     public items: RGA<ListItem>
//   ) {
//     super("list");
//   }
// }

// export class TableRow {}
// export class TableColumn {}

// export type CellKey = `${string}:${string}`;

// function cellKey(rowId: CRDTId, colId: CRDTId): CellKey {
//   return `${JSON.stringify(rowId)}:${JSON.stringify(colId)}`;
// }

// export class TableCell {
//   constructor(
//     public content: RGA<string>
//   ) {}
// }

// export class TableCellStore {
//   constructor(
//     public cells: Map<CellKey, TableCell> = new Map()
//   ) {}
// }


// export class TableBlock extends Block {
//   constructor(
//     public rows: RGA<TableRow>,
//     public columns: RGA<TableColumn>,
//     public cells: TableCellStore
//   ) {
//     super("table");
//   }
// }
