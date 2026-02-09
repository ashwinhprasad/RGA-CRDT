import { describe, it, expect, beforeEach } from 'vitest';
import {
  ParagraphBlock,
  HeadingBlock,
  ListBlock,
  ListItem,
  TableBlock,
  TableRow,
  TableColumn,
  TableCell,
  TableCellStore,
  type CRDTOp
} from '../src/block.mjs';
import { RGAElement, type CRDTId } from '../src/rga.mjs';

describe('ParagraphBlock', () => {
  let block: ParagraphBlock;

  beforeEach(() => {
    block = new ParagraphBlock();
  });

  it('should create a paragraph block with correct type', () => {
    expect(block.type).toBe('paragraph');
  });

  it('should insert characters', () => {
    block.insertChar('HEAD', 'H', [1, 1]);
    block.insertChar([1, 1], 'i', [1, 2]);
    
    expect(block.toString()).toBe('Hi');
  });

  it('should delete characters', () => {
    block.insertChar('HEAD', 'H', [1, 1]);
    block.insertChar([1, 1], 'i', [1, 2]);
    
    block.deleteChar([1, 1]);
    
    expect(block.toString()).toBe('i');
  });

  it('should apply insert_char operations', () => {
    const op: CRDTOp = {
      kind: 'insert_char',
      blockId: [1, 1],
      id: [1, 2],
      after: 'HEAD',
      char: 'A'
    };
    
    block.apply(op);
    
    expect(block.toString()).toBe('A');
  });

  it('should apply delete_char operations', () => {
    block.insertChar('HEAD', 'X', [1, 1]);
    
    const op: CRDTOp = {
      kind: 'delete_char',
      blockId: [1, 1],
      id: [1, 1]
    };
    
    block.apply(op);
    
    expect(block.toString()).toBe('');
  });

  it('should serialize to JSON', () => {
    block.insertChar('HEAD', 'T', [1, 1]);
    block.insertChar([1, 1], 'e', [1, 2]);
    block.insertChar([1, 2], 's', [1, 3]);
    block.insertChar([1, 3], 't', [1, 4]);
    
    const json = block.toJSON();
    
    expect(json.type).toBe('paragraph');
    expect(json.text).toBe('Test');
    expect(json.content).toBeDefined();
  });

  it('should handle empty paragraph', () => {
    expect(block.toString()).toBe('');
    
    const json = block.toJSON();
    expect(json.text).toBe('');
  });

  it('should handle toJson alias', () => {
    block.insertChar('HEAD', 'A', [1, 1]);
    
    const json1 = block.toJSON();
    const json2 = block.toJSON();
    
    expect(json1).toEqual(json2);
  });
});

describe('HeadingBlock', () => {
  it('should create heading with level', () => {
    const h1 = new HeadingBlock(1);
    const h3 = new HeadingBlock(3);
    const h6 = new HeadingBlock(6);
    
    expect(h1.level).toBe(1);
    expect(h3.level).toBe(3);
    expect(h6.level).toBe(6);
    expect(h1.type).toBe('heading');
  });

  it('should insert and display text', () => {
    const heading = new HeadingBlock(2);
    
    heading.insertChar('HEAD', 'T', [1, 1]);
    heading.insertChar([1, 1], 'i', [1, 2]);
    heading.insertChar([1, 2], 't', [1, 3]);
    heading.insertChar([1, 3], 'l', [1, 4]);
    heading.insertChar([1, 4], 'e', [1, 5]);
    
    expect(heading.toString()).toBe('Title');
  });

  it('should serialize with level', () => {
    const heading = new HeadingBlock(4);
    heading.insertChar('HEAD', 'H', [1, 1]);
    heading.insertChar([1, 1], '4', [1, 2]);
    
    const json = heading.toJSON();
    
    expect(json.type).toBe('heading');
    expect(json.level).toBe(4);
    expect(json.text).toBe('H4');
  });

  it('should inherit text editing capabilities', () => {
    const heading = new HeadingBlock(1);
    
    const insertOp: CRDTOp = {
      kind: 'insert_char',
      blockId: [1, 1],
      id: [1, 2],
      after: 'HEAD',
      char: 'X'
    };
    
    heading.apply(insertOp);
    expect(heading.toString()).toBe('X');
    
    const deleteOp: CRDTOp = {
      kind: 'delete_char',
      blockId: [1, 1],
      id: [1, 2]
    };
    
    heading.apply(deleteOp);
    expect(heading.toString()).toBe('');
  });
});

describe('ListItem', () => {
  let item: ListItem;

  beforeEach(() => {
    item = new ListItem();
  });

  it('should create empty list item', () => {
    expect(item.content.visible()).toEqual([]);
  });

  it('should add text to list item', () => {
    item.content.insertRGAElement(new RGAElement([1, 1], 'T', 'HEAD'));
    item.content.insertRGAElement(new RGAElement([1, 2], 'e', [1, 1]));
    item.content.insertRGAElement(new RGAElement([1, 3], 'x', [1, 2]));
    item.content.insertRGAElement(new RGAElement([1, 4], 't', [1, 3]));
    
    expect(item.content.visible().join('')).toBe('Text');
  });

  it('should serialize to JSON', () => {
    item.content.insertRGAElement(new RGAElement([1, 1], 'A', 'HEAD'));
    
    const json = item.toJSON();
    
    expect(json.text).toBe('A');
    expect(json.content).toBeDefined();
  });

  it('should handle toJson alias', () => {
    const json1 = item.toJSON();
    const json2 = item.toJSON();
    
    expect(json1).toEqual(json2);
  });
});

describe('ListBlock', () => {
  let bulletList: ListBlock;
  let orderedList: ListBlock;

  beforeEach(() => {
    bulletList = new ListBlock('bullet');
    orderedList = new ListBlock('ordered');
  });

  it('should create list with correct style', () => {
    expect(bulletList.type).toBe('list');
    expect(bulletList.style).toBe('bullet');
    expect(orderedList.style).toBe('ordered');
  });

  it('should insert list items', () => {
    const item1 = new ListItem();
    const item2 = new ListItem();
    
    bulletList.insertItem('HEAD', item1, [1, 1]);
    bulletList.insertItem([1, 1], item2, [1, 2]);
    
    expect(bulletList.items.visible()).toHaveLength(2);
  });

  it('should delete list items', () => {
    const item = new ListItem();
    bulletList.insertItem('HEAD', item, [1, 1]);
    
    bulletList.deleteItem([1, 1]);
    
    expect(bulletList.items.visible()).toHaveLength(0);
  });

  it('should apply insert_list_item operation', () => {
    const op: CRDTOp = {
      kind: 'insert_list_item',
      blockId: [1, 1],
      id: [1, 2],
      after: 'HEAD',
      item: new ListItem()
    };
    
    bulletList.apply(op);
    
    expect(bulletList.items.visible()).toHaveLength(1);
  });

  it('should apply delete_list_item operation', () => {
    const item = new ListItem();
    bulletList.insertItem('HEAD', item, [1, 1]);
    
    const op: CRDTOp = {
      kind: 'delete_list_item',
      blockId: [1, 1],
      id: [1, 1]
    };
    
    bulletList.apply(op);
    
    expect(bulletList.items.visible()).toHaveLength(0);
  });

  it('should apply insert_list_char operation', () => {
    const item = new ListItem();
    bulletList.insertItem('HEAD', item, [1, 1]);
    
    const op: CRDTOp = {
      kind: 'insert_list_char',
      blockId: [1, 1],
      itemId: [1, 1],
      id: [1, 2],
      after: 'HEAD',
      char: 'X'
    };
    
    bulletList.apply(op);
    
    const itemEl = bulletList.items.getElement([1, 1]);
    expect(itemEl?.value.content.visible().join('')).toBe('X');
  });

  it('should apply delete_list_char operation', () => {
    const item = new ListItem();
    item.content.insertRGAElement(new RGAElement([1, 2], 'A', 'HEAD'));
    bulletList.insertItem('HEAD', item, [1, 1]);
    
    const op: CRDTOp = {
      kind: 'delete_list_char',
      blockId: [1, 1],
      itemId: [1, 1],
      id: [1, 2]
    };
    
    bulletList.apply(op);
    
    const itemEl = bulletList.items.getElement([1, 1]);
    expect(itemEl?.value.content.visible().join('')).toBe('');
  });

  it('should handle operations on deleted items gracefully', () => {
    const item = new ListItem();
    bulletList.insertItem('HEAD', item, [1, 1]);
    bulletList.deleteItem([1, 1]);
    
    const op: CRDTOp = {
      kind: 'insert_list_char',
      blockId: [1, 1],
      itemId: [1, 1],
      id: [1, 2],
      after: 'HEAD',
      char: 'X'
    };
    
    bulletList.apply(op);
    
    expect(bulletList.items.visible()).toHaveLength(0);
  });

  it('should generate text representation', () => {
    const item1 = new ListItem();
    item1.content.insertRGAElement(new RGAElement([1, 2], 'F', 'HEAD'));
    item1.content.insertRGAElement(new RGAElement([1, 3], 'i', [1, 2]));
    item1.content.insertRGAElement(new RGAElement([1, 4], 'r', [1, 3]));
    item1.content.insertRGAElement(new RGAElement([1, 5], 's', [1, 4]));
    item1.content.insertRGAElement(new RGAElement([1, 6], 't', [1, 5]));
    
    const item2 = new ListItem();
    item2.content.insertRGAElement(new RGAElement([1, 7], 'S', 'HEAD'));
    item2.content.insertRGAElement(new RGAElement([1, 8], 'e', [1, 7]));
    item2.content.insertRGAElement(new RGAElement([1, 9], 'c', [1, 8]));
    item2.content.insertRGAElement(new RGAElement([1, 10], 'o', [1, 9]));
    item2.content.insertRGAElement(new RGAElement([1, 11], 'n', [1, 10]));
    item2.content.insertRGAElement(new RGAElement([1, 12], 'd', [1, 11]));
    
    bulletList.insertItem('HEAD', item1, [1, 1]);
    bulletList.insertItem([1, 1], item2, [1, 13]);
    
    const text = bulletList.toString();
    expect(text).toBe('First\nSecond');
  });

  it('should serialize to JSON', () => {
    const item = new ListItem();
    bulletList.insertItem('HEAD', item, [1, 1]);
    
    const json = bulletList.toJSON();
    
    expect(json.type).toBe('list');
    expect(json.style).toBe('bullet');
    expect(json.items).toBeDefined();
  });
});

describe('TableRow and TableColumn', () => {
  it('should create table row', () => {
    const row = new TableRow();
    const json = row.toJSON();
    
    expect(json.type).toBe('row');
  });

  it('should create table column', () => {
    const col = new TableColumn();
    const json = col.toJSON();
    
    expect(json.type).toBe('column');
  });

  it('should support toJson alias', () => {
    const row = new TableRow();
    const col = new TableColumn();
    
    expect(row.toJSON()).toEqual(row.toJSON());
    expect(col.toJSON()).toEqual(col.toJSON());
  });
});

describe('TableCell', () => {
  let cell: TableCell;

  beforeEach(() => {
    cell = new TableCell();
  });

  it('should create empty cell', () => {
    expect(cell.content.visible()).toEqual([]);
  });

  it('should add text to cell', () => {
    cell.content.insertRGAElement(new RGAElement([1, 1], 'D', 'HEAD'));
    cell.content.insertRGAElement(new RGAElement([1, 2], 'a', [1, 1]));
    cell.content.insertRGAElement(new RGAElement([1, 3], 't', [1, 2]));
    cell.content.insertRGAElement(new RGAElement([1, 4], 'a', [1, 3]));
    
    expect(cell.content.visible().join('')).toBe('Data');
  });

  it('should serialize to JSON', () => {
    cell.content.insertRGAElement(new RGAElement([1, 1], 'X', 'HEAD'));
    
    const json = cell.toJSON();
    
    expect(json.text).toBe('X');
    expect(json.content).toBeDefined();
  });

  it('should handle toJson alias', () => {
    const json1 = cell.toJSON();
    const json2 = cell.toJSON();
    
    expect(json1).toEqual(json2);
  });
});

describe('TableCellStore', () => {
  let store: TableCellStore;

  beforeEach(() => {
    store = new TableCellStore();
  });

  it('should create empty store', () => {
    expect(store.cells.size).toBe(0);
  });

  it('should get undefined for non-existent cell', () => {
    const cell = store.getCell([1, 1], [1, 2]);
    expect(cell).toBeUndefined();
  });

  it('should ensure cell exists', () => {
    const cell = store.ensureCell([1, 1], [1, 2]);
    
    expect(cell).toBeInstanceOf(TableCell);
    expect(store.cells.size).toBe(1);
  });

  it('should return existing cell on ensureCell', () => {
    const cell1 = store.ensureCell([1, 1], [1, 2]);
    cell1.content.insertRGAElement(new RGAElement([1, 3], 'X', 'HEAD'));
    
    const cell2 = store.ensureCell([1, 1], [1, 2]);
    
    expect(cell1).toBe(cell2);
    expect(cell2.content.visible().join('')).toBe('X');
  });

  it('should handle multiple cells', () => {
    store.ensureCell([1, 1], [1, 2]);
    store.ensureCell([1, 1], [1, 3]);
    store.ensureCell([1, 2], [1, 2]);
    
    expect(store.cells.size).toBe(3);
  });

  it('should serialize to JSON', () => {
    const cell = store.ensureCell([1, 1], [1, 2]);
    cell.content.insertRGAElement(new RGAElement([1, 3], 'A', 'HEAD'));
    
    const json = store.toJSON();
    
    expect(typeof json).toBe('object');
    expect(Object.keys(json).length).toBe(1);
  });

  it('should handle toJson alias', () => {
    const json1 = store.toJSON();
    const json2 = store.toJSON();
    
    expect(json1).toEqual(json2);
  });
});

describe('TableBlock', () => {
  let table: TableBlock;

  beforeEach(() => {
    table = new TableBlock();
  });

  it('should create empty table', () => {
    expect(table.type).toBe('table');
    expect(table.rows.visible()).toEqual([]);
    expect(table.columns.visible()).toEqual([]);
  });

  it('should insert rows', () => {
    const row1 = new TableRow();
    const row2 = new TableRow();
    
    table.insertRow('HEAD', row1, [1, 1]);
    table.insertRow([1, 1], row2, [1, 2]);
    
    expect(table.rows.visible()).toHaveLength(2);
  });

  it('should insert columns', () => {
    const col1 = new TableColumn();
    const col2 = new TableColumn();
    
    table.insertColumn('HEAD', col1, [1, 1]);
    table.insertColumn([1, 1], col2, [1, 2]);
    
    expect(table.columns.visible()).toHaveLength(2);
  });

  it('should delete rows', () => {
    const row = new TableRow();
    table.insertRow('HEAD', row, [1, 1]);
    
    table.deleteRow([1, 1]);
    
    expect(table.rows.visible()).toHaveLength(0);
  });

  it('should delete columns', () => {
    const col = new TableColumn();
    table.insertColumn('HEAD', col, [1, 1]);
    
    table.deleteColumn([1, 1]);
    
    expect(table.columns.visible()).toHaveLength(0);
  });

  it('should apply insert_row operation', () => {
    const op: CRDTOp = {
      kind: 'insert_row',
      blockId: [1, 1],
      id: [1, 2],
      after: 'HEAD',
      row: new TableRow()
    };
    
    table.apply(op);
    
    expect(table.rows.visible()).toHaveLength(1);
  });

  it('should apply delete_row operation', () => {
    table.insertRow('HEAD', new TableRow(), [1, 1]);
    
    const op: CRDTOp = {
      kind: 'delete_row',
      blockId: [1, 1],
      id: [1, 1]
    };
    
    table.apply(op);
    
    expect(table.rows.visible()).toHaveLength(0);
  });

  it('should apply insert_column operation', () => {
    const op: CRDTOp = {
      kind: 'insert_column',
      blockId: [1, 1],
      id: [1, 2],
      after: 'HEAD',
      column: new TableColumn()
    };
    
    table.apply(op);
    
    expect(table.columns.visible()).toHaveLength(1);
  });

  it('should apply delete_column operation', () => {
    table.insertColumn('HEAD', new TableColumn(), [1, 1]);
    
    const op: CRDTOp = {
      kind: 'delete_column',
      blockId: [1, 1],
      id: [1, 1]
    };
    
    table.apply(op);
    
    expect(table.columns.visible()).toHaveLength(0);
  });

  it('should apply insert_cell_char operation', () => {
    table.insertRow('HEAD', new TableRow(), [1, 1]);
    table.insertColumn('HEAD', new TableColumn(), [1, 2]);
    
    const op: CRDTOp = {
      kind: 'insert_cell_char',
      blockId: [1, 1],
      rowId: [1, 1],
      columnId: [1, 2],
      id: [1, 3],
      after: 'HEAD',
      char: 'X'
    };
    
    table.apply(op);
    
    const cell = table.cells.getCell([1, 1], [1, 2]);
    expect(cell?.content.visible().join('')).toBe('X');
  });

  it('should apply delete_cell_char operation', () => {
    table.insertRow('HEAD', new TableRow(), [1, 1]);
    table.insertColumn('HEAD', new TableColumn(), [1, 2]);
    
    const cell = table.cells.ensureCell([1, 1], [1, 2]);
    cell.content.insertRGAElement(new RGAElement([1, 3], 'A', 'HEAD'));
    
    const op: CRDTOp = {
      kind: 'delete_cell_char',
      blockId: [1, 1],
      rowId: [1, 1],
      columnId: [1, 2],
      id: [1, 3]
    };
    
    table.apply(op);
    
    const updatedCell = table.cells.getCell([1, 1], [1, 2]);
    expect(updatedCell?.content.visible().join('')).toBe('');
  });

  it('should handle cell operations on deleted rows/columns gracefully', () => {
    table.insertRow('HEAD', new TableRow(), [1, 1]);
    table.insertColumn('HEAD', new TableColumn(), [1, 2]);
    table.deleteRow([1, 1]);
    
    const op: CRDTOp = {
      kind: 'insert_cell_char',
      blockId: [1, 1],
      rowId: [1, 1],
      columnId: [1, 2],
      id: [1, 3],
      after: 'HEAD',
      char: 'X'
    };
    
    table.apply(op);
    
    const cell = table.cells.getCell([1, 1], [1, 2]);
    expect(cell).toBeUndefined();
  });

  it('should handle delete_cell_char on non-existent cell', () => {
    const op: CRDTOp = {
      kind: 'delete_cell_char',
      blockId: [1, 1],
      rowId: [1, 1],
      columnId: [1, 2],
      id: [1, 3]
    };
    
    expect(() => table.apply(op)).not.toThrow();
  });

  it('should serialize to JSON', () => {
    table.insertRow('HEAD', new TableRow(), [1, 1]);
    table.insertColumn('HEAD', new TableColumn(), [1, 2]);
    
    const json = table.toJSON();
    
    expect(json.type).toBe('table');
    expect(json.rows).toBeDefined();
    expect(json.columns).toBeDefined();
    expect(json.cells).toBeDefined();
  });

  it('should maintain cell data across serialization', () => {
    table.insertRow('HEAD', new TableRow(), [1, 1]);
    table.insertColumn('HEAD', new TableColumn(), [1, 2]);
    
    const cell = table.cells.ensureCell([1, 1], [1, 2]);
    cell.content.insertRGAElement(new RGAElement([1, 3], 'T', 'HEAD'));
    cell.content.insertRGAElement(new RGAElement([1, 4], 'e', [1, 3]));
    cell.content.insertRGAElement(new RGAElement([1, 5], 's', [1, 4]));
    cell.content.insertRGAElement(new RGAElement([1, 6], 't', [1, 5]));
    
    const json = table.toJSON();
    
    expect(json.cells).toBeTruthy();
  });
});

describe('Block Type Discrimination', () => {
  it('should identify paragraph blocks', () => {
    const para = new ParagraphBlock();
    expect(para instanceof ParagraphBlock).toBe(true);
    expect(para.type).toBe('paragraph');
  });

  it('should identify heading blocks', () => {
    const heading = new HeadingBlock(1);
    expect(heading instanceof HeadingBlock).toBe(true);
    expect(heading.type).toBe('heading');
  });

  it('should identify list blocks', () => {
    const list = new ListBlock('bullet');
    expect(list instanceof ListBlock).toBe(true);
    expect(list.type).toBe('list');
  });

  it('should identify table blocks', () => {
    const table = new TableBlock();
    expect(table instanceof TableBlock).toBe(true);
    expect(table.type).toBe('table');
  });
});
