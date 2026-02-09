export type ReplicaId = number;
export type CRDTId = [replicaId: ReplicaId, counter: number] | "HEAD";

export type RGAElementJSON<T> = {
    id: CRDTId;
    after: CRDTId;
    deleted: boolean;
    value: T | unknown;
    children: RGAElementJSON<T>[];
};

export type RGAJSON<T> = RGAElementJSON<T>;

function idEquals(a: CRDTId, b: CRDTId): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function compareIds(a: CRDTId, b: CRDTId): number {
  if (a === "HEAD" || b === "HEAD") return 0;

  const [ra, ca] = a;
  const [rb, cb] = b;

  return ca === cb ? ra - rb : ca - cb;
}


export class RGAElement<T = string> {

    public children: RGAElement<T>[] = [];

    constructor(
        public id: CRDTId,
        public value: T,
        public after: CRDTId,
        public deleted: boolean = false
    ) {}

    insertChild(child: RGAElement<T>) {
        this.children.push(child);
        this.children.sort((a, b) => compareIds(a.id, b.id));
    }

    toJSON(): RGAElementJSON<T> {
        const value =
            this.value && typeof (this.value as any).toJSON === "function"
                ? (this.value as any).toJSON()
                : this.value;

        return {
            id: this.id,
            after: this.after,
            deleted: this.deleted,
            value,
            children: this.children.map(
                (child): RGAElementJSON<T> => child.toJSON()
            )
        };
    }
}


export class RGA<T = string> {

    public head: RGAElement<T>;
    private elementMap = new Map<string, RGAElement<T>>();

    private pendingByAfter = new Map<string, RGAElement<T>[]>();
    private pendingIds = new Set<string>();
  
    constructor() {
        this.head = new RGAElement<T>("HEAD", null as any, "HEAD");
        this.elementMap.set(JSON.stringify("HEAD"), this.head);
    }

    clone(): RGA<T> {
        const newRGA = new RGA<T>();

        const cloneNode = (
            node: RGAElement<T>,
            parentClone: RGAElement<T>
        ) => {
            for (const child of node.children) {
                const childClone = new RGAElement<T>(
                child.id,
                child.value,
                child.after,
                child.deleted
                );

                parentClone.insertChild(childClone);
                newRGA["elementMap"].set(JSON.stringify(childClone.id), childClone);

                cloneNode(child, childClone);
            }
        };

        cloneNode(this.head, newRGA.head);
        return newRGA;
    }

    getElement(id: CRDTId): RGAElement<T> | undefined {
        return this["elementMap"].get(JSON.stringify(id));
    }


    private enqueuePending(parentKey: string, element: RGAElement<T>) {
        const elKey = JSON.stringify(element.id);
        if (this.pendingIds.has(elKey)) return;

        const list = this.pendingByAfter.get(parentKey);
        if (list) list.push(element);
        else this.pendingByAfter.set(parentKey, [element]);

        this.pendingIds.add(elKey);
    }


    private drainPendingForParent(parentIdKey: string) {
        const pending = this.pendingByAfter.get(parentIdKey);
        if (!pending || pending.length === 0) return;

        // Remove the bucket first to prevent re-entrancy loops
        this.pendingByAfter.delete(parentIdKey);

        // Optional: deterministic replay order (not strictly necessary because parent.insertChild sorts)
        pending.sort((a, b) => compareIds(a.id, b.id));

        for (const child of pending) {
        this.pendingIds.delete(JSON.stringify(child.id));
        // This will either insert (if parent now exists) or re-queue (if it depends on something else)
        this.insertRGAElement(child);
        }
    }


    insertRGAElement(element: RGAElement<T>) {
        const key = JSON.stringify(element.id);
        if (this.elementMap.has(key)) return;

        const parentKey = JSON.stringify(element.after);


        if (element.after !== "HEAD" && !this.elementMap.has(parentKey)) {
            this.enqueuePending(parentKey, element);
            return;
        }

        const parent =
        this.elementMap.get(parentKey) ?? this.head;

        parent.insertChild(element);
        this.elementMap.set(key, element);

        this.drainPendingForParent(key);
    }


    delete(id: CRDTId) {
        const el = this.elementMap.get(JSON.stringify(id));
        if (el) el.deleted = true;
    }

    visible(): T[] {
        const result: T[] = [];

        const traverse = (node: RGAElement<T>) => {
        for (const child of node.children) {
            if (!child.deleted) {
            result.push(child.value);
            }
            traverse(child);
        }
        };

        traverse(this.head);
        return result;
    }

    lastVisibleId(): CRDTId {
        let last: CRDTId = "HEAD";

        const traverse = (node: RGAElement<T>) => {
            for (const child of node.children) {
            if (!child.deleted) {
                last = child.id;
            }
            traverse(child);
            }
        };

        traverse(this.head);
        return last;
    }

    toJSON(): RGAJSON<T> {
        return this.head.toJSON();
    }
}