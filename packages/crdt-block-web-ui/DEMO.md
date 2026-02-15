# Demo Scenarios & Testing Guide

Try these scenarios to see the CRDT editor in action and verify everything works correctly!

## 🚀 Quick Start Test

**Goal**: Verify basic synchronization works

1. Start the server: `npm run dev`
2. Open http://localhost:8080 in Tab 1
3. Click "Add Paragraph" and type "Hello"
4. Open http://localhost:8080 in Tab 2
5. **Expected**: Tab 2 immediately shows "Hello"
6. In Tab 2, type " World"
7. **Expected**: Both tabs show "Hello World"

✅ **Success**: Real-time sync is working!

---

## 📝 Basic Scenarios

### Scenario 1: Concurrent Editing

**Goal**: See conflict-free merging in action

1. Open two tabs side by side
2. Tab 1: Add a paragraph and type "Alice"
3. Tab 2: Type "Bob" at the same time
4. **Expected**: Text merges deterministically (e.g., "AliceBob" or "BobAlice")

**What's happening**: Concurrent inserts are ordered by replica ID, ensuring all clients converge to the same state.

---

### Scenario 2: Offline Editing

**Goal**: Test offline mode and sync

1. Open Tab 1
2. Add a paragraph and type "Online edit"
3. Click "Go Offline"
4. Type " and offline edit"
5. Notice status shows "Offline"
6. Click "Go Online"
7. **Expected**: Offline edits sync immediately

**What's happening**: Operations are queued locally and sent when reconnected.

---

### Scenario 3: List Collaboration

**Goal**: Build a list together

1. Tab 1: Click "Add List"
2. Tab 1: Type "Item 1" in the first item
3. Tab 2: Click "+ Add item"
4. Tab 2: Type "Item 2"
5. Tab 1: Click "+ Add item"
6. Tab 1: Type "Item 3"
7. **Expected**: Both tabs show the same 3-item list

**What's happening**: List items are ordered using RGA, maintaining consistency.

---

### Scenario 4: Table Collaboration

**Goal**: Build a table together

1. Tab 1: Click "Add Table"
2. Tab 1: Click first cell, type "Name"
3. Tab 2: Click second cell, type "Age"
4. Tab 1: Click "+ Row" to add a row
5. Tab 2: Fill in the new row
6. **Expected**: Both tabs show the same table

**What's happening**: Table structure and cell content are all CRDT-based.

---

### Scenario 5: Block Reordering

**Goal**: Test drag-and-drop reordering

1. Add 3 paragraphs with different text
2. Hover over the second paragraph
3. Click and drag the six-dot handle on the left
4. Drop it above the first paragraph
5. **Expected**: Blocks reorder, changes sync to other tabs

**What's happening**: Block reordering generates delete + insert operations that sync across replicas.

---

## 🧪 Advanced Scenarios

### Scenario A: Stress Test

**Goal**: Test with rapid edits

1. Open 3+ tabs
2. Add a paragraph
3. All tabs: Type rapidly at the same time
4. **Expected**: Text merges in real-time, all tabs converge

**What's happening**: The CRDT handles hundreds of concurrent operations gracefully.

---

### Scenario B: Late Joiner

**Goal**: Test operation log replay

1. Tab 1: Create a document with multiple paragraphs, lists, and tables
2. Tab 1: Add lots of content
3. Open Tab 2 (new)
4. **Expected**: Tab 2 immediately shows all content from Tab 1

**What's happening**: New clients receive the operation log and replay it to catch up.

---

### Scenario C: Network Simulation

**Goal**: Simulate poor network

1. Open DevTools → Network tab
2. Set throttling to "Slow 3G"
3. Type in one tab
4. Watch delayed sync to other tab
5. **Expected**: All edits eventually arrive and merge correctly

**What's happening**: CRDTs are designed for eventually consistent systems.

---

### Scenario D: Offline Divergence

**Goal**: Test offline conflict resolution

1. Tab 1: Go offline
2. Tab 2: Go offline
3. Both: Make different edits to the same paragraph
4. Both: Go online
5. **Expected**: Edits merge automatically without conflicts

**What's happening**: CRDT operations commute - they can be applied in any order.

---

### Scenario E: Multiple Users

**Goal**: Simulate a team

1. Open 5 tabs (or use different browsers)
2. Each tab represents a different user
3. Check the presence bar - see all users
4. Everyone edits different parts of the document
5. **Expected**: Document grows collaboratively, all changes sync

**What's happening**: Each user has a unique replica ID and color badge.

---

## 🔍 What to Observe

### In the UI

- **Presence Bar**: Shows all connected users with color badges
- **Status Indicator**: Online (green) / Offline (gray) / Disconnected (red)
- **Real-time Updates**: Changes appear instantly
- **Drag Handle**: Six-dot handle appears on hover (left side of blocks)
- **Delete Button**: × button appears on hover (top-right of blocks)

### In DevTools Console (F12)

Enable console to see:
- `Sending operation: {kind: "insert_char", ...}`
- `Received operation: {kind: "insert_char", ...}`
- `Rendering X blocks`
- `Moving block from X to Y`

### In DevTools Network Tab

- WebSocket connection (green = connected)
- Operation messages (small payloads, typically < 100 bytes)
- Reconnection attempts if disconnected

---

## 🐛 Troubleshooting

### Changes Not Syncing

**Check**:
1. Both tabs show "Online" status (green)
2. Presence bar shows both replicas
3. Console for JavaScript errors
4. Network tab for WebSocket connection

**Fix**:
- Refresh both tabs
- Restart the server
- Clear browser cache

---

### Drag & Drop Not Working

**Check**:
1. Six-dot handle is visible on hover
2. Console shows "Drag started" when dragging
3. Console shows "Moving block" when dropping

**Fix**:
- Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Verify server is running latest code
- Check console for errors

---

### Offline Mode Issues

**Check**:
1. Status changes to "Offline" when clicked
2. Console shows "Queued operation while offline"
3. Console shows "Flushing X pending operations" when going online

**Fix**:
- Verify WebSocket connection is established
- Check server logs for sync requests
- Restart both client and server

---

### Content Not Appearing in New Tab

**Check**:
1. Tab 2 console shows "Received X operations from server"
2. Tab 2 console shows "Applying X operations to new replica"
3. Tab 2 console shows "Rendering X blocks"

**Fix**:
- Verify Tab 1 has content before opening Tab 2
- Check server console for "Sent X operations to new client"
- Restart server and try again

---

## ✅ Success Criteria

After running these scenarios, you should see:

✅ Tab 2 immediately shows Tab 1's content when opened
✅ Typing in Tab 1 appears in Tab 2 within 100ms
✅ Typing in Tab 2 appears in Tab 1 within 100ms
✅ Presence bar shows all connected replicas
✅ Offline edits sync when going back online
✅ Blocks can be reordered via drag & drop
✅ All tabs converge to the same state
✅ No JavaScript errors in console
✅ Server logs show operation broadcasts

---

## 🎯 Next Steps

After trying these demos:

1. **Understand the Code**: Read `src/client.mts` and `src/server.mts`
2. **Explore CRDTs**: Check the `../block-crdt/` package
3. **Add Features**: Try implementing undo/redo or rich text
4. **Optimize**: Improve the text diff algorithm
5. **Build**: Create your own collaborative app!

---

## 📚 Common Patterns

### Pattern 1: Append-Only

Multiple users adding to the end of a document - works perfectly!

### Pattern 2: Concurrent Edits

Multiple users editing different parts - no conflicts!

### Pattern 3: Same Position

Multiple users editing the same spot - deterministic merge!

### Pattern 4: Delete + Insert

One user deletes while another inserts - insert survives!

---

## 🎮 Interactive Testing

### Console Commands

In browser console, try:

```javascript
// View document structure
doc.toJSON()

// View all blocks
doc.visibleBlocks()

// Check your replica ID
replicaId

// Check connection status
isOnline

// View pending operations
pendingOps

// Manually trigger render
renderDocument()
```

### Server Commands

In the terminal where server is running:

- Watch for "Registered replica X" messages
- Watch for "Received operation from replica X"
- Watch for "Broadcast to X other clients"

---

Happy collaborating! 🎉

For more details, see [README.md](README.md)
