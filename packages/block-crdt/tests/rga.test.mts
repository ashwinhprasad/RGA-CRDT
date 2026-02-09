import { describe, it, expect, beforeEach } from 'vitest';
import { RGA, RGAElement, type CRDTId } from '../src/rga.mjs';

describe('RGAElement', () => {
  it('should create an element with correct properties', () => {
    const id: CRDTId = [1, 1];
    const element = new RGAElement(id, 'a', 'HEAD');
    
    expect(element.id).toEqual(id);
    expect(element.value).toBe('a');
    expect(element.after).toBe('HEAD');
    expect(element.deleted).toBe(false);
    expect(element.children).toEqual([]);
  });

  it('should create a deleted element', () => {
    const element = new RGAElement([1, 1], 'a', 'HEAD', true);
    expect(element.deleted).toBe(true);
  });

  it('should insert children and maintain sorted order', () => {
    const parent = new RGAElement([1, 1], 'a', 'HEAD');
    
    const child1 = new RGAElement([1, 5], 'b', [1, 1]);
    const child2 = new RGAElement([1, 3], 'c', [1, 1]);
    const child3 = new RGAElement([1, 7], 'd', [1, 1]);
    
    parent.insertChild(child1);
    parent.insertChild(child2);
    parent.insertChild(child3);
    
    expect(parent.children[0].id).toEqual([1, 3]);
    expect(parent.children[1].id).toEqual([1, 5]);
    expect(parent.children[2].id).toEqual([1, 7]);
  });

  it('should sort children by replica ID when counters are equal', () => {
    const parent = new RGAElement([1, 1], 'a', 'HEAD');
    
    const child1 = new RGAElement([2, 5], 'b', [1, 1]);
    const child2 = new RGAElement([1, 5], 'c', [1, 1]);
    const child3 = new RGAElement([3, 5], 'd', [1, 1]);
    
    parent.insertChild(child1);
    parent.insertChild(child2);
    parent.insertChild(child3);
    
    expect(parent.children[0].id).toEqual([1, 5]);
    expect(parent.children[1].id).toEqual([2, 5]);
    expect(parent.children[2].id).toEqual([3, 5]);
  });

  it('should serialize to JSON', () => {
    const element = new RGAElement([1, 1], 'test', 'HEAD');
    const json = element.toJSON();
    
    expect(json.id).toEqual([1, 1]);
    expect(json.value).toBe('test');
    expect(json.after).toBe('HEAD');
    expect(json.deleted).toBe(false);
    expect(json.children).toEqual([]);
  });

  it('should serialize objects with toJSON method', () => {
    class TestObj {
      constructor(public data: string) {}
      toJSON() {
        return { data: this.data };
      }
    }
    
    const obj = new TestObj('test');
    const element = new RGAElement([1, 1], obj, 'HEAD');
    const json = element.toJSON();
    
    expect(json.value).toEqual({ data: 'test' });
  });
});

describe('RGA - Basic Operations', () => {
  let rga: RGA<string>;

  beforeEach(() => {
    rga = new RGA<string>();
  });

  it('should create an empty RGA with HEAD', () => {
    expect(rga.head).toBeDefined();
    expect(rga.head.id).toBe('HEAD');
    expect(rga.visible()).toEqual([]);
  });

  it('should insert a single element', () => {
    const element = new RGAElement([1, 1], 'a', 'HEAD');
    rga.insertRGAElement(element);
    
    expect(rga.visible()).toEqual(['a']);
  });

  it('should insert multiple elements in sequence', () => {
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    const elem2 = new RGAElement([1, 2], 'b', [1, 1]);
    const elem3 = new RGAElement([1, 3], 'c', [1, 2]);
    
    rga.insertRGAElement(elem1);
    rga.insertRGAElement(elem2);
    rga.insertRGAElement(elem3);
    
    expect(rga.visible()).toEqual(['a', 'b', 'c']);
  });

  it('should not insert duplicate elements', () => {
    const element = new RGAElement([1, 1], 'a', 'HEAD');
    
    rga.insertRGAElement(element);
    rga.insertRGAElement(element);
    
    expect(rga.visible()).toEqual(['a']);
  });

  it('should get element by ID', () => {
    const element = new RGAElement([1, 1], 'a', 'HEAD');
    rga.insertRGAElement(element);
    
    const retrieved = rga.getElement([1, 1]);
    expect(retrieved).toBeDefined();
    expect(retrieved?.value).toBe('a');
  });

  it('should return undefined for non-existent element', () => {
    const retrieved = rga.getElement([999, 999]);
    expect(retrieved).toBeUndefined();
  });
});

describe('RGA - Deletion', () => {
  let rga: RGA<string>;

  beforeEach(() => {
    rga = new RGA<string>();
  });

  it('should mark element as deleted', () => {
    const element = new RGAElement([1, 1], 'a', 'HEAD');
    rga.insertRGAElement(element);
    
    rga.delete([1, 1]);
    
    expect(rga.visible()).toEqual([]);
    expect(rga.getElement([1, 1])?.deleted).toBe(true);
  });

  it('should hide deleted elements from visible list', () => {
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    const elem2 = new RGAElement([1, 2], 'b', [1, 1]);
    const elem3 = new RGAElement([1, 3], 'c', [1, 2]);
    
    rga.insertRGAElement(elem1);
    rga.insertRGAElement(elem2);
    rga.insertRGAElement(elem3);
    
    rga.delete([1, 2]);
    
    expect(rga.visible()).toEqual(['a', 'c']);
  });

  it('should handle deleting non-existent elements gracefully', () => {
    expect(() => rga.delete([999, 999])).not.toThrow();
  });

  it('should allow deletion of already deleted elements', () => {
    const element = new RGAElement([1, 1], 'a', 'HEAD');
    rga.insertRGAElement(element);
    
    rga.delete([1, 1]);
    rga.delete([1, 1]);
    
    expect(rga.visible()).toEqual([]);
  });
});

describe('RGA - Concurrent Operations', () => {
  it('should handle concurrent insertions at same position', () => {
    const rga1 = new RGA<string>();
    const rga2 = new RGA<string>();
    
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    const elem2 = new RGAElement([2, 1], 'b', 'HEAD');
    
    rga1.insertRGAElement(elem1);
    rga1.insertRGAElement(elem2);
    
    rga2.insertRGAElement(elem2);
    rga2.insertRGAElement(elem1);
    
    expect(rga1.visible()).toEqual(rga2.visible());
  });

  it('should resolve conflicts deterministically', () => {
    const rga = new RGA<string>();
    
    const elem1 = new RGAElement([1, 5], 'a', 'HEAD');
    const elem2 = new RGAElement([2, 5], 'b', 'HEAD');
    const elem3 = new RGAElement([3, 5], 'c', 'HEAD');
    
    rga.insertRGAElement(elem3);
    rga.insertRGAElement(elem1);
    rga.insertRGAElement(elem2);
    
    const visible = rga.visible();
    expect(visible).toEqual(['a', 'b', 'c']);
  });

  it('should handle interleaved insertions', () => {
    const rga = new RGA<string>();
    
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    rga.insertRGAElement(elem1);
    
    const elem2 = new RGAElement([2, 1], 'b', 'HEAD');
    rga.insertRGAElement(elem2);
    
    const elem3 = new RGAElement([1, 2], 'c', [1, 1]);
    rga.insertRGAElement(elem3);
    
    const elem4 = new RGAElement([2, 2], 'd', [2, 1]);
    rga.insertRGAElement(elem4);
    
    const visible = rga.visible();
    expect(visible.length).toBe(4);
    expect(visible).toContain('a');
    expect(visible).toContain('b');
    expect(visible).toContain('c');
    expect(visible).toContain('d');
  });
});

describe('RGA - lastVisibleId', () => {
  let rga: RGA<string>;

  beforeEach(() => {
    rga = new RGA<string>();
  });

  it('should return HEAD for empty RGA', () => {
    expect(rga.lastVisibleId()).toBe('HEAD');
  });

  it('should return last inserted element ID', () => {
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    const elem2 = new RGAElement([1, 2], 'b', [1, 1]);
    
    rga.insertRGAElement(elem1);
    rga.insertRGAElement(elem2);
    
    expect(rga.lastVisibleId()).toEqual([1, 2]);
  });

  it('should skip deleted elements', () => {
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    const elem2 = new RGAElement([1, 2], 'b', [1, 1]);
    const elem3 = new RGAElement([1, 3], 'c', [1, 2]);
    
    rga.insertRGAElement(elem1);
    rga.insertRGAElement(elem2);
    rga.insertRGAElement(elem3);
    
    rga.delete([1, 3]);
    
    expect(rga.lastVisibleId()).toEqual([1, 2]);
  });

  it('should return HEAD if all elements are deleted', () => {
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    const elem2 = new RGAElement([1, 2], 'b', [1, 1]);
    
    rga.insertRGAElement(elem1);
    rga.insertRGAElement(elem2);
    
    rga.delete([1, 1]);
    rga.delete([1, 2]);
    
    expect(rga.lastVisibleId()).toBe('HEAD');
  });
});

describe('RGA - Clone', () => {
  let rga: RGA<string>;

  beforeEach(() => {
    rga = new RGA<string>();
  });

  it('should create an independent copy', () => {
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    const elem2 = new RGAElement([1, 2], 'b', [1, 1]);
    
    rga.insertRGAElement(elem1);
    rga.insertRGAElement(elem2);
    
    const clone = rga.clone();
    
    expect(clone.visible()).toEqual(['a', 'b']);
    
    rga.delete([1, 1]);
    
    expect(rga.visible()).toEqual(['b']);
    expect(clone.visible()).toEqual(['a', 'b']);
  });

  it('should clone complex structures', () => {
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    const elem2 = new RGAElement([1, 2], 'b', [1, 1]);
    const elem3 = new RGAElement([2, 1], 'c', 'HEAD');
    const elem4 = new RGAElement([2, 2], 'd', [2, 1]);
    
    rga.insertRGAElement(elem1);
    rga.insertRGAElement(elem2);
    rga.insertRGAElement(elem3);
    rga.insertRGAElement(elem4);
    
    const clone = rga.clone();
    
    expect(clone.visible()).toEqual(rga.visible());
  });

  it('should clone deleted state', () => {
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    rga.insertRGAElement(elem1);
    rga.delete([1, 1]);
    
    const clone = rga.clone();
    
    expect(clone.visible()).toEqual([]);
    expect(clone.getElement([1, 1])?.deleted).toBe(true);
  });
});

describe('RGA - Serialization', () => {
  let rga: RGA<string>;

  beforeEach(() => {
    rga = new RGA<string>();
  });

  it('should serialize empty RGA', () => {
    const json = rga.toJSON();
    
    expect(json.id).toBe('HEAD');
    expect(json.children).toEqual([]);
  });

  it('should serialize RGA with elements', () => {
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    const elem2 = new RGAElement([1, 2], 'b', [1, 1]);
    
    rga.insertRGAElement(elem1);
    rga.insertRGAElement(elem2);
    
    const json = rga.toJSON();
    
    expect(json.children).toHaveLength(1);
    expect(json.children[0].value).toBe('a');
    expect(json.children[0].children).toHaveLength(1);
    expect(json.children[0].children[0].value).toBe('b');
  });

  it('should serialize deleted elements', () => {
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    rga.insertRGAElement(elem1);
    rga.delete([1, 1]);
    
    const json = rga.toJSON();
    
    expect(json.children[0].deleted).toBe(true);
  });

  it('should serialize complex nested structure', () => {
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    const elem2 = new RGAElement([1, 2], 'b', [1, 1]);
    const elem3 = new RGAElement([1, 3], 'c', [1, 1]);
    const elem4 = new RGAElement([1, 4], 'd', [1, 2]);
    
    rga.insertRGAElement(elem1);
    rga.insertRGAElement(elem2);
    rga.insertRGAElement(elem3);
    rga.insertRGAElement(elem4);
    
    const json = rga.toJSON();
    
    expect(json.children).toHaveLength(1);
    expect(json.children[0].children).toHaveLength(2);
  });
});

describe('RGA - Complex Scenarios', () => {
  it('should handle out-of-order insertions', () => {
    const rga = new RGA<string>();
    
    const elem3 = new RGAElement([1, 3], 'c', [1, 2]);
    const elem1 = new RGAElement([1, 1], 'a', 'HEAD');
    const elem2 = new RGAElement([1, 2], 'b', [1, 1]);
    
    rga.insertRGAElement(elem3);
    rga.insertRGAElement(elem1);
    rga.insertRGAElement(elem2);
    
    expect(rga.visible()).toEqual(['a', 'b', 'c']);
  });

  it('should maintain order across multiple replicas', () => {
    const rga1 = new RGA<string>();
    const rga2 = new RGA<string>();
    
    const operations = [
      new RGAElement([1, 1], 'a', 'HEAD'),
      new RGAElement([2, 1], 'b', 'HEAD'),
      new RGAElement([1, 2], 'c', [1, 1]),
      new RGAElement([2, 2], 'd', [2, 1]),
      new RGAElement([3, 1], 'e', 'HEAD'),
    ];

    const reversedCloned = [...operations]
    .reverse()
    .map(el => new RGAElement(
      el.id === "HEAD" ? "HEAD" : [...el.id], // clone tuple
      el.value,
      el.after === "HEAD" ? "HEAD" : [...el.after], // clone tuple
      el.deleted
    ));
    
    operations.forEach(op => rga1.insertRGAElement(op));
    reversedCloned.forEach(op => rga2.insertRGAElement(op));
    
    expect(rga1.visible()).toEqual(rga2.visible());
  });

  it('should handle complex deletion patterns', () => {
    const rga = new RGA<string>();
    
    for (let i = 1; i <= 10; i++) {
      const after: CRDTId = i === 1 ? 'HEAD' : [1, i - 1];
      rga.insertRGAElement(new RGAElement([1, i], String(i), after));
    }
    
    for (let i = 2; i <= 10; i += 2) {
      rga.delete([1, i]);
    }
    
    const visible = rga.visible();
    expect(visible).toEqual(['1', '3', '5', '7', '9']);
  });
});

describe('RGA - Generic Type Support', () => {
  it('should work with number type', () => {
    const rga = new RGA<number>();
    
    rga.insertRGAElement(new RGAElement([1, 1], 42, 'HEAD'));
    rga.insertRGAElement(new RGAElement([1, 2], 100, [1, 1]));
    
    expect(rga.visible()).toEqual([42, 100]);
  });

  it('should work with object type', () => {
    interface User {
      name: string;
      age: number;
    }
    
    const rga = new RGA<User>();
    
    rga.insertRGAElement(new RGAElement([1, 1], { name: 'Alice', age: 30 }, 'HEAD'));
    rga.insertRGAElement(new RGAElement([1, 2], { name: 'Bob', age: 25 }, [1, 1]));
    
    const visible = rga.visible();
    expect(visible).toHaveLength(2);
    expect(visible[0].name).toBe('Alice');
    expect(visible[1].name).toBe('Bob');
  });

  it('should work with custom class instances', () => {
    class ListItem {
      constructor(public text: string) {}
      toJSON() {
        return { text: this.text };
      }
    }
    
    const rga = new RGA<ListItem>();
    
    rga.insertRGAElement(new RGAElement([1, 1], new ListItem('First'), 'HEAD'));
    rga.insertRGAElement(new RGAElement([1, 2], new ListItem('Second'), [1, 1]));
    
    const visible = rga.visible();
    expect(visible[0].text).toBe('First');
    expect(visible[1].text).toBe('Second');
  });
});
