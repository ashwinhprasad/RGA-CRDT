import { describe, it, expect, beforeEach } from 'vitest';
import { CRDTDocument } from '../src/crdtDocument.mjs';
import { ParagraphBlock, HeadingBlock, ListBlock, TableBlock } from '../src/block.mjs';
import type { CRDTId } from '../src/rga.mjs';

describe('CRDTDocument - Basic Operations', () => {
  let doc: CRDTDocument;

  beforeEach(() => {
    doc = new CRDTDocument(1);
  });

  it('should create a document with correct replica ID', () => {
    expect(doc.replicaId).toBe(1);
    expect(doc.blockCount()).toBe(0);
  });

  it('should fork a document with new replica ID', () => {
    doc.insertParagraphBlock();
    const forked = doc.fork(2);
    
    expect(forked.replicaId).toBe(2);
    expect(forked.blockCount()).toBe(doc.blockCount());
  });

  it('should serialize to JSON', () => {
    const json = doc.toJSON();
    expect(json).toHaveProperty('type', 'document');
    expect(json).toHaveProperty('replicaId', 1);
    expect(json).toHaveProperty('clock');
    expect(json).toHaveProperty('blocks');
  });
});

describe('CRDTDocument - Paragraph Block', () => {
  let doc: CRDTDocument;

  beforeEach(() => {
    doc = new CRDTDocument(1);
  });

  it('should insert a paragraph block', () => {
    const op = doc.insertParagraphBlock();
    
    expect(op.kind).toBe('insert_block');
    expect(doc.blockCount()).toBe(1);
    
    const block = doc.getBlock(op.id);
    expect(block).toBeInstanceOf(ParagraphBlock);
  });

  it('should insert text into a paragraph', () => {
    const blockOp = doc.insertParagraphBlock();
    const blockId = blockOp.id;
    
    const textOps = doc.insertText(blockId, 'Hello, World!');
    
    expect(textOps).toHaveLength(13);
    expect(doc.getParagraphText(blockId)).toBe('Hello, World!');
  });

  it('should insert text at specific position', () => {
    const blockOp = doc.insertParagraphBlock();
    const blockId = blockOp.id;
    
    const ops1 = doc.insertText(blockId, 'Hello');
    const ops2 = doc.insertText(blockId, ' World', ops1[ops1.length - 1].id);
    
    expect(doc.getParagraphText(blockId)).toBe('Hello World');
  });

  it('should delete characters from paragraph', () => {
    const blockOp = doc.insertParagraphBlock();
    const blockId = blockOp.id;
    
    const textOps = doc.insertText(blockId, 'Hello');
    const lastCharId = textOps[textOps.length - 1].id;
    
    doc.deleteChar(blockId, lastCharId);
    
    expect(doc.getParagraphText(blockId)).toBe('Hell');
  });

  it('should handle empty paragraph', () => {
    const blockOp = doc.insertParagraphBlock();
    const text = doc.getParagraphText(blockOp.id);
    
    expect(text).toBe('');
  });

  it('should delete a paragraph block', () => {
    const blockOp = doc.insertParagraphBlock();
    doc.insertText(blockOp.id, 'Test');
    
    doc.deleteBlock(blockOp.id);
    
    expect(doc.blockCount()).toBe(0);
    expect(doc.getBlock(blockOp.id)).toBeUndefined();
  });
});

describe('CRDTDocument - Heading Block', () => {
  let doc: CRDTDocument;

  beforeEach(() => {
    doc = new CRDTDocument(1);
  });

  it('should insert heading blocks with different levels', () => {
    const h1Op = doc.insertHeadingBlock(1);
    const h2Op = doc.insertHeadingBlock(2, h1Op.id);
    const h6Op = doc.insertHeadingBlock(6, h2Op.id);
    
    expect(doc.blockCount()).toBe(3);
    
    const h1 = doc.getBlock(h1Op.id) as HeadingBlock;
    const h2 = doc.getBlock(h2Op.id) as HeadingBlock;
    const h6 = doc.getBlock(h6Op.id) as HeadingBlock;
    
    expect(h1.level).toBe(1);
    expect(h2.level).toBe(2);
    expect(h6.level).toBe(6);
  });

  it('should throw error for invalid heading level', () => {
    expect(() => doc.insertHeadingBlock(0)).toThrow('Heading level must be between 1 and 6');
    expect(() => doc.insertHeadingBlock(7)).toThrow('Heading level must be between 1 and 6');
  });

  it('should insert text into heading', () => {
    const headingOp = doc.insertHeadingBlock(1);
    doc.insertText(headingOp.id, 'Chapter 1: Introduction');
    
    expect(doc.getParagraphText(headingOp.id)).toBe('Chapter 1: Introduction');
  });

  it('should serialize heading with level', () => {
    const headingOp = doc.insertHeadingBlock(3);
    doc.insertText(headingOp.id, 'Subheading');
    
    const heading = doc.getBlock(headingOp.id) as HeadingBlock;
    const json = heading.toJSON();
    
    expect(json.type).toBe('heading');
    expect(json.level).toBe(3);
    expect(json.text).toBe('Subheading');
  });
});

describe('CRDTDocument - List Block', () => {
  let doc: CRDTDocument;

  beforeEach(() => {
    doc = new CRDTDocument(1);
  });

  it('should create bullet list', () => {
    const listOp = doc.insertListBlock('bullet');
    const list = doc.getBlock(listOp.id) as ListBlock;
    
    expect(list).toBeInstanceOf(ListBlock);
    expect(list.style).toBe('bullet');
  });

  it('should create ordered list', () => {
    const listOp = doc.insertListBlock('ordered');
    const list = doc.getBlock(listOp.id) as ListBlock;
    
    expect(list.style).toBe('ordered');
  });

  it('should add items to list', () => {
    const listOp = doc.insertListBlock('bullet');
    const listId = listOp.id;
    
    const item1Op = doc.insertListItem(listId);
    const item2Op = doc.insertListItem(listId, item1Op.id);
    const item3Op = doc.insertListItem(listId, item2Op.id);
    
    const list = doc.getBlock(listId) as ListBlock;
    expect(list.items.visible()).toHaveLength(3);
  });

  it('should insert text into list items', () => {
    const listOp = doc.insertListBlock('bullet');
    const listId = listOp.id;
    
    const item1Op = doc.insertListItem(listId);
    const item2Op = doc.insertListItem(listId, item1Op.id);
    
    doc.insertListItemText(listId, item1Op.id, 'First item');
    doc.insertListItemText(listId, item2Op.id, 'Second item');
    
    expect(doc.getListItemText(listId, item1Op.id)).toBe('First item');
    expect(doc.getListItemText(listId, item2Op.id)).toBe('Second item');
  });

  it('should delete list items', () => {
    const listOp = doc.insertListBlock('bullet');
    const listId = listOp.id;
    
    const item1Op = doc.insertListItem(listId);
    const item2Op = doc.insertListItem(listId, item1Op.id);
    doc.insertListItemText(listId, item1Op.id, 'Item 1');
    doc.insertListItemText(listId, item2Op.id, 'Item 2');
    
    doc.deleteListItem(listId, item1Op.id);
    
    const list = doc.getBlock(listId) as ListBlock;
    expect(list.items.visible()).toHaveLength(1);
    expect(doc.getListItemText(listId, item2Op.id)).toBe('Item 2');
  });

  it('should delete characters from list items', () => {
    const listOp = doc.insertListBlock('bullet');
    const listId = listOp.id;
    const itemOp = doc.insertListItem(listId);
    
    const textOps = doc.insertListItemText(listId, itemOp.id, 'Hello');
    const lastCharId = textOps[textOps.length - 1].id;
    
    doc.deleteListItemChar(listId, itemOp.id, lastCharId);
    
    expect(doc.getListItemText(listId, itemOp.id)).toBe('Hell');
  });

  it('should handle empty list', () => {
    const listOp = doc.insertListBlock('bullet');
    const list = doc.getBlock(listOp.id) as ListBlock;
    
    expect(list.items.visible()).toHaveLength(0);
  });

  it('should serialize list with items', () => {
    const listOp = doc.insertListBlock('ordered');
    const listId = listOp.id;
    
    const item1Op = doc.insertListItem(listId);
    doc.insertListItemText(listId, item1Op.id, 'Step one');
    
    const list = doc.getBlock(listId) as ListBlock;
    const json = list.toJSON();
    
    expect(json.type).toBe('list');
    expect(json.style).toBe('ordered');
    expect(json.text).toContain('Step one');
  });
});

describe('CRDTDocument - Table Block', () => {
  let doc: CRDTDocument;

  beforeEach(() => {
    doc = new CRDTDocument(1);
  });

  it('should create an empty table', () => {
    const tableOp = doc.insertTableBlock();
    const table = doc.getBlock(tableOp.id);
    
    expect(table).toBeInstanceOf(TableBlock);
    expect(doc.getTableDimensions(tableOp.id)).toEqual({ rows: 0, columns: 0 });
  });

  it('should insert rows', () => {
    const tableOp = doc.insertTableBlock();
    const tableId = tableOp.id;
    
    const row1Op = doc.insertTableRow(tableId);
    const row2Op = doc.insertTableRow(tableId, row1Op.id);
    const row3Op = doc.insertTableRow(tableId, row2Op.id);
    
    expect(doc.getTableDimensions(tableId).rows).toBe(3);
  });

  it('should insert columns', () => {
    const tableOp = doc.insertTableBlock();
    const tableId = tableOp.id;
    
    const col1Op = doc.insertTableColumn(tableId);
    const col2Op = doc.insertTableColumn(tableId, col1Op.id);
    
    expect(doc.getTableDimensions(tableId).columns).toBe(2);
  });

  it('should create a 3x3 table', () => {
    const tableOp = doc.insertTableBlock();
    const tableId = tableOp.id;
    
    const row1Op = doc.insertTableRow(tableId);
    const row2Op = doc.insertTableRow(tableId, row1Op.id);
    const row3Op = doc.insertTableRow(tableId, row2Op.id);
    
    const col1Op = doc.insertTableColumn(tableId);
    const col2Op = doc.insertTableColumn(tableId, col1Op.id);
    const col3Op = doc.insertTableColumn(tableId, col2Op.id);
    
    const dimensions = doc.getTableDimensions(tableId);
    expect(dimensions).toEqual({ rows: 3, columns: 3 });
  });

  it('should insert text into table cells', () => {
    const tableOp = doc.insertTableBlock();
    const tableId = tableOp.id;
    
    const rowOp = doc.insertTableRow(tableId);
    const colOp = doc.insertTableColumn(tableId);
    
    doc.insertTableCellText(tableId, rowOp.id, colOp.id, 'Cell content');
    
    expect(doc.getTableCellText(tableId, rowOp.id, colOp.id)).toBe('Cell content');
  });

  it('should fill multiple cells with text', () => {
    const tableOp = doc.insertTableBlock();
    const tableId = tableOp.id;
    
    const row1Op = doc.insertTableRow(tableId);
    const row2Op = doc.insertTableRow(tableId, row1Op.id);
    const col1Op = doc.insertTableColumn(tableId);
    const col2Op = doc.insertTableColumn(tableId, col1Op.id);
    
    doc.insertTableCellText(tableId, row1Op.id, col1Op.id, 'A1');
    doc.insertTableCellText(tableId, row1Op.id, col2Op.id, 'B1');
    doc.insertTableCellText(tableId, row2Op.id, col1Op.id, 'A2');
    doc.insertTableCellText(tableId, row2Op.id, col2Op.id, 'B2');
    
    expect(doc.getTableCellText(tableId, row1Op.id, col1Op.id)).toBe('A1');
    expect(doc.getTableCellText(tableId, row1Op.id, col2Op.id)).toBe('B1');
    expect(doc.getTableCellText(tableId, row2Op.id, col1Op.id)).toBe('A2');
    expect(doc.getTableCellText(tableId, row2Op.id, col2Op.id)).toBe('B2');
  });

  it('should delete rows', () => {
    const tableOp = doc.insertTableBlock();
    const tableId = tableOp.id;
    
    const row1Op = doc.insertTableRow(tableId);
    const row2Op = doc.insertTableRow(tableId, row1Op.id);
    const row3Op = doc.insertTableRow(tableId, row2Op.id);
    
    doc.deleteTableRow(tableId, row2Op.id);
    
    expect(doc.getTableDimensions(tableId).rows).toBe(2);
  });

  it('should delete columns', () => {
    const tableOp = doc.insertTableBlock();
    const tableId = tableOp.id;
    
    const col1Op = doc.insertTableColumn(tableId);
    const col2Op = doc.insertTableColumn(tableId, col1Op.id);
    
    doc.deleteTableColumn(tableId, col1Op.id);
    
    expect(doc.getTableDimensions(tableId).columns).toBe(1);
  });

  it('should delete characters from cells', () => {
    const tableOp = doc.insertTableBlock();
    const tableId = tableOp.id;
    
    const rowOp = doc.insertTableRow(tableId);
    const colOp = doc.insertTableColumn(tableId);
    
    const textOps = doc.insertTableCellText(tableId, rowOp.id, colOp.id, 'Hello');
    const lastCharId = textOps[textOps.length - 1].id;
    
    doc.deleteTableCellChar(tableId, rowOp.id, colOp.id, lastCharId);
    
    expect(doc.getTableCellText(tableId, rowOp.id, colOp.id)).toBe('Hell');
  });

  it('should handle empty cells', () => {
    const tableOp = doc.insertTableBlock();
    const tableId = tableOp.id;
    
    const rowOp = doc.insertTableRow(tableId);
    const colOp = doc.insertTableColumn(tableId);
    
    expect(doc.getTableCellText(tableId, rowOp.id, colOp.id)).toBe('');
  });

  it('should serialize table structure', () => {
    const tableOp = doc.insertTableBlock();
    const tableId = tableOp.id;
    
    doc.insertTableRow(tableId);
    doc.insertTableColumn(tableId);
    
    const table = doc.getBlock(tableId) as TableBlock;
    const json = table.toJSON();
    
    expect(json.type).toBe('table');
    expect(json).toHaveProperty('rows');
    expect(json).toHaveProperty('columns');
    expect(json).toHaveProperty('cells');
  });
});

describe('CRDTDocument - Multi-Block Operations', () => {
  let doc: CRDTDocument;

  beforeEach(() => {
    doc = new CRDTDocument(1);
  });

  it('should insert multiple blocks in sequence', () => {
    const h1Op = doc.insertHeadingBlock(1);
    const paraOp = doc.insertParagraphBlock(h1Op.id);
    const listOp = doc.insertListBlock('bullet', paraOp.id);
    const tableOp = doc.insertTableBlock(listOp.id);
    
    expect(doc.blockCount()).toBe(4);
  });

  it('should maintain block order', () => {
    const block1Op = doc.insertParagraphBlock();
    const block2Op = doc.insertParagraphBlock(block1Op.id);
    const block3Op = doc.insertParagraphBlock(block2Op.id);
    
    doc.insertText(block1Op.id, 'First');
    doc.insertText(block2Op.id, 'Second');
    doc.insertText(block3Op.id, 'Third');
    
    const blocks = doc.visibleBlocks();
    expect(blocks[0]).toBe(doc.getBlock(block1Op.id));
    expect(blocks[1]).toBe(doc.getBlock(block2Op.id));
    expect(blocks[2]).toBe(doc.getBlock(block3Op.id));
  });

  it('should get block by index', () => {
    const block1Op = doc.insertParagraphBlock();
    const block2Op = doc.insertParagraphBlock(block1Op.id);
    
    expect(doc.getBlockAt(0)).toBe(doc.getBlock(block1Op.id));
    expect(doc.getBlockAt(1)).toBe(doc.getBlock(block2Op.id));
    expect(doc.getBlockAt(2)).toBeUndefined();
  });

  it('should get block index', () => {
    const block1Op = doc.insertParagraphBlock();
    const block2Op = doc.insertParagraphBlock(block1Op.id);
    
    expect(doc.getBlockIndex(block1Op.id)).toBe(0);
    expect(doc.getBlockIndex(block2Op.id)).toBe(1);
  });

  it('should delete blocks in the middle', () => {
    const block1Op = doc.insertParagraphBlock();
    const block2Op = doc.insertParagraphBlock(block1Op.id);
    const block3Op = doc.insertParagraphBlock(block2Op.id);
    
    doc.deleteBlock(block2Op.id);
    
    expect(doc.blockCount()).toBe(2);
    expect(doc.getBlock(block1Op.id)).toBeDefined();
    expect(doc.getBlock(block2Op.id)).toBeUndefined();
    expect(doc.getBlock(block3Op.id)).toBeDefined();
  });
});

describe('CRDTDocument - Collaborative Editing', () => {
  let alice: CRDTDocument;
  let bob: CRDTDocument;

  beforeEach(() => {
    alice = new CRDTDocument(1);
    bob = alice.fork(2);
  });

  it('should sync block creation between replicas', () => {
    const op = alice.insertParagraphBlock();
    bob.apply(op);
    
    expect(alice.blockCount()).toBe(1);
    expect(bob.blockCount()).toBe(1);
  });

  it('should handle concurrent text insertion', () => {
    const blockOp = alice.insertParagraphBlock();
    bob.apply(blockOp);
    
    const aliceOps = alice.insertText(blockOp.id, 'Alice');
    const bobOps = bob.insertText(blockOp.id, 'Bob');
    
    aliceOps.forEach(op => bob.apply(op));
    bobOps.forEach(op => alice.apply(op));
    
    const aliceText = alice.getParagraphText(blockOp.id);
    const bobText = bob.getParagraphText(blockOp.id);
    
    expect(aliceText).toBe(bobText);
    expect(aliceText.length).toBeGreaterThan(0);
  });

  it('should handle concurrent block insertions', () => {
    const aliceOp = alice.insertParagraphBlock();
    const bobOp = bob.insertParagraphBlock();
    
    bob.apply(aliceOp);
    alice.apply(bobOp);
    
    expect(alice.blockCount()).toBe(2);
    expect(bob.blockCount()).toBe(2);
  });

  it('should handle concurrent list item additions', () => {
    const listOp = alice.insertListBlock('bullet');
    bob.apply(listOp);
    
    const aliceItemOp = alice.insertListItem(listOp.id);
    const bobItemOp = bob.insertListItem(listOp.id);
    
    bob.apply(aliceItemOp);
    alice.apply(bobItemOp);
    
    const aliceList = alice.getBlock(listOp.id) as ListBlock;
    const bobList = bob.getBlock(listOp.id) as ListBlock;
    
    expect(aliceList.items.visible().length).toBe(2);
    expect(bobList.items.visible().length).toBe(2);
  });

  it('should handle deletion conflicts', () => {
    const blockOp = alice.insertParagraphBlock();
    bob.apply(blockOp);
    
    const textOps = alice.insertText(blockOp.id, 'Hello');
    textOps.forEach(op => bob.apply(op));
    
    alice.deleteChar(blockOp.id, textOps[0].id);
    bob.deleteChar(blockOp.id, textOps[0].id);
    
    expect(alice.getParagraphText(blockOp.id)).toBe(bob.getParagraphText(blockOp.id));
  });

  it('should apply multiple operations in batch', () => {
    const ops = [
      alice.insertParagraphBlock(),
      alice.insertHeadingBlock(1),
      alice.insertListBlock('bullet')
    ];
    
    bob.applyMany(ops);
    
    expect(bob.blockCount()).toBe(3);
  });
});

describe('CRDTDocument - Edge Cases', () => {
  let doc: CRDTDocument;

  beforeEach(() => {
    doc = new CRDTDocument(1);
  });

  it('should handle operations on deleted blocks gracefully', () => {
    const blockOp = doc.insertParagraphBlock();
    doc.deleteBlock(blockOp.id);
    
    expect(() => {
      doc.insertText(blockOp.id, 'Test');
    }).toThrow();
  });

  it('should handle empty document operations', () => {
    expect(doc.blockCount()).toBe(0);
    expect(doc.visibleBlocks()).toEqual([]);
    expect(doc.getBlockAt(0)).toBeUndefined();
  });

  it('should handle unicode characters', () => {
    const blockOp = doc.insertParagraphBlock();
    doc.insertText(blockOp.id, '你好世界 🌍 café');
    
    expect(doc.getParagraphText(blockOp.id)).toBe('你好世界 🌍 café');
  });

  it('should handle very long text', () => {
    const blockOp = doc.insertParagraphBlock();
    const longText = 'a'.repeat(5000);
    
    doc.insertText(blockOp.id, longText);
    
    expect(doc.getParagraphText(blockOp.id)).toHaveLength(5000);
  });

  it('should handle rapid sequential operations', () => {
    const blockOp = doc.insertParagraphBlock();
    
    for (let i = 0; i < 100; i++) {
      doc.insertText(blockOp.id, String(i));
    }
    
    const text = doc.getParagraphText(blockOp.id);
    expect(text.length).toBeGreaterThan(0);
  });

  it('should handle operations on non-existent blocks', () => {
    const fakeId: CRDTId = [999, 999];
    
    expect(() => doc.insertText(fakeId, 'Test')).toThrow();
  });
});

describe('CRDTDocument - Complex Document Scenarios', () => {
  let doc: CRDTDocument;

  beforeEach(() => {
    doc = new CRDTDocument(1);
  });

  it('should create a complete document structure', () => {
    const titleOp = doc.insertHeadingBlock(1);
    doc.insertText(titleOp.id, 'My Document');
    
    const introOp = doc.insertParagraphBlock(titleOp.id);
    doc.insertText(introOp.id, 'This is the introduction.');
    
    const sectionOp = doc.insertHeadingBlock(2, introOp.id);
    doc.insertText(sectionOp.id, 'Features');
    
    const listOp = doc.insertListBlock('bullet', sectionOp.id);
    const item1Op = doc.insertListItem(listOp.id);
    doc.insertListItemText(listOp.id, item1Op.id, 'Feature 1');
    const item2Op = doc.insertListItem(listOp.id, item1Op.id);
    doc.insertListItemText(listOp.id, item2Op.id, 'Feature 2');
    
    const tableOp = doc.insertTableBlock(listOp.id);
    const rowOp = doc.insertTableRow(tableOp.id);
    const colOp = doc.insertTableColumn(tableOp.id);
    doc.insertTableCellText(tableOp.id, rowOp.id, colOp.id, 'Data');
    
    expect(doc.blockCount()).toBe(5);
  });

  // it('should handle nested list editing', () => {
  //   const listOp = doc.insertListBlock('ordered');
  //   const listId = listOp.id;
    
  //   let prevItemId = undefined;
  //   const itemIds = [];
    
  //   for (let i = 1; i <= 5; i++) {
  //     const itemOp = doc.insertListItem(listId, prevItemId);
  //     doc.insertListItemText(listId, itemOp.id, `Step ${i}`);
  //     itemIds.push(itemOp.id);
  //     prevItemId = itemOp.id;
  //   }
    
  //   doc.deleteListItem(listId, itemIds[2]);
    
  //   const list = doc.getBlock(listId) as ListBlock;
  //   expect(list.items.visible().length).toBe(4);
  // });

  it('should handle table with header row', () => {
    const tableOp = doc.insertTableBlock();
    const tableId = tableOp.id;
    
    const headerRowOp = doc.insertTableRow(tableId);
    const dataRowOp = doc.insertTableRow(tableId, headerRowOp.id);
    
    const col1Op = doc.insertTableColumn(tableId);
    const col2Op = doc.insertTableColumn(tableId, col1Op.id);
    
    doc.insertTableCellText(tableId, headerRowOp.id, col1Op.id, 'Name');
    doc.insertTableCellText(tableId, headerRowOp.id, col2Op.id, 'Age');
    
    doc.insertTableCellText(tableId, dataRowOp.id, col1Op.id, 'Alice');
    doc.insertTableCellText(tableId, dataRowOp.id, col2Op.id, '30');
    
    expect(doc.getTableCellText(tableId, headerRowOp.id, col1Op.id)).toBe('Name');
    expect(doc.getTableCellText(tableId, dataRowOp.id, col2Op.id)).toBe('30');
  });
});

describe('CRDTDocument - Three-way Merge', () => {
  let alice: CRDTDocument;
  let bob: CRDTDocument;
  let carol: CRDTDocument;

  beforeEach(() => {
    alice = new CRDTDocument(1);
    bob = alice.fork(2);
    carol = alice.fork(3);
  });

  it('should merge edits from three replicas', () => {
    const blockOp = alice.insertParagraphBlock();
    bob.apply(blockOp);
    carol.apply(blockOp);
    
    const aliceOps = alice.insertText(blockOp.id, 'Alice');
    const bobOps = bob.insertText(blockOp.id, 'Bob');
    const carolOps = carol.insertText(blockOp.id, 'Carol');
    
    aliceOps.forEach(op => {
      bob.apply(op);
      carol.apply(op);
    });
    bobOps.forEach(op => {
      alice.apply(op);
      carol.apply(op);
    });
    carolOps.forEach(op => {
      alice.apply(op);
      bob.apply(op);
    });
    
    const aliceText = alice.getParagraphText(blockOp.id);
    const bobText = bob.getParagraphText(blockOp.id);
    const carolText = carol.getParagraphText(blockOp.id);
    
    expect(aliceText).toBe(bobText);
    expect(bobText).toBe(carolText);
  });

  it('should handle complex three-way table editing', () => {
    const tableOp = alice.insertTableBlock();
    bob.apply(tableOp);
    carol.apply(tableOp);
    
    const aliceRowOp = alice.insertTableRow(tableOp.id);
    const bobColOp = bob.insertTableColumn(tableOp.id);
    const carolRowOp = carol.insertTableRow(tableOp.id);
    
    bob.apply(aliceRowOp);
    carol.apply(aliceRowOp);
    alice.apply(bobColOp);
    carol.apply(bobColOp);
    alice.apply(carolRowOp);
    bob.apply(carolRowOp);
    
    expect(alice.getTableDimensions(tableOp.id)).toEqual({ rows: 2, columns: 1 });
    expect(bob.getTableDimensions(tableOp.id)).toEqual({ rows: 2, columns: 1 });
    expect(carol.getTableDimensions(tableOp.id)).toEqual({ rows: 2, columns: 1 });
  });
});
