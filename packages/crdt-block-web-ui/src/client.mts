import { CRDTDocument } from "../../block-crdt/src/crdtDocument.mjs";
import { CRDTOp, Block, ParagraphBlock, ListBlock, TableBlock, ListItem, TableRow, TableColumn } from "../../block-crdt/src/block.mjs";
import { CRDTId, RGA } from "../../block-crdt/src/rga.mjs";

// Editor state
let doc: CRDTDocument | null = null;
let replicaId: number = 0;
let userName: string = "";
let isOnline: boolean = true;
let pendingOps: CRDTOp[] = [];
let initialOpLog: CRDTOp[] = [];

// WebSocket connection
const ws = new WebSocket(`ws://${location.host}`);
let wsReady = false;

// DOM elements
const editorEl = document.getElementById("editor") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;
const presenceEl = document.getElementById("presence") as HTMLElement;
const userNameEl = document.getElementById("user-name") as HTMLElement;
const toggleOnlineBtn = document.getElementById("toggle-online") as HTMLButtonElement;
const addParagraphBtn = document.getElementById("add-paragraph") as HTMLButtonElement;
const addListBtn = document.getElementById("add-list") as HTMLButtonElement;
const addTableBtn = document.getElementById("add-table") as HTMLButtonElement;

// Track presence
const presenceMap = new Map<number, { online: boolean; name: string }>();

// Initialize
function init() {
  const storedId = Number(sessionStorage.getItem("replicaId"));
  const storedName = sessionStorage.getItem("userName") || `User ${Date.now() % 1000}`;
  
  userName = storedName;
  userNameEl.textContent = userName;

  if (Number.isInteger(storedId) && storedId > 0) {
    replicaId = storedId;
  }
}

// WebSocket handlers
ws.addEventListener("open", () => {
  wsReady = true;
  ws.send(JSON.stringify({ type: "register", replicaId: replicaId || null, name: userName }));
  
  // Flush pending operations
  if (isOnline) {
    while (pendingOps.length > 0) {
      const op = pendingOps.shift()!;
      ws.send(JSON.stringify({ type: "operation", op }));
    }
  }
});

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case "init":
      // Store the initial operation log to apply after registration
      if (Array.isArray(message.opLog)) {
        initialOpLog = message.opLog;
        console.log(`Received ${initialOpLog.length} operations from server`);
      }
      break;

    case "registered":
      replicaId = message.replicaId;
      userName = message.name;
      sessionStorage.setItem("replicaId", String(replicaId));
      sessionStorage.setItem("userName", userName);
      
      // Initialize document with replica ID
      doc = new CRDTDocument(replicaId);
      
      // Apply all operations from the initial log
      if (initialOpLog.length > 0) {
        console.log(`Applying ${initialOpLog.length} operations to new replica ${replicaId}`);
        initialOpLog.forEach((op: any) => {
          const reconstructed = reconstructOperation(op);
          doc!.apply(reconstructed);
        });
        initialOpLog = []; // Clear after applying
      } else {
        // If no operations, start with a default paragraph block
        const op = doc.insertParagraphBlock();
        sendOp(op);
      }
      
      userNameEl.textContent = `${userName} (R${replicaId})`;
      updateStatus();
      renderDocument();
      break;

    case "operation":
      // Ignore incoming operations when offline
      if (!isOnline) {
        console.log(`Ignoring operation while offline:`, message.op);
        break;
      }
      
      if (doc && message.op) {
        console.log(`Received operation:`, message.op);
        const reconstructed = reconstructOperation(message.op);
        
        // Only apply if it's from another replica (not our own echo)
        const opReplicaId = (reconstructed as any).id?.[0];
        if (opReplicaId !== replicaId) {
          // Log remote operation to inspector
          logOperation(reconstructed, "remote");
          
          doc.apply(reconstructed);
          // Always render for remote operations so we see changes from other users
          renderDocument();
        }
      }
      break;

    case "presence":
      if (Array.isArray(message.presence)) {
        presenceMap.clear();
        message.presence.forEach((p: { id: number; online: boolean; name: string }) => {
          presenceMap.set(p.id, { online: p.online, name: p.name });
        });
        renderPresence();
      }
      break;

    case "user-joined":
      console.log(`${message.name} joined`);
      break;

    case "user-left":
      console.log(`User ${message.replicaId} left`);
      break;
      
    case "sync":
      // Handle sync response when going back online
      if (doc && Array.isArray(message.operations)) {
        console.log(`Received sync with ${message.operations.length} missed operations`);
        message.operations.forEach((op: any, index: number) => {
          console.log(`Applying missed operation ${index + 1}:`, op.kind);
          const reconstructed = reconstructOperation(op);
          const opReplicaId = (reconstructed as any).id?.[0];
          if (opReplicaId !== replicaId) {
            doc!.apply(reconstructed);
          } else {
            console.log(`Skipping own operation:`, op.kind);
          }
        });
        console.log(`Sync complete, rendering document`);
        renderDocument();
      }
      break;
  }
});

ws.addEventListener("close", () => {
  wsReady = false;
  updateStatus();
});

// ============================================================================
// ALGORITHM INSPECTOR - Variables and Functions
// ============================================================================

const operationHistory: Array<{ op: CRDTOp; timestamp: number; source: string }> = [];
const conflictHistory: Array<{ description: string; resolution: string; timestamp: number }> = [];

// Log operation to inspector
function logOperation(op: CRDTOp, source: "local" | "remote") {
  operationHistory.push({
    op,
    timestamp: Date.now(),
    source
  });
  
  // Keep only last 50 operations
  if (operationHistory.length > 50) {
    operationHistory.shift();
  }
  
  updateOperationLog();
  updateRGATree();
  updateDocumentState();
  
  // Detect conflicts
  detectConflicts(op);
}

// Detect and log concurrent operations from different replicas
function detectConflicts(op: CRDTOp) {
  // Check for concurrent operations at the same position from DIFFERENT replicas
  if (op.kind === "insert_char" || op.kind === "insert_list_char" || op.kind === "insert_cell_char") {
    const after = (op as any).after;
    const opId = (op as any).id;
    const opReplicaId = opId[0];
    
    // Check if there are other recent operations with the same "after" from DIFFERENT replicas
    const recentOps = operationHistory.slice(-10);
    const concurrent = recentOps.filter(({ op: otherOp }) => {
      if (otherOp.kind !== op.kind) return false;
      const otherAfter = (otherOp as any).after;
      const otherId = (otherOp as any).id;
      const otherReplicaId = otherId[0];
      
      // Same after position, different operation, and DIFFERENT replica
      return JSON.stringify(after) === JSON.stringify(otherAfter) && 
             JSON.stringify(opId) !== JSON.stringify(otherId) &&
             opReplicaId !== otherReplicaId;
    });
    
    if (concurrent.length > 0) {
      const char = (op as any).char || "";
      const otherChar = (concurrent[0].op as any).char || "";
      const otherReplicaId = concurrent[0].op.id[0];
      
      logConflict(
        `Concurrent insertion from R${opReplicaId} and R${otherReplicaId}`,
        `Replica ${opReplicaId} inserted "${char}" and Replica ${otherReplicaId} inserted "${otherChar}" at the same position. ` +
        `Deterministic ordering by replica ID: R${opReplicaId} ${opReplicaId < otherReplicaId ? '<' : '>'} R${otherReplicaId} = ` +
        `"${opReplicaId < otherReplicaId ? char + otherChar : otherChar + char}"`
      );
    }
  }
}

function logConflict(description: string, resolution: string) {
  conflictHistory.push({
    description,
    resolution,
    timestamp: Date.now()
  });
  
  // Keep only last 20 conflicts
  if (conflictHistory.length > 20) {
    conflictHistory.shift();
  }
  
  updateConflictLog();
}

// Send operation to server
function sendOp(op: CRDTOp) {
  // Log operation to inspector
  logOperation(op, "local");
  
  // Always apply operation locally first (optimistic update)
  if (doc) {
    doc.apply(op);
    // Always render for block-level operations
    // For character operations, only render if we're offline (to see our own changes)
    const isBlockOp = op.kind.includes('block') || op.kind.includes('row') || 
                      op.kind.includes('column') || op.kind.includes('item');
    if (isBlockOp || !isOnline) {
      renderDocument();
    }
  }
  
  // Then send to server or queue if offline
  if (!isOnline) {
    pendingOps.push(op);
    console.log(`Queued operation while offline:`, op.kind, `(${pendingOps.length} pending)`);
    return;
  }

  if (wsReady) {
    console.log(`Sending operation:`, op);
    ws.send(JSON.stringify({ type: "operation", op }));
  } else {
    pendingOps.push(op);
  }
}

// Reconstruct block objects from JSON
function reconstructOperation(op: any): CRDTOp {
  if (op.kind === "insert_block" && op.block) {
    // Reconstruct the block object based on its type
    const blockData = op.block;
    let block: Block;
    
    if (blockData.type === "paragraph") {
      block = new ParagraphBlock();
      if (blockData.content) {
        block.content = reconstructRGA(blockData.content);
      }
    } else if (blockData.type === "heading") {
      block = new (class extends Block {
        level: number;
        content: any;
        constructor(level: number) {
          super("heading");
          this.level = level;
          this.content = new RGA();
        }
        toJSON() { return { type: this.type, level: this.level, content: this.content }; }
        toString() { return this.content.visible().join(""); }
      })(blockData.level || 1);
      if (blockData.content) {
        block.content = reconstructRGA(blockData.content);
      }
    } else if (blockData.type === "list") {
      block = new ListBlock(blockData.style || "bullet");
      if (blockData.items) {
        block.items = reconstructRGA(blockData.items);
      }
    } else if (blockData.type === "table") {
      block = new TableBlock();
      if (blockData.rows) {
        block.rows = reconstructRGA(blockData.rows);
      }
      if (blockData.columns) {
        block.columns = reconstructRGA(blockData.columns);
      }
    } else {
      // Fallback
      block = new ParagraphBlock();
    }
    
    return { ...op, block };
  }
  
  if (op.kind === "insert_list_item" && op.item) {
    // Reconstruct ListItem
    const item = new ListItem();
    return { ...op, item };
  }
  
  if (op.kind === "insert_row" && op.row) {
    // Reconstruct TableRow
    const row = new TableRow();
    return { ...op, row };
  }
  
  if (op.kind === "insert_column" && op.column) {
    // Reconstruct TableColumn
    const column = new TableColumn();
    return { ...op, column };
  }
  
  return op as CRDTOp;
}

// Reconstruct RGA from JSON (simplified - just create empty RGA)
function reconstructRGA(data: any): any {
  // Create a new RGA instance - the content will be built up by subsequent operations
  return new RGA();
}

// Render the entire document
function renderDocument() {
  if (!doc) {
    editorEl.innerHTML = '<div class="empty-state">Connecting...</div>';
    return;
  }

  const blocks = doc.visibleBlocks();
  console.log(`Rendering ${blocks.length} blocks`);
  
  if (blocks.length === 0) {
    editorEl.innerHTML = '<div class="empty-state">Empty document. Click "Add Paragraph" to start.</div>';
    return;
  }

  // Save cursor position before rendering
  const activeElement = document.activeElement;
  let cursorPosition = 0;
  let activeBlockIndex = -1;
  
  if (activeElement && activeElement.isContentEditable) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      cursorPosition = range.startOffset;
      
      // Find which block is active
      let parent = activeElement;
      while (parent && !parent.classList.contains('block')) {
        parent = parent.parentElement!;
      }
      if (parent) {
        activeBlockIndex = parseInt(parent.dataset.blockIndex || '-1');
      }
    }
  }

  editorEl.innerHTML = "";
  
  blocks.forEach((block, index) => {
    const blockEl = renderBlock(block, index);
    editorEl.appendChild(blockEl);
    console.log(`Rendered block ${index}:`, block.type, block.toString ? block.toString() : '');
  });
  
  // Restore cursor position
  if (activeBlockIndex >= 0 && activeBlockIndex < blocks.length) {
    setTimeout(() => {
      const blockEl = editorEl.querySelector(`[data-block-index="${activeBlockIndex}"]`);
      if (blockEl) {
        const editableEl = blockEl.querySelector('[contenteditable="true"]') as HTMLElement;
        if (editableEl) {
          editableEl.focus();
          
          // Restore cursor position
          const selection = window.getSelection();
          const range = document.createRange();
          
          try {
            const textNode = editableEl.firstChild || editableEl;
            const offset = Math.min(cursorPosition, (textNode.textContent || '').length);
            range.setStart(textNode, offset);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
          } catch (e) {
            // If cursor restoration fails, just focus the element
            console.warn('Could not restore cursor position:', e);
          }
        }
      }
    }, 0);
  }
}

// Render a single block
function renderBlock(block: Block, index: number): HTMLElement {
  const container = document.createElement("div");
  container.className = "block";
  container.dataset.blockIndex = String(index);

  // Drag handle with six-dot icon (draggable)
  const dragHandle = document.createElement("div");
  dragHandle.className = "drag-handle";
  dragHandle.draggable = true;
  dragHandle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.5"/>
      <circle cx="11" cy="3" r="1.5"/>
      <circle cx="5" cy="8" r="1.5"/>
      <circle cx="11" cy="8" r="1.5"/>
      <circle cx="5" cy="13" r="1.5"/>
      <circle cx="11" cy="13" r="1.5"/>
    </svg>
  `;
  dragHandle.title = "Drag to reorder";
  
  // Drag events
  dragHandle.addEventListener("dragstart", (e) => {
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData("text/plain", String(index));
    container.classList.add("dragging");
  });

  dragHandle.addEventListener("dragend", () => {
    container.classList.remove("dragging");
    document.querySelectorAll(".block").forEach(el => el.classList.remove("drag-over"));
  });
  
  container.appendChild(dragHandle);

  // Drop zone events on container
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    
    const dragging = document.querySelector(".dragging");
    if (dragging && dragging !== container) {
      container.classList.add("drag-over");
    }
  });

  container.addEventListener("dragleave", () => {
    container.classList.remove("drag-over");
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    container.classList.remove("drag-over");
    
    const fromIndex = parseInt(e.dataTransfer!.getData("text/plain"));
    const toIndex = index;
    
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      moveBlock(fromIndex, toIndex);
    }
  });

  if (block instanceof ParagraphBlock) {
    const p = document.createElement("div");
    p.className = "paragraph-block";
    p.contentEditable = "true";
    p.textContent = block.toString();
    
    p.addEventListener("input", () => handleParagraphEdit(index, p.textContent || ""));
    p.addEventListener("keydown", (e) => handleKeyDown(e, index));
    
    container.appendChild(p);
  } else if (block instanceof ListBlock) {
    const list = document.createElement(block.style === "ordered" ? "ol" : "ul");
    list.className = "list-block";
    
    const items = block.items.visible();
    items.forEach((item, itemIndex) => {
      const li = document.createElement("li");
      li.contentEditable = "true";
      li.textContent = item.content.visible().join("");
      
      li.addEventListener("input", () => handleListItemEdit(index, itemIndex, li.textContent || ""));
      li.addEventListener("keydown", (e) => handleListKeyDown(e, index, itemIndex));
      
      list.appendChild(li);
    });
    
    // Add button to add new list item
    const addItemBtn = document.createElement("button");
    addItemBtn.className = "add-item-btn";
    addItemBtn.textContent = "+ Add item";
    addItemBtn.onclick = () => addListItem(index);
    
    container.appendChild(list);
    container.appendChild(addItemBtn);
  } else if (block instanceof TableBlock) {
    const table = document.createElement("table");
    table.className = "table-block";
    
    // Get row and column IDs by traversing the RGA tree
    const rowIds: CRDTId[] = [];
    const colIds: CRDTId[] = [];
    
    const getIds = (node: any, ids: CRDTId[]) => {
      for (const child of node.children) {
        if (!child.deleted) {
          ids.push(child.id);
        }
        getIds(child, ids);
      }
    };
    
    getIds((block.rows as any).head, rowIds);
    getIds((block.columns as any).head, colIds);
    
    rowIds.forEach((rowId, rowIndex) => {
      const tr = document.createElement("tr");
      
      colIds.forEach((colId, colIndex) => {
        const td = document.createElement("td");
        td.contentEditable = "true";
        td.dataset.col = String(colIndex + 1);
        td.dataset.row = String(rowIndex + 1);
        td.textContent = doc!.getTableCellText(getBlockId(index), rowId, colId);
        td.addEventListener("input", () => 
          handleTableCellEdit(index, rowIndex, colIndex, td.textContent || "")
        );
        tr.appendChild(td);
      });
      
      table.appendChild(tr);
    });
    
    // Add controls for adding rows/columns
    const controls = document.createElement("div");
    controls.className = "table-controls";
    
    const addRowBtn = document.createElement("button");
    addRowBtn.textContent = "+ Row";
    addRowBtn.onclick = () => addTableRow(index);
    
    const addColBtn = document.createElement("button");
    addColBtn.textContent = "+ Column";
    addColBtn.onclick = () => addTableColumn(index);
    
    controls.appendChild(addRowBtn);
    controls.appendChild(addColBtn);
    
    container.appendChild(table);
    container.appendChild(controls);
  }

  // Delete button
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-block-btn";
  deleteBtn.textContent = "×";
  deleteBtn.onclick = () => deleteBlock(index);
  container.appendChild(deleteBtn);

  return container;
}

// Get block ID by index
function getBlockId(index: number): CRDTId {
  if (!doc) throw new Error("Document not initialized");
  const blocks = doc.visibleBlocks();
  const block = blocks[index];
  
  // Find the block's ID by traversing the RGA tree
  const blockRGA = (doc as any).blocks;
  const found = findElementId(blockRGA.head, block);
  if (!found) throw new Error("Block ID not found");
  return found;
}

// Helper to find element ID in RGA tree
function findElementId(node: any, target: any): CRDTId | null {
  for (const child of node.children) {
    if (child.value === target && !child.deleted) {
      return child.id;
    }
    const found = findElementId(child, target);
    if (found) return found;
  }
  return null;
}

// Get list item ID
function getListItemId(blockIndex: number, itemIndex: number): CRDTId {
  if (!doc) throw new Error("Document not initialized");
  const block = doc.visibleBlocks()[blockIndex];
  
  if (!(block instanceof ListBlock)) {
    throw new Error("Block is not a list");
  }
  
  const items = block.items.visible();
  const item = items[itemIndex];
  
  const found = findElementId((block.items as any).head, item);
  if (!found) throw new Error("List item ID not found");
  return found;
}

// Get table row/column IDs
function getTableRowId(blockIndex: number, rowIndex: number): CRDTId {
  if (!doc) throw new Error("Document not initialized");
  const block = doc.visibleBlocks()[blockIndex];
  
  if (!(block instanceof TableBlock)) {
    throw new Error("Block is not a table");
  }
  
  const rows = block.rows.visible();
  const row = rows[rowIndex];
  
  const found = findElementId((block.rows as any).head, row);
  if (!found) throw new Error("Row ID not found");
  return found;
}

function getTableColumnId(blockIndex: number, colIndex: number): CRDTId {
  if (!doc) throw new Error("Document not initialized");
  const block = doc.visibleBlocks()[blockIndex];
  
  if (!(block instanceof TableBlock)) {
    throw new Error("Block is not a table");
  }
  
  const columns = block.columns.visible();
  const column = columns[colIndex];
  
  const found = findElementId((block.columns as any).head, column);
  if (!found) throw new Error("Column ID not found");
  return found;
}

// Handle paragraph editing
let editTimeout: number | null = null;
const previousTexts = new Map<number, string>();

function handleParagraphEdit(blockIndex: number, newText: string) {
  if (!doc) return;
  
  const blockId = getBlockId(blockIndex);
  const oldText = previousTexts.get(blockIndex) || doc.getParagraphText(blockId);
  
  if (oldText === newText) return;
  
  // Clear previous timeout
  if (editTimeout) clearTimeout(editTimeout);
  
  // Reduced debounce for better responsiveness
  editTimeout = window.setTimeout(() => {
    applyTextEdit(blockId, oldText, newText);
    previousTexts.set(blockIndex, newText);
  }, 100);
}

// Apply text edits as CRDT operations
function applyTextEdit(blockId: CRDTId, oldText: string, newText: string) {
  if (!doc) return;
  
  // Find the diff
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }
  
  let oldEnd = oldText.length - 1;
  let newEnd = newText.length - 1;
  while (oldEnd >= start && newEnd >= start && oldText[oldEnd] === newText[newEnd]) {
    oldEnd--;
    newEnd--;
  }
  
  const deleted = oldText.slice(start, oldEnd + 1);
  const inserted = newText.slice(start, newEnd + 1);
  
  // Get visible characters
  const block = doc.getBlock(blockId);
  if (!block || !(block instanceof ParagraphBlock)) return;
  
  const chars = block.content.visible();
  
  // Delete characters
  for (let i = 0; i < deleted.length; i++) {
    const charIndex = start;
    if (charIndex < chars.length) {
      // Find the character ID at this index
      let currentIndex = 0;
      const findCharId = (node: any): CRDTId | null => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === charIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      
      const charId = findCharId((block.content as any).head);
      if (charId) {
        const op = doc.deleteChar(blockId, charId);
        sendOp(op);
      }
    }
  }
  
  // Insert characters
  if (inserted.length > 0) {
    const prevCharIndex = start - 1;
    let afterId: CRDTId;
    
    if (prevCharIndex >= 0 && chars.length > 0) {
      // Find the ID of the character before insertion point
      let currentIndex = 0;
      const findCharId = (node: any): CRDTId | null => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === prevCharIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      
      const foundId = findCharId((block.content as any).head);
      afterId = foundId || "HEAD";
    } else {
      // Insert at the beginning or in empty block
      afterId = "HEAD";
    }
    
    const ops = doc.insertText(blockId, inserted, afterId);
    ops.forEach(op => sendOp(op));
  }
  
  // Update the stored text
  previousTexts.set(
    Array.from(editorEl.querySelectorAll('.block')).findIndex(
      el => el.querySelector('.paragraph-block')?.textContent === newText
    ),
    newText
  );
}

// Handle list item editing
let listEditTimeout: number | null = null;
const previousListTexts = new Map<string, string>();

function handleListItemEdit(blockIndex: number, itemIndex: number, newText: string) {
  if (!doc) return;
  
  const blockId = getBlockId(blockIndex);
  const itemId = getListItemId(blockIndex, itemIndex);
  const key = `${blockIndex}-${itemIndex}`;
  const oldText = previousListTexts.get(key) || doc.getListItemText(blockId, itemId);
  
  if (oldText === newText) return;
  
  // Clear previous timeout
  if (listEditTimeout) clearTimeout(listEditTimeout);
  
  // Debounce for better responsiveness
  listEditTimeout = window.setTimeout(() => {
    applyListItemTextEdit(blockId, itemId, oldText, newText);
    previousListTexts.set(key, newText);
  }, 100);
}

// Apply list item text edits as CRDT operations (diff-based)
function applyListItemTextEdit(blockId: CRDTId, itemId: CRDTId, oldText: string, newText: string) {
  if (!doc) return;
  
  // Find the diff
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }
  
  let oldEnd = oldText.length - 1;
  let newEnd = newText.length - 1;
  while (oldEnd >= start && newEnd >= start && oldText[oldEnd] === newText[newEnd]) {
    oldEnd--;
    newEnd--;
  }
  
  const deleted = oldText.slice(start, oldEnd + 1);
  const inserted = newText.slice(start, newEnd + 1);
  
  // Get visible characters
  const block = doc.getBlock(blockId);
  if (!block || !(block instanceof ListBlock)) return;
  
  const item = block.items.getElement(itemId);
  if (!item) return;
  
  const chars = item.value.content.visible();
  
  // Delete characters
  for (let i = 0; i < deleted.length; i++) {
    const charIndex = start;
    if (charIndex < chars.length) {
      // Find the character ID at this index
      let currentIndex = 0;
      const findCharId = (node: any): CRDTId | null => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === charIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      
      const charId = findCharId((item.value.content as any).head);
      if (charId) {
        const op = doc.deleteListItemChar(blockId, itemId, charId);
        sendOp(op);
      }
    }
  }
  
  // Insert characters
  if (inserted.length > 0) {
    const prevCharIndex = start - 1;
    let afterId: CRDTId;
    
    if (prevCharIndex >= 0 && chars.length > 0) {
      // Find the ID of the character before insertion point
      let currentIndex = 0;
      const findCharId = (node: any): CRDTId | null => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === prevCharIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      
      const foundId = findCharId((item.value.content as any).head);
      afterId = foundId || "HEAD";
    } else {
      // Insert at the beginning or in empty item
      afterId = "HEAD";
    }
    
    const ops = doc.insertListItemText(blockId, itemId, inserted, afterId);
    ops.forEach(op => sendOp(op));
  }
}

// Handle table cell editing
let tableCellEditTimeout: number | null = null;
const previousTableCellTexts = new Map<string, string>();

function handleTableCellEdit(blockIndex: number, rowIndex: number, colIndex: number, newText: string) {
  if (!doc) return;
  
  const key = `${blockIndex}-${rowIndex}-${colIndex}`;
  const blockId = getBlockId(blockIndex);
  const rowId = getTableRowId(blockIndex, rowIndex);
  const colId = getTableColumnId(blockIndex, colIndex);
  const oldText = previousTableCellTexts.get(key) || doc.getTableCellText(blockId, rowId, colId);
  
  if (oldText === newText) return;
  
  // Clear previous timeout
  if (tableCellEditTimeout) clearTimeout(tableCellEditTimeout);
  
  // Debounce for better responsiveness
  tableCellEditTimeout = window.setTimeout(() => {
    applyTableCellTextEdit(blockId, rowId, colId, oldText, newText);
    previousTableCellTexts.set(key, newText);
  }, 100);
}

// Apply table cell text edits as CRDT operations (diff-based)
function applyTableCellTextEdit(blockId: CRDTId, rowId: CRDTId, colId: CRDTId, oldText: string, newText: string) {
  if (!doc) return;
  
  // Find the diff
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++;
  }
  
  let oldEnd = oldText.length - 1;
  let newEnd = newText.length - 1;
  while (oldEnd >= start && newEnd >= start && oldText[oldEnd] === newText[newEnd]) {
    oldEnd--;
    newEnd--;
  }
  
  const deleted = oldText.slice(start, oldEnd + 1);
  const inserted = newText.slice(start, newEnd + 1);
  
  // Get visible characters
  const block = doc.getBlock(blockId);
  if (!block || !(block instanceof TableBlock)) return;
  
  const cell = block.cells.getCell(rowId, colId);
  if (!cell) {
    // Cell doesn't exist yet, just insert
    if (inserted.length > 0) {
      const ops = doc.insertTableCellText(blockId, rowId, colId, inserted);
      ops.forEach(op => sendOp(op));
    }
    return;
  }
  
  const chars = cell.content.visible();
  
  // Delete characters
  for (let i = 0; i < deleted.length; i++) {
    const charIndex = start;
    if (charIndex < chars.length) {
      // Find the character ID at this index
      let currentIndex = 0;
      const findCharId = (node: any): CRDTId | null => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === charIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      
      const charId = findCharId((cell.content as any).head);
      if (charId) {
        const op = doc.deleteTableCellChar(blockId, rowId, colId, charId);
        sendOp(op);
      }
    }
  }
  
  // Insert characters
  if (inserted.length > 0) {
    const prevCharIndex = start - 1;
    let afterId: CRDTId;
    
    if (prevCharIndex >= 0 && chars.length > 0) {
      // Find the ID of the character before insertion point
      let currentIndex = 0;
      const findCharId = (node: any): CRDTId | null => {
        for (const child of node.children) {
          if (!child.deleted) {
            if (currentIndex === prevCharIndex) {
              return child.id;
            }
            currentIndex++;
          }
          const found = findCharId(child);
          if (found) return found;
        }
        return null;
      };
      
      const foundId = findCharId((cell.content as any).head);
      afterId = foundId || "HEAD";
    } else {
      // Insert at the beginning or in empty cell
      afterId = "HEAD";
    }
    
    const ops = doc.insertTableCellText(blockId, rowId, colId, inserted, afterId);
    ops.forEach(op => sendOp(op));
  }
}

// Handle keyboard shortcuts
function handleKeyDown(e: KeyboardEvent, blockIndex: number) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    addParagraphAfter(blockIndex);
  }
}

function handleListKeyDown(e: KeyboardEvent, blockIndex: number, itemIndex: number) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    addListItem(blockIndex);
  }
}

// Block operations
function addParagraph() {
  if (!doc) return;
  const op = doc.insertParagraphBlock();
  sendOp(op);
  
  // Smooth scroll to new block
  setTimeout(() => {
    const blocks = editorEl.querySelectorAll('.block');
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
      lastBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = lastBlock.querySelector('[contenteditable]');
      if (input) input.focus();
    }
  }, 100);
}

function addParagraphAfter(blockIndex: number) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const op = doc.insertParagraphBlock(blockId);
  sendOp(op);
  
  // Focus the new paragraph
  setTimeout(() => {
    const blocks = editorEl.querySelectorAll('.block');
    const newBlock = blocks[blockIndex + 1];
    if (newBlock) {
      const input = newBlock.querySelector('[contenteditable]');
      if (input) input.focus();
    }
  }, 100);
}

function addList() {
  if (!doc) return;
  const op = doc.insertListBlock("bullet");
  sendOp(op);
  
  // Add first item
  const blockId = op.id;
  const itemOp = doc.insertListItem(blockId);
  sendOp(itemOp);
  
  // Smooth scroll and focus
  setTimeout(() => {
    const blocks = editorEl.querySelectorAll('.block');
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
      lastBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = lastBlock.querySelector('li[contenteditable]');
      if (input) input.focus();
    }
  }, 100);
}

function addListItem(blockIndex: number) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const op = doc.insertListItem(blockId);
  sendOp(op);
}

function addTable() {
  if (!doc) return;
  const tableOp = doc.insertTableBlock();
  sendOp(tableOp);
  
  const blockId = tableOp.id;
  
  // Add 2 rows and 2 columns
  const row1Op = doc.insertTableRow(blockId);
  sendOp(row1Op);
  const row2Op = doc.insertTableRow(blockId, row1Op.id);
  sendOp(row2Op);
  
  const col1Op = doc.insertTableColumn(blockId);
  sendOp(col1Op);
  const col2Op = doc.insertTableColumn(blockId, col1Op.id);
  sendOp(col2Op);
  
  // Smooth scroll and focus first cell
  setTimeout(() => {
    const blocks = editorEl.querySelectorAll('.block');
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
      lastBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const firstCell = lastBlock.querySelector('td[contenteditable]');
      if (firstCell) firstCell.focus();
    }
  }, 100);
}

function addTableRow(blockIndex: number) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const op = doc.insertTableRow(blockId);
  sendOp(op);
}

function addTableColumn(blockIndex: number) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const op = doc.insertTableColumn(blockId);
  sendOp(op);
}

function deleteBlock(blockIndex: number) {
  if (!doc) return;
  const blockId = getBlockId(blockIndex);
  const op = doc.deleteBlock(blockId);
  sendOp(op);
}

// Move block by deleting and re-inserting
function moveBlock(fromIndex: number, toIndex: number) {
  if (!doc) return;
  
  console.log(`moveBlock called: from ${fromIndex} to ${toIndex}`);
  
  const blocks = doc.visibleBlocks();
  
  if (fromIndex < 0 || fromIndex >= blocks.length) {
    console.error(`Invalid fromIndex: ${fromIndex}`);
    return;
  }
  
  if (toIndex < 0 || toIndex >= blocks.length) {
    console.error(`Invalid toIndex: ${toIndex}`);
    return;
  }
  
  if (fromIndex === toIndex) {
    console.log(`Same position, no move needed`);
    return;
  }
  
  const blockToMove = blocks[fromIndex];
  console.log(`Moving block type: ${blockToMove.type}`);
  
  // Get the block ID to delete
  const blockIdToDelete = getBlockId(fromIndex);
  
  // Determine the "after" position for re-insertion
  // When moving up: insert after the block at toIndex-1
  // When moving down: insert after the block at toIndex (because we'll delete first)
  let afterId: CRDTId = "HEAD";
  
  if (fromIndex < toIndex) {
    // Moving down: insert after toIndex
    afterId = getBlockId(toIndex);
    console.log(`Moving down: inserting after block ${toIndex}`);
  } else {
    // Moving up: insert after toIndex-1 (or HEAD if toIndex is 0)
    if (toIndex > 0) {
      afterId = getBlockId(toIndex - 1);
      console.log(`Moving up: inserting after block ${toIndex - 1}`);
    } else {
      console.log(`Moving up: inserting at HEAD`);
    }
  }
  
  // Clone the block content before deleting
  const text = blockToMove.toString();
  console.log(`Block content: "${text}"`);
  
  // Delete the original block
  console.log(`Deleting block at index ${fromIndex}`);
  const deleteOp = doc.deleteBlock(blockIdToDelete);
  sendOp(deleteOp);
  
  // Re-insert at new position
  if (blockToMove instanceof ParagraphBlock) {
    console.log(`Re-inserting paragraph block`);
    const insertOp = doc.insertParagraphBlock(afterId);
    sendOp(insertOp);
    // Copy text content
    if (text) {
      const textOps = doc.insertText(insertOp.id, text);
      textOps.forEach(op => sendOp(op));
    }
  } else if (blockToMove instanceof ListBlock) {
    console.log(`Re-inserting list block`);
    const insertOp = doc.insertListBlock(blockToMove.style, afterId);
    sendOp(insertOp);
    // Copy list items
    const items = blockToMove.items.visible();
    let prevItemId: CRDTId = "HEAD";
    items.forEach(item => {
      const itemOp = doc.insertListItem(insertOp.id, prevItemId);
      sendOp(itemOp);
      const itemText = item.content.visible().join("");
      if (itemText) {
        const textOps = doc.insertListItemText(insertOp.id, itemOp.id, itemText);
        textOps.forEach(op => sendOp(op));
      }
      prevItemId = itemOp.id;
    });
  } else if (blockToMove instanceof TableBlock) {
    console.log(`Re-inserting table block`);
    const insertOp = doc.insertTableBlock(afterId);
    sendOp(insertOp);
    
    // Copy rows
    const rows = blockToMove.rows.visible();
    let prevRowId: CRDTId = "HEAD";
    rows.forEach(() => {
      const rowOp = doc.insertTableRow(insertOp.id, prevRowId);
      sendOp(rowOp);
      prevRowId = rowOp.id;
    });
    
    // Copy columns
    const cols = blockToMove.columns.visible();
    let prevColId: CRDTId = "HEAD";
    cols.forEach(() => {
      const colOp = doc.insertTableColumn(insertOp.id, prevColId);
      sendOp(colOp);
      prevColId = colOp.id;
    });
    
    // Copy cell content
    const rowIds: CRDTId[] = [];
    const colIds: CRDTId[] = [];
    const getIds = (node: any, ids: CRDTId[]) => {
      for (const child of node.children) {
        if (!child.deleted) ids.push(child.id);
        getIds(child, ids);
      }
    };
    getIds((blockToMove.rows as any).head, rowIds);
    getIds((blockToMove.columns as any).head, colIds);
    
    // Get new row/col IDs
    const newBlock = doc.getBlock(insertOp.id) as TableBlock;
    const newRowIds: CRDTId[] = [];
    const newColIds: CRDTId[] = [];
    getIds((newBlock.rows as any).head, newRowIds);
    getIds((newBlock.columns as any).head, newColIds);
    
    rowIds.forEach((oldRowId, ri) => {
      colIds.forEach((oldColId, ci) => {
        const text = blockToMove.cells.getCell(oldRowId, oldColId)?.content.visible().join("") || "";
        if (text && newRowIds[ri] && newColIds[ci]) {
          const textOps = doc.insertTableCellText(insertOp.id, newRowIds[ri], newColIds[ci], text);
          textOps.forEach(op => sendOp(op));
        }
      });
    });
  }
  
  // Force a render after a short delay to ensure UI updates
  console.log(`Move complete, forcing render`);
  setTimeout(() => {
    renderDocument();
  }, 100);
}

// Toggle online/offline
function toggleOnline() {
  const wasOffline = !isOnline;
  isOnline = !isOnline;
  
  console.log(`Toggling to ${isOnline ? 'ONLINE' : 'OFFLINE'} mode`);
  
  if (isOnline && wsReady && wasOffline) {
    // When going back online:
    // 1. First request sync to get missed operations
    console.log(`Requesting sync for missed operations (have ${pendingOps.length} pending to send)`);
    ws.send(JSON.stringify({ type: "sync_request", replicaId }));
    
    // 2. Then immediately flush pending operations
    // The server has already updated lastSeenOpIndex, so we won't get these back
    console.log(`Flushing ${pendingOps.length} pending operations`);
    const opsToSend = [...pendingOps];
    pendingOps.length = 0; // Clear the queue
    
    opsToSend.forEach(op => {
      console.log(`Sending queued operation:`, op.kind);
      ws.send(JSON.stringify({ type: "operation", op }));
    });
  }
  
  ws.send(JSON.stringify({ type: "status", replicaId, online: isOnline }));
  updateStatus();
}

// Update status display
function updateStatus() {
  const status = wsReady ? (isOnline ? "Online" : "Offline") : "Disconnected";
  statusEl.textContent = status;
  statusEl.className = `status ${status.toLowerCase()}`;
  
  if (toggleOnlineBtn) {
    toggleOnlineBtn.textContent = isOnline ? "Go Offline" : "Go Online";
  }
}

// Render presence
function renderPresence() {
  presenceEl.innerHTML = "";
  
  for (const [id, info] of presenceMap.entries()) {
    const badge = document.createElement("span");
    badge.className = `presence-badge ${info.online ? "online" : "offline"}`;
    badge.textContent = `${info.name} (R${id})`;
    
    if (id === replicaId) {
      badge.classList.add("self");
    }
    
    presenceEl.appendChild(badge);
  }
}

// Event listeners
addParagraphBtn?.addEventListener("click", addParagraph);
addListBtn?.addEventListener("click", addList);
addTableBtn?.addEventListener("click", addTable);
toggleOnlineBtn?.addEventListener("click", toggleOnline);

// Initialize
init();
updateStatus();


// ============================================================================
// ALGORITHM INSPECTOR - UI Elements and Display Functions
// ============================================================================

const operationLogEl = document.getElementById("operation-log") as HTMLElement;
const rgaTreeEl = document.getElementById("rga-tree") as HTMLElement;
const conflictLogEl = document.getElementById("conflict-log") as HTMLElement;
const documentStateEl = document.getElementById("document-state") as HTMLElement;
const showTombstonesCheckbox = document.getElementById("show-tombstones") as HTMLInputElement;

// Tab switching
const viewToggleBtns = document.querySelectorAll(".view-toggle-btn");
const tabContents = document.querySelectorAll(".tab-content");

viewToggleBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const tabName = (btn as HTMLElement).dataset.tab;
    
    // Update active states
    viewToggleBtns.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));
    
    btn.classList.add("active");
    document.getElementById(`tab-${tabName}`)?.classList.add("active");
    
    // Refresh inspector when switching to it
    if (tabName === "inspector") {
      updateInspector();
    }
  });
});

showTombstonesCheckbox?.addEventListener("change", () => {
  updateRGATree();
});

// Update operation log display
function updateOperationLog() {
  if (!operationLogEl) return;
  
  operationLogEl.innerHTML = "";
  
  // Show most recent first
  const recentOps = [...operationHistory].reverse().slice(0, 20);
  
  recentOps.forEach(({ op, timestamp, source }) => {
    const entry = document.createElement("div");
    entry.className = `operation-entry ${getOperationClass(op.kind)}`;
    
    const header = document.createElement("div");
    header.className = "operation-header";
    
    const type = document.createElement("span");
    type.className = "operation-type";
    type.textContent = op.kind.replace(/_/g, " ");
    
    const replica = document.createElement("span");
    replica.className = "operation-replica";
    replica.textContent = `${source} • ${new Date(timestamp).toLocaleTimeString()}`;
    
    header.appendChild(type);
    header.appendChild(replica);
    
    const details = document.createElement("div");
    details.className = "operation-details";
    details.innerHTML = formatOperationDetails(op);
    
    entry.appendChild(header);
    entry.appendChild(details);
    
    operationLogEl.appendChild(entry);
  });
  
  // Auto-scroll to top (most recent)
  operationLogEl.scrollTop = 0;
}

function getOperationClass(kind: string): string {
  if (kind.includes("insert")) return "insert";
  if (kind.includes("delete")) return "delete";
  if (kind.includes("block")) return "block";
  return "";
}

function formatOperationDetails(op: CRDTOp): string {
  const id = (op as any).id;
  const idStr = Array.isArray(id) ? `<span class="operation-id">[${id[0]}, ${id[1]}]</span>` : "";
  
  switch (op.kind) {
    case "insert_block":
      return `Block type: ${(op as any).block.type} • ID: ${idStr}`;
    case "delete_block":
      return `ID: ${idStr}`;
    case "insert_char":
      return `Char: "${(op as any).char}" • ID: ${idStr} • After: ${formatId((op as any).after)}`;
    case "delete_char":
      return `ID: ${idStr}`;
    case "insert_list_item":
      return `ID: ${idStr}`;
    case "insert_list_char":
      return `Char: "${(op as any).char}" • ID: ${idStr}`;
    case "insert_cell_char":
      return `Char: "${(op as any).char}" • ID: ${idStr}`;
    default:
      return `ID: ${idStr}`;
  }
}

function formatId(id: CRDTId): string {
  if (id === "HEAD") return "HEAD";
  return `[${id[0]}, ${id[1]}]`;
}

// Update RGA tree visualization
function updateRGATree() {
  if (!rgaTreeEl || !doc) return;
  
  const showTombstones = showTombstonesCheckbox?.checked ?? true;
  
  // Visualize the blocks RGA
  const blocksRGA = (doc as any).blocks;
  const treeHtml = renderRGANode(blocksRGA.head, showTombstones, 0);
  rgaTreeEl.innerHTML = treeHtml;
  
  // Auto-scroll to top
  rgaTreeEl.scrollTop = 0;
}

function renderRGANode(node: any, showTombstones: boolean, depth: number): string {
  if (!node) return "";
  
  const isHead = node.id === "HEAD";
  const isDeleted = node.deleted && !isHead;
  
  if (isDeleted && !showTombstones) {
    // Still render children
    let childrenHtml = "";
    for (const child of node.children) {
      childrenHtml += renderRGANode(child, showTombstones, depth);
    }
    return childrenHtml;
  }
  
  const nodeClass = `tree-node ${isHead ? "head" : ""} ${isDeleted ? "deleted" : ""}`;
  const indent = depth * 20;
  
  let value = "HEAD";
  if (!isHead && node.value) {
    if (typeof node.value === "string") {
      value = node.value;
    } else if (node.value.type) {
      value = `${node.value.type} block`;
    } else {
      value = "node";
    }
  }
  
  const idStr = isHead ? "" : formatId(node.id);
  const replicaId = Array.isArray(node.id) ? node.id[0] : 0;
  
  let html = `
    <div class="${nodeClass}" style="margin-left: ${indent}px">
      <div class="tree-node-content">
        <span class="tree-node-value">${value}</span>
        ${idStr ? `<span class="tree-node-id">${idStr}</span>` : ""}
        ${replicaId > 0 ? `<span class="tree-node-replica" style="background: ${getReplicaColor(replicaId)}">R${replicaId}</span>` : ""}
      </div>
    </div>
  `;
  
  // Render children
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      html += renderRGANode(child, showTombstones, depth + 1);
    }
  }
  
  return html;
}

function getReplicaColor(id: number): string {
  const colors = [
    "rgba(13, 110, 253, 0.2)",   // blue
    "rgba(220, 53, 69, 0.2)",    // red
    "rgba(25, 135, 84, 0.2)",    // green
    "rgba(255, 193, 7, 0.2)",    // yellow
    "rgba(111, 66, 193, 0.2)",   // purple
  ];
  return colors[(id - 1) % colors.length];
}

function updateConflictLog() {
  if (!conflictLogEl) return;
  
  conflictLogEl.innerHTML = "";
  
  if (conflictHistory.length === 0) {
    conflictLogEl.innerHTML = '<div class="conflict-empty">No concurrent operations detected yet. Open this page in multiple tabs and type at the same position simultaneously to see how CRDTs handle concurrent edits!</div>';
    return;
  }
  
  // Show most recent first
  const recentConflicts = [...conflictHistory].reverse();
  
  recentConflicts.forEach(({ description, resolution, timestamp }) => {
    const entry = document.createElement("div");
    entry.className = "conflict-entry";
    
    const header = document.createElement("div");
    header.className = "conflict-header";
    header.textContent = `🔀 ${description}`;
    
    const time = document.createElement("div");
    time.className = "conflict-description";
    time.textContent = new Date(timestamp).toLocaleTimeString();
    
    const resolutionEl = document.createElement("div");
    resolutionEl.className = "conflict-resolution";
    resolutionEl.textContent = resolution;
    
    entry.appendChild(header);
    entry.appendChild(time);
    entry.appendChild(resolutionEl);
    
    conflictLogEl.appendChild(entry);
  });
  
  // Auto-scroll to top (most recent)
  conflictLogEl.scrollTop = 0;
}

// Update document state display
function updateDocumentState() {
  if (!documentStateEl || !doc) return;
  
  const blocks = doc.visibleBlocks();
  const blockCount = blocks.length;
  const totalChars = blocks.reduce((sum, block) => {
    if (block.toString) {
      return sum + block.toString().length;
    }
    return sum;
  }, 0);
  
  documentStateEl.innerHTML = `
    <div class="state-section">
      <div class="state-label">Replica ID</div>
      <div class="state-value">${replicaId}</div>
    </div>
    <div class="state-section">
      <div class="state-label">Block Count</div>
      <div class="state-value">${blockCount}</div>
    </div>
    <div class="state-section">
      <div class="state-label">Total Characters</div>
      <div class="state-value">${totalChars}</div>
    </div>
    <div class="state-section">
      <div class="state-label">Operations Received</div>
      <div class="state-value">${operationHistory.length}</div>
    </div>
    <div class="state-section">
      <div class="state-label">Concurrent Operations</div>
      <div class="state-value">${conflictHistory.length}</div>
    </div>
  `;
}

// Update all inspector panels
function updateInspector() {
  updateOperationLog();
  updateRGATree();
  updateConflictLog();
  updateDocumentState();
}
