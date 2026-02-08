import { RgaReplica } from "../../text-crdt/src/rgaReplica.mjs";
import { InsertOp, DeleteOp } from "../../text-crdt/src/operation.mjs";
import { Identifier } from "../../text-crdt/src/identifier.mjs";

type ReplicaKey = "A" | "B" | "C";

type SimOp =
  | {
      channel: "sim";
      type: "insert";
      source: ReplicaKey;
      sourceId: number;
      id: { counter: number; replicaId: number };
      prevId: { counter: number; replicaId: number };
      value: string;
    }
  | {
      channel: "sim";
      type: "delete";
      source: ReplicaKey;
      sourceId: number;
      targetId: { counter: number; replicaId: number };
    };

type LiveOp =
  | {
      channel: "live";
      type: "insert";
      sourceId: number;
      sourceLabel: string;
      id: { counter: number; replicaId: number };
      prevId: { counter: number; replicaId: number };
      value: string;
    }
  | {
      channel: "live";
      type: "delete";
      sourceId: number;
      sourceLabel: string;
      targetId: { counter: number; replicaId: number };
    };

type AnyOp = SimOp | LiveOp;

const replicaMeta = {
  A: { id: 1, color: "#60a5fa" },
  B: { id: 2, color: "#f472b6" },
  C: { id: 3, color: "#34d399" }
} as const;

const ws = new WebSocket(`ws://${location.host}`);
let wsReady = false;

const outboxes: Record<ReplicaKey, SimOp[]> = { A: [], B: [], C: [] };
const flushTimers: Partial<Record<ReplicaKey, number>> = {};

const inspectorSelect = document.getElementById("inspector-replica") as HTMLSelectElement;
const treeEl = document.getElementById("tree") as HTMLElement;
const listView = document.getElementById("list-view") as HTMLElement;
const globalLog = document.getElementById("op-log") as HTMLElement;
const rawToggle = document.getElementById("raw-toggle") as HTMLInputElement;
const scenarioStatus = document.getElementById("scenario-status") as HTMLElement;
const tabs = Array.from(document.querySelectorAll(".tab")) as HTMLButtonElement[];
const tabPanels = {
  scenarios: document.getElementById("tab-scenarios") as HTMLElement,
  realtime: document.getElementById("tab-realtime") as HTMLElement
};

const liveEditor = document.getElementById("live-editor") as HTMLTextAreaElement;
const liveOutput = document.getElementById("live-output") as HTMLElement;
const liveLog = document.getElementById("live-log") as HTMLElement;
const liveRawToggle = document.getElementById("live-raw-toggle") as HTMLInputElement;
const liveTree = document.getElementById("live-tree") as HTMLElement;
const presenceBar = document.getElementById("presence-bar") as HTMLElement;
const livePresence = new Map<number, boolean>();
const liveOpHistory: LiveOp[] = [];
const globalOpHistory: SimOp[] = [];
const liveEvents = document.getElementById("live-events") as HTMLElement;
const liveToggle = document.getElementById("live-toggle") as HTMLButtonElement;
const liveClock = document.getElementById("live-clock") as HTMLElement;
const liveTitle = document.getElementById("live-title") as HTMLElement;
const liveConnection = document.getElementById("live-connection") as HTMLElement;
const pendingLiveOps: LiveOp[] = [];

const storedLiveId = Number(window.sessionStorage.getItem("liveReplicaId"));
const liveState = {
  id: Number.isInteger(storedLiveId) && storedLiveId > 0 ? storedLiveId : 0,
  label: "R?",
  replica: new RgaReplica(0),
  lastText: "",
  visible: [] as { id: Identifier; value: string }[],
  online: true,
  pending: [] as LiveOp[],
  clock: 0
};
const scenarioProgress: Record<string, number> = {};

function flattenVisible(node: { id: Identifier; value: string; deleted: boolean; children: any[] }, out: any[]) {
  for (const child of node.children) {
    if (!child.deleted) {
      out.push({ id: child.id, value: child.value });
    }
    flattenVisible(child, out);
  }
}

function getVisible(replica: RgaReplica) {
  const doc = replica.document() as any;
  const out: { id: Identifier; value: string }[] = [];
  flattenVisible(doc.head, out);
  return out;
}

function renderTree(node: any): string {
  if (!node) return "";
  const label = node.value === "" ? "HEAD" : node.value;
  const deleted = node.deleted ? " tombstone" : "";
  const replica = node.id.replicaId;
  const replicaKey = replica === 1 ? "A" : replica === 2 ? "B" : replica === 3 ? "C" : "";
  const inner = node.children.map(renderTree).join("");
  return `<li class="${deleted}" data-id="${node.id.counter}:${node.id.replicaId}" data-replica="${replicaKey}"><span class="tombstone-label">${label}</span> <span class="muted">${node.id.counter},${node.id.replicaId}</span>${node.children.length ? `<ul>${inner}</ul>` : ""}</li>`;
}

function liveReplicaColor(id: number) {
  if (id === 1) return "#60a5fa";
  if (id === 2) return "#f472b6";
  if (id === 3) return "#34d399";
  return `hsl(${(id * 47) % 360} 70% 60%)`;
}

function renderLiveTree(node: any, depth = 0, rows: string[] = []): string {
  if (!node) return "";
  const isHead = node.value === "";
  const label = isHead ? "HEAD" : node.value;
  const meta = `${node.id.counter},${node.id.replicaId}`;
  const deletedClass = node.deleted && !isHead ? " tree-node-deleted" : "";
  const padding = depth * 14;
  const badge = isHead
    ? ""
    : `<span class="tree-node-badge" style="background:${liveReplicaColor(node.id.replicaId)}">R${node.id.replicaId}</span>`;

  rows.push(
    `<div class="tree-row${deletedClass}" style="padding-left:${padding}px">${badge}<span class="tree-node-label">${label}</span><span class="tree-node-meta">${meta}</span></div>`
  );

  node.children.forEach((child: any) => renderLiveTree(child, depth + 1, rows));
  return rows.join("");
}

function renderList(visible: { id: Identifier; value: string }[]) {
  if (!visible.length) return "(empty)";
  return visible.map((item) => `${item.value}[${item.id.counter},${item.id.replicaId}]`).join(" -> ");
}

function renderOp(op: SimOp) {
  if (op.type === "insert") {
    return `INSERT | Replica ${op.source} | '${op.value}' after (${op.prevId.counter},${op.prevId.replicaId}) → id (${op.id.counter},${op.id.replicaId})`;
  }
  return `DELETE | Replica ${op.source} | target (${op.targetId.counter},${op.targetId.replicaId})`;
}

function renderLiveOp(op: LiveOp) {
  if (op.type === "insert") {
    return `INSERT | ${op.sourceLabel} | '${op.value}' after (${op.prevId.counter},${op.prevId.replicaId}) → id (${op.id.counter},${op.id.replicaId})`;
  }
  return `DELETE | ${op.sourceLabel} | target (${op.targetId.counter},${op.targetId.replicaId})`;
}

function updateLiveUI() {
  liveEditor.disabled = liveState.id === 0;
  liveState.visible = getVisible(liveState.replica);
  const text = liveState.replica.document().getText();
  liveState.lastText = text;
  liveEditor.value = text;
  liveOutput.textContent = text || "(empty)";
  liveClock.textContent = `Clock: ${liveState.clock}`;
  liveTitle.textContent = `Replica ${liveState.label}`;
  liveConnection.textContent = liveState.online ? "Online" : "Offline";
  const doc = liveState.replica.document() as any;
  liveTree.innerHTML = renderLiveTree(doc.head);
}

function renderLiveTimeline() {
  liveLog.innerHTML = "";
  const showRaw = !!liveRawToggle?.checked;
  liveOpHistory.slice().reverse().forEach((op) => {
    const row = document.createElement("div");
    row.className = "op-row";
    row.textContent = renderLiveOp(op);
    if (showRaw) {
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(op, null, 2);
      row.appendChild(pre);
    }
    liveLog.appendChild(row);
  });
  const first = liveLog.querySelector(".op-row");
  if (first) first.classList.add("active");
}

function appendLiveLog(op: LiveOp) {
  liveOpHistory.push(op);
  renderLiveTimeline();
}

function renderPresence(entries: Array<{ id: number; online: boolean }>) {
  presenceBar.innerHTML = "";
  livePresence.clear();
  entries.forEach((entry) => livePresence.set(entry.id, entry.online));
  for (const [id, online] of livePresence.entries()) {
    const item = document.createElement("span");
    item.className = "badge";
    item.innerHTML = `<span class="presence-dot" style="background:${online ? "#22c55e" : "#ef4444"}"></span>R${id}`;
    if (id === liveState.id) {
      item.style.borderColor = "#22c55e";
    }
    presenceBar.appendChild(item);
  }
}

function appendLiveEvent(text: string) {
  const row = document.createElement("div");
  row.className = "op-row";
  row.textContent = text;
  liveEvents.prepend(row);
}

function appendGlobalLog(op: SimOp) {
  globalOpHistory.push(op);
  renderGlobalTimeline();
  const first = globalLog.querySelector(".op-row");
  if (first) {
    first.classList.add("active");
    first.classList.add("pulse");
    window.setTimeout(() => first.classList.remove("pulse"), 300);
  }
}

function renderGlobalTimeline() {
  globalLog.innerHTML = "";
  const showRaw = !!rawToggle?.checked;
  globalOpHistory.slice().reverse().forEach((op) => {
    const row = document.createElement("div");
    row.className = "op-row";
    if (showRaw) {
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(op, null, 2);
      row.appendChild(pre);
    } else {
      row.textContent = renderOp(op);
    }
    globalLog.appendChild(row);
  });
  const first = globalLog.querySelector(".op-row");
  if (first) first.classList.add("active");
}

function updateInspector(replicaKey: ReplicaKey) {
  const state = replicas[replicaKey];
  const doc = state.replica.document() as any;
  treeEl.innerHTML = `<ul>${renderTree(doc.head)}</ul>`;
  listView.textContent = renderList(state.visible);
}

function setActiveReplica(replicaKey: ReplicaKey) {
  for (const key of Object.keys(replicas) as ReplicaKey[]) {
    const panel = document.querySelector(`[data-replica="${key}"]`) as HTMLElement;
    if (panel) panel.classList.toggle("replica-active", key === replicaKey);
  }
}

function highlightTreeNode(id: { counter: number; replicaId: number }) {
  const node = treeEl.querySelector(`[data-id="${id.counter}:${id.replicaId}"]`) as HTMLElement | null;
  if (!node) return;
  node.classList.add("spotlight");
  window.setTimeout(() => node.classList.remove("spotlight"), 300);
}

function highlightReplicaText(replicaKey: ReplicaKey, id: { counter: number; replicaId: number }) {
  const state = replicas[replicaKey];
  const index = state.visible.findIndex((item) => item.id.counter === id.counter && item.id.replicaId === id.replicaId);
  const panel = document.querySelector(`[data-replica="${replicaKey}"]`) as HTMLElement;
  const output = panel?.querySelector(".replica-output") as HTMLElement;
  if (!output) return;
  const text = state.replica.document().getText();
  if (index < 0) {
    output.textContent = text || "(empty)";
    return;
  }
  const parts = text.split("");
  output.innerHTML = parts
    .map((ch, i) => (i === index ? `<span class="spotlight">${ch}</span>` : ch))
    .join("");
}

function spotlightOp(op: SimOp) {
  setActiveReplica(op.source);
  const id = op.type === "insert" ? op.id : op.targetId;
  highlightTreeNode(id);
  for (const key of Object.keys(replicas) as ReplicaKey[]) {
    highlightReplicaText(key, id);
  }
  const active = globalLog.querySelector(".op-row.active") as HTMLElement | null;
  if (active) {
    active.classList.add("pulse");
    window.setTimeout(() => active.classList.remove("pulse"), 300);
  }
}

function setScenarioStatus(text: string) {
  if (scenarioStatus) scenarioStatus.textContent = text;
}

function makeId(replicaKey: ReplicaKey, counter: number) {
  return { counter, replicaId: replicaMeta[replicaKey].id };
}

function headId() {
  return { counter: 0, replicaId: 0 };
}

function makeInsert(source: ReplicaKey, counter: number, prev: { counter: number; replicaId: number }, value: string): SimOp {
  return { channel: "sim", type: "insert", source, sourceId: replicaMeta[source].id, id: makeId(source, counter), prevId: prev, value };
}

function makeDelete(source: ReplicaKey, target: { counter: number; replicaId: number }): SimOp {
  return { channel: "sim", type: "delete", source, sourceId: replicaMeta[source].id, targetId: target };
}

function setReplicaOnline(replicaKey: ReplicaKey, online: boolean) {
  const state = replicas[replicaKey];
  state.online = online;
  const panel = document.querySelector(`[data-replica="${replicaKey}"]`) as HTMLElement;
  if (panel) {
    const status = panel.querySelector(".replica-status") as HTMLElement;
    const toggle = panel.querySelector(".replica-toggle") as HTMLButtonElement;
    status.textContent = online ? "Online" : "Offline";
    toggle.textContent = online ? "Go offline" : "Go online";
  }
  if (online) {
    while (state.pending.length) {
      enqueueOp(replicaKey, state.pending.shift()!);
    }
  }
}

function resetAllReplicas() {
  for (const key of Object.keys(replicas) as ReplicaKey[]) {
    replicas[key].replica = new RgaReplica(replicaMeta[key].id);
    replicas[key].lastText = "";
    replicas[key].visible = [];
    replicas[key].localClock = 0;
    replicas[key].pending = [];
    setReplicaOnline(key, true);
    const panel = document.querySelector(`[data-replica="${key}"]`) as HTMLElement;
    if (panel) {
      panel.dataset.lastOp = "";
      const timeline = panel.querySelector(".replica-timeline") as HTMLElement;
      timeline.innerHTML = "";
    }
    updateReplicaUI(key);
  }
  globalLog.innerHTML = "";
  updateInspector(inspectorSelect.value as ReplicaKey);
}

function sendScenarioOp(op: SimOp) {
  if (wsReady) {
    ws.send(JSON.stringify({ type: "op", op }));
  } else {
    outboxes.A.push(op);
    scheduleFlush("A");
  }
  applyRemoteOp(op);
}

function scheduleFlush(replicaKey: ReplicaKey) {
  if (flushTimers[replicaKey]) return;
  flushTimers[replicaKey] = window.setTimeout(() => {
    const queue = outboxes[replicaKey];
    while (queue.length) {
      if (!wsReady) break;
      ws.send(JSON.stringify({ type: "op", op: queue.shift() }));
    }
    flushTimers[replicaKey] = undefined;
  }, 0);
}

function enqueueOp(replicaKey: ReplicaKey, op: SimOp) {
  const state = replicas[replicaKey];
  if (!state.online) {
    state.pending.push(op);
    return;
  }
  if (!wsReady) {
    outboxes[replicaKey].push(op);
    scheduleFlush(replicaKey);
  } else {
    ws.send(JSON.stringify({ type: "op", op }));
  }
}

function enqueueLiveOp(op: LiveOp) {
  if (!liveState.online) {
    liveState.pending.push(op);
    return;
  }
  if (!wsReady) {
    liveState.pending.push(op);
    return;
  }
  ws.send(JSON.stringify({ type: "op", op }));
}

const replicas: Record<ReplicaKey, {
  key: ReplicaKey;
  replica: RgaReplica;
  lastText: string;
  visible: { id: Identifier; value: string }[];
  localClock: number;
  online: boolean;
  pending: SimOp[];
}> = {
  A: { key: "A", replica: new RgaReplica(replicaMeta.A.id), lastText: "", visible: [], localClock: 0, online: true, pending: [] },
  B: { key: "B", replica: new RgaReplica(replicaMeta.B.id), lastText: "", visible: [], localClock: 0, online: true, pending: [] },
  C: { key: "C", replica: new RgaReplica(replicaMeta.C.id), lastText: "", visible: [], localClock: 0, online: true, pending: [] }
};

function updateReplicaUI(replicaKey: ReplicaKey) {
  const state = replicas[replicaKey];
  state.visible = getVisible(state.replica);
  const text = state.replica.document().getText();
  state.lastText = text;

  const panel = document.querySelector(`[data-replica="${replicaKey}"]`) as HTMLElement;
  if (!panel) return;

  const textarea = panel.querySelector("textarea") as HTMLTextAreaElement;
  const output = panel.querySelector(".replica-output") as HTMLElement;
  const clockEl = panel.querySelector(".replica-clock") as HTMLElement;
  const lastOpEl = panel.querySelector(".replica-lastop") as HTMLElement;

  textarea.value = text;
  output.textContent = text || "(empty)";
  clockEl.textContent = String(state.localClock);
  lastOpEl.textContent = panel.dataset.lastOp || "—";

  if (inspectorSelect.value === replicaKey) {
    updateInspector(replicaKey);
  }
}

function applyRemoteOp(op: SimOp) {
  for (const key of Object.keys(replicas) as ReplicaKey[]) {
    const state = replicas[key];
    if (op.type === "insert") {
      const id = new Identifier(op.id.counter, op.id.replicaId);
      const prevId = new Identifier(op.prevId.counter, op.prevId.replicaId);
      state.replica.apply(new InsertOp(id, prevId, op.value));
    } else {
      const targetId = new Identifier(op.targetId.counter, op.targetId.replicaId);
      state.replica.apply(new DeleteOp(targetId));
    }
    updateReplicaUI(key);
  }
  if (op.type === "insert") {
    const source = replicas[op.source];
    if (source) source.localClock = Math.max(source.localClock, op.id.counter);
  }
  panelSetLastOp(op.source, renderOp(op));
  spotlightOp(op);
}

function applyLiveOp(op: LiveOp) {
  if (op.type === "insert") {
    const id = new Identifier(op.id.counter, op.id.replicaId);
    const prevId = new Identifier(op.prevId.counter, op.prevId.replicaId);
    liveState.replica.apply(new InsertOp(id, prevId, op.value));
  } else {
    const targetId = new Identifier(op.targetId.counter, op.targetId.replicaId);
    liveState.replica.apply(new DeleteOp(targetId));
  }
  if (op.type === "insert") {
    liveState.clock = Math.max(liveState.clock, op.id.counter);
  }
  appendLiveLog(op);
  updateLiveUI();
}

function liveLocalEdit(nextText: string) {
  const edits = diffEdits(liveState.lastText, nextText);
  const doc = liveState.replica.document();
  const head = doc.headId();

  for (const edit of edits) {
    for (let i = 0; i < edit.removed.length; i++) {
      const target = liveState.visible[edit.start];
      if (!target) continue;
      const op = liveState.replica.delete(target.id);
      const payload: LiveOp = {
        channel: "live",
        type: "delete",
        sourceId: liveState.id,
        sourceLabel: liveState.label,
        targetId: { counter: op.targetId.counter, replicaId: op.targetId.replicaId }
      };
      enqueueLiveOp(payload);
      liveState.visible.splice(edit.start, 1);
    }
    for (let i = 0; i < edit.added.length; i++) {
      const prev = edit.start + i - 1;
      const prevId = prev < 0 ? head : liveState.visible[prev]?.id ?? head;
      const op = liveState.replica.insert(prevId, edit.added[i]);
      liveState.clock += 1;
      const payload: LiveOp = {
        channel: "live",
        type: "insert",
        sourceId: liveState.id,
        sourceLabel: liveState.label,
        id: { counter: op.id.counter, replicaId: op.id.replicaId },
        prevId: { counter: op.prevId.counter, replicaId: op.prevId.replicaId },
        value: op.value
      };
      enqueueLiveOp(payload);
      liveState.visible.splice(edit.start + i, 0, { id: op.id, value: op.value });
    }
  }

  updateLiveUI();
}

function diffEdits(prev: string, next: string) {
  if (prev === next) return [] as { start: number; removed: string; added: string }[];
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length - 1;
  let endNext = next.length - 1;
  while (endPrev >= start && endNext >= start && prev[endPrev] === next[endNext]) {
    endPrev--;
    endNext--;
  }
  return [{ start, removed: prev.slice(start, endPrev + 1), added: next.slice(start, endNext + 1) }];
}

function localEdit(replicaKey: ReplicaKey, nextText: string) {
  const state = replicas[replicaKey];
  const edits = diffEdits(state.lastText, nextText);
  const doc = state.replica.document();
  const headId = doc.headId();

  for (const edit of edits) {
    for (let i = 0; i < edit.removed.length; i++) {
      const target = state.visible[edit.start];
      if (!target) continue;
      const op = state.replica.delete(target.id);
      enqueueOp(replicaKey, { channel: "sim", type: "delete", source: replicaKey, sourceId: replicaMeta[replicaKey].id, targetId: { counter: op.targetId.counter, replicaId: op.targetId.replicaId } });
      const msg = `DELETE '${target.value}' @ (${op.targetId.counter},${op.targetId.replicaId})`;
      panelSetLastOp(replicaKey, msg);
      emitLocalLog(replicaKey, msg);
      state.visible.splice(edit.start, 1);
    }
    for (let i = 0; i < edit.added.length; i++) {
      const prev = edit.start + i - 1;
      const prevId = prev < 0 ? headId : state.visible[prev]?.id ?? headId;
      const op = state.replica.insert(prevId, edit.added[i]);
      state.localClock += 1;
      enqueueOp(replicaKey, {
        channel: "sim",
        type: "insert",
        source: replicaKey,
        sourceId: replicaMeta[replicaKey].id,
        id: { counter: op.id.counter, replicaId: op.id.replicaId },
        prevId: { counter: op.prevId.counter, replicaId: op.prevId.replicaId },
        value: op.value
      });
      const msg = `INSERT '${op.value}' after (${op.prevId.counter},${op.prevId.replicaId})`;
      panelSetLastOp(replicaKey, msg);
      emitLocalLog(replicaKey, msg);
      state.visible.splice(edit.start + i, 0, { id: op.id, value: op.value });
    }
  }

  updateReplicaUI(replicaKey);
}

function panelSetLastOp(replicaKey: ReplicaKey, text: string) {
  const panel = document.querySelector(`[data-replica="${replicaKey}"]`) as HTMLElement;
  if (panel) {
    panel.dataset.lastOp = text;
  }
}

function setupReplicaPanels() {
  for (const key of Object.keys(replicas) as ReplicaKey[]) {
    const panel = document.querySelector(`[data-replica="${key}"]`) as HTMLElement;
    if (!panel) continue;

    const textarea = panel.querySelector("textarea") as HTMLTextAreaElement;
    const toggle = panel.querySelector(".replica-toggle") as HTMLButtonElement;
    const status = panel.querySelector(".replica-status") as HTMLElement;
    const timeline = panel.querySelector(".replica-timeline") as HTMLElement;

    textarea.addEventListener("input", () => {
      localEdit(key, textarea.value);
    });

    toggle.addEventListener("click", () => {
      const state = replicas[key];
      state.online = !state.online;
      status.textContent = state.online ? "Online" : "Offline";
      toggle.textContent = state.online ? "Go offline" : "Go online";
      if (state.online) {
        while (state.pending.length) {
          enqueueOp(key, state.pending.shift()!);
        }
      }
    });

    panel.addEventListener("replica:op", (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const item = document.createElement("div");
      item.className = "op-row";
      item.textContent = detail;
      timeline.prepend(item);
      const prev = timeline.querySelector(".op-row.active");
      if (prev) prev.classList.remove("active");
      item.classList.add("active");
    });
  }
}

function emitLocalLog(replicaKey: ReplicaKey, text: string) {
  const panel = document.querySelector(`[data-replica="${replicaKey}"]`) as HTMLElement;
  if (panel) {
    panel.dispatchEvent(new CustomEvent("replica:op", { detail: text }));
  }
}

const scenarios: Record<string, { title: string; steps: Array<{ type: "op"; op: SimOp } | { type: "action"; run: () => void }>; expected: string }> = {
  "normal-seq": {
    title: "Normal — Sequential Inserts",
    expected: "Hi!",
    steps: [
      { type: "op", op: makeInsert("A", 1, headId(), "H") },
      { type: "op", op: makeInsert("A", 2, makeId("A", 1), "i") },
      { type: "op", op: makeInsert("A", 3, makeId("A", 2), "!") }
    ]
  },
  "normal-fork": {
    title: "Normal — Forked Replica",
    expected: "Hi!",
    steps: [
      { type: "op", op: makeInsert("A", 1, headId(), "H") },
      { type: "op", op: makeInsert("A", 2, makeId("A", 1), "i") },
      { type: "op", op: makeInsert("B", 1, makeId("A", 2), "!") }
    ]
  },
  "avg-concurrent-appends": {
    title: "Average — Concurrent Appends",
    expected: "Hi!",
    steps: [
      { type: "op", op: makeInsert("A", 1, headId(), "H") },
      { type: "op", op: makeInsert("C", 1, makeId("A", 1), "!") },
      { type: "op", op: makeInsert("B", 1, makeId("A", 1), "i") }
    ]
  },
  "avg-delete-insert": {
    title: "Average — Concurrent Delete + Insert",
    expected: "!?",
    steps: [
      { type: "op", op: makeInsert("A", 1, headId(), "H") },
      { type: "op", op: makeDelete("A", makeId("A", 1)) },
      { type: "op", op: makeInsert("B", 1, makeId("A", 1), "!") },
      { type: "op", op: makeInsert("C", 1, makeId("A", 1), "?") }
    ]
  },
  "worst-same-position": {
    title: "Worst — Concurrent Inserts at Same Position",
    expected: "ABC",
    steps: [
      { type: "op", op: makeInsert("B", 1, headId(), "B") },
      { type: "op", op: makeInsert("A", 1, headId(), "A") },
      { type: "op", op: makeInsert("C", 1, headId(), "C") }
    ]
  },
  "worst-duplicate": {
    title: "Worst — Out-of-Order + Duplicate Delivery",
    expected: "X",
    steps: [
      { type: "op", op: makeInsert("A", 1, headId(), "X") },
      { type: "op", op: makeInsert("A", 1, headId(), "X") }
    ]
  },
  "edge-offline": {
    title: "Edge — Offline Editing + Merge",
    expected: "Hi!",
    steps: [
      { type: "op", op: makeInsert("A", 1, headId(), "H") },
      { type: "action", run: () => setReplicaOnline("B", false) },
      { type: "action", run: () => localEdit("B", "Hi") },
      { type: "op", op: makeInsert("C", 1, makeId("A", 1), "!") },
      { type: "action", run: () => setReplicaOnline("B", true) }
    ]
  },
  "edge-delete-parent": {
    title: "Edge — Delete Parent Before Child Arrives",
    expected: "i",
    steps: [
      { type: "op", op: makeInsert("A", 1, headId(), "H") },
      { type: "op", op: makeDelete("A", makeId("A", 1)) },
      { type: "op", op: makeInsert("B", 1, makeId("A", 1), "i") }
    ]
  }
};

function resetScenario(name: string) {
  scenarioProgress[name] = 0;
  resetAllReplicas();
  setScenarioStatus(`${scenarios[name].title} reset. Expected result: all replicas converge to "${scenarios[name].expected}".`);
}

function stepScenario(name: string) {
  const scenario = scenarios[name];
  if (!scenario) return;
  const index = scenarioProgress[name] ?? 0;
  if (index >= scenario.steps.length) {
    setScenarioStatus(`${scenario.title} complete. Converged ✔ Expected: "${scenario.expected}"`);
    return;
  }
  const step = scenario.steps[index];
  if (step.type === "op") {
    sendScenarioOp(step.op);
  } else {
    step.run();
  }
  scenarioProgress[name] = index + 1;
  setScenarioStatus(`${scenario.title} step ${index + 1}/${scenario.steps.length}. Expected: "${scenario.expected}"`);
}

function runScenario(name: string) {
  resetScenario(name);
  let i = 0;
  const timer = window.setInterval(() => {
    if (i >= scenarios[name].steps.length) {
      window.clearInterval(timer);
      setScenarioStatus(`${scenarios[name].title} complete. Converged ✔ Expected: "${scenarios[name].expected}"`);
      return;
    }
    stepScenario(name);
    i++;
  }, 200);
}

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "hello" && Array.isArray(message.opLog)) {
    message.opLog.forEach((op: AnyOp) => {
      if (op.channel === "sim") applyRemoteOp(op);
      if (op.channel === "live") {
        if (liveState.id > 0) {
          applyLiveOp(op);
        } else {
          pendingLiveOps.push(op);
        }
      }
    });
  }
  if (message.type === "op" && message.op) {
    const op = message.op as AnyOp;
    if (op.channel === "sim") {
      applyRemoteOp(op);
      appendGlobalLog(op);
    }
    if (op.channel === "live") {
      applyLiveOp(op);
    }
  }
  if (message.type === "live-welcome") {
    liveState.id = message.replicaId;
    liveState.label = `R${message.replicaId}`;
    liveState.replica = new RgaReplica(liveState.id);
    liveState.clock = 0;
    liveState.lastText = "";
    liveState.visible = [];
    window.sessionStorage.setItem("liveReplicaId", String(liveState.id));
    if (pendingLiveOps.length) {
      const backlog = pendingLiveOps.splice(0, pendingLiveOps.length);
      backlog.forEach((op) => applyLiveOp(op));
    }
    updateLiveUI();
  }
  if (message.type === "live-presence" && Array.isArray(message.presence)) {
    renderPresence(message.presence);
  }
  if (message.type === "live-event") {
    if (message.event === "join") {
      appendLiveEvent(`Replica R${message.replicaId} joined`);
    }
    if (message.event === "leave") {
      appendLiveEvent(`Replica R${message.replicaId} went offline`);
    }
    if (message.event === "online") {
      appendLiveEvent(`Replica R${message.replicaId} went online`);
    }
    if (message.event === "offline") {
      appendLiveEvent(`Replica R${message.replicaId} went offline`);
    }
  }
});

ws.addEventListener("open", () => {
  wsReady = true;
  ws.send(JSON.stringify({ type: "live-hello", replicaId: liveState.id || null }));
  for (const key of Object.keys(outboxes) as ReplicaKey[]) {
    if (outboxes[key].length) scheduleFlush(key);
  }
  if (liveState.online) {
    while (liveState.pending.length) {
      enqueueLiveOp(liveState.pending.shift()!);
    }
  }
});

ws.addEventListener("close", () => {
  wsReady = false;
});

inspectorSelect.addEventListener("change", () => {
  updateInspector(inspectorSelect.value as ReplicaKey);
});

rawToggle.addEventListener("change", () => {
  renderGlobalTimeline();
});

liveRawToggle?.addEventListener("change", () => {
  renderLiveTimeline();
});

setupReplicaPanels();
updateReplicaUI("A");
updateReplicaUI("B");
updateReplicaUI("C");
updateInspector("A");
updateLiveUI();

for (const btn of Array.from(document.querySelectorAll("button[data-scenario]"))) {
  btn.addEventListener("click", () => {
    const scenario = (btn as HTMLButtonElement).dataset.scenario!;
    const action = (btn as HTMLButtonElement).dataset.action || "run";
    if (action === "reset") return resetScenario(scenario);
    if (action === "step") return stepScenario(scenario);
    return runScenario(scenario);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab as "scenarios" | "realtime";
    tabPanels.scenarios.classList.toggle("active", target === "scenarios");
    tabPanels.realtime.classList.toggle("active", target === "realtime");
  });
});

liveEditor.addEventListener("input", () => {
  if (!liveState.id) return;
  liveLocalEdit(liveEditor.value);
});

liveToggle.addEventListener("click", () => {
  liveState.online = !liveState.online;
  liveConnection.textContent = liveState.online ? "Online" : "Offline";
  liveToggle.textContent = liveState.online ? "Go offline" : "Go online";
  if (liveState.id) {
    ws.send(JSON.stringify({ type: "live-status", replicaId: liveState.id, online: liveState.online }));
  }
  if (liveState.online) {
    while (liveState.pending.length) {
      enqueueLiveOp(liveState.pending.shift()!);
    }
  }
  updateLiveUI();
});
