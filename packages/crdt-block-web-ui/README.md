# Block-Level CRDT Web UI

A real-time collaborative editor built with Conflict-free Replicated Data Types (CRDTs). Multiple users can edit simultaneously without conflicts, with full offline support.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm run dev

# Open http://localhost:8080 in multiple tabs
```

## ✨ Features

- **Real-time Collaboration**: Multiple users edit simultaneously with instant synchronization
- **Block-Based Structure**: Paragraphs, lists (bullet/ordered), and tables
- **Offline Support**: Continue editing when disconnected, auto-sync when reconnected
- **Conflict-Free**: CRDT guarantees all replicas converge to the same state
- **User Presence**: See who's online/offline with unique replica IDs
- **Drag & Drop**: Reorder blocks by dragging the six-dot handle

## 📖 Usage

### Adding Content

- **Paragraphs**: Click "Add Paragraph" and start typing
- **Lists**: Click "Add List" to create bullet points, click "+ Add item" for more items
- **Tables**: Click "Add Table" to create a 2x2 table, use "+ Row" and "+ Column" to expand

### Editing

- Click any block to edit its content
- Press Enter in a paragraph to create a new paragraph below
- Press Enter in a list item to add a new item
- Hover over blocks to see the delete button (×)

### Reordering Blocks

- Hover over any block to see the six-dot drag handle on the left
- Click and drag the handle to reorder blocks
- Drop on another block to move it there

### Collaboration

- Open the same URL in multiple tabs or browsers
- Each user gets a unique replica ID and color badge
- Changes sync instantly across all connected clients
- Click "Go Offline" to simulate disconnection and test offline editing

## 🏗️ Architecture

### System Overview

```
┌─────────────┐         WebSocket          ┌─────────────┐
│  Browser 1  │◄──────────────────────────►│             │
│  (Replica 1)│                             │   Server    │
└─────────────┘                             │  (Node.js)  │
                                            │             │
┌─────────────┐         WebSocket          │   + OpLog   │
│  Browser 2  │◄──────────────────────────►│   + State   │
│  (Replica 2)│                             │             │
└─────────────┘                             └─────────────┘
```

### Components

**Client (Browser)**
- `CRDTDocument` instance with unique replica ID
- Block-based rendering using contenteditable
- WebSocket connection for real-time sync
- Offline operation queue

**Server (Node.js)**
- WebSocket server for broadcasting operations
- Operation log for new clients
- Presence tracking
- Replica ID assignment

**CRDT Layer** (from `block-crdt` package)
- RGA (Replicated Growable Array) for ordered sequences
- Block-level operations for document structure
- Character-level operations for text editing
- Deterministic conflict resolution

### Data Flow

```
User Edit → Generate CRDT Op → Apply Locally → Send to Server → Broadcast → Apply Remotely
```

## 🔧 Technical Details

### Operation Types

**Block Operations**
- `insert_block`: Add a new block (paragraph, list, table)
- `delete_block`: Remove a block

**Text Operations**
- `insert_char`: Add a character to text
- `delete_char`: Remove a character

**List Operations**
- `insert_list_item`: Add item to list
- `insert_list_char`: Add character to list item

**Table Operations**
- `insert_row` / `insert_column`: Expand table
- `insert_cell_char`: Edit cell content

### CRDT Properties

- **Strong Eventual Consistency**: All replicas converge to the same state
- **Commutativity**: Operations can be applied in any order
- **Idempotence**: Applying the same operation multiple times has the same effect as once

### Conflict Resolution

When two users edit the same position:
- Operations are ordered by replica ID
- Both edits are preserved in deterministic order
- No data loss, guaranteed convergence

## 📁 Project Structure

```
packages/crdt-block-web-ui/
├── src/
│   ├── server.mts       # WebSocket server
│   └── client.mts       # Frontend application
├── public/
│   ├── index.html       # HTML template
│   ├── styles.css       # Styling
│   └── client.js        # Compiled bundle (auto-generated)
├── README.md            # This file
├── DEMO.md              # Demo scenarios
├── package.json         # Dependencies
└── tsconfig.json        # TypeScript config
```

## 🐛 Known Limitations

- Text editing uses simple diff algorithm (can be optimized)
- No undo/redo support yet
- No rich text formatting (bold, italic, etc.)
- No cursor position sync between users
- Tombstones not garbage collected (memory grows with edits)

## 🚧 Future Enhancements

- [ ] Undo/redo support
- [ ] Rich text formatting
- [ ] Cursor/selection indicators for other users
- [ ] Better text diff algorithm
- [ ] Persistence (database storage)
- [ ] User authentication
- [ ] Export to Markdown/HTML
- [ ] Version history

## 🔍 Debugging

### Enable Console Logging

Open browser DevTools (F12) → Console tab to see:
- Operation logs
- WebSocket messages
- Rendering updates

### Check WebSocket Connection

DevTools → Network tab → WS filter to see:
- Connection status
- Messages sent/received

### Inspect CRDT State

In browser console:
```javascript
doc.toJSON()           // View document structure
doc.visibleBlocks()    // View all blocks
replicaId              // Your replica ID
isOnline               // Connection status
```

## 🧪 Testing

### Basic Test

1. Open http://localhost:8080 in Tab 1
2. Add a paragraph and type "Hello"
3. Open http://localhost:8080 in Tab 2
4. Tab 2 should immediately show "Hello"
5. Type " World" in Tab 2
6. Both tabs show "Hello World"

### Offline Test

1. Click "Go Offline" in one tab
2. Make edits while offline
3. Click "Go Online"
4. Watch edits sync automatically

See [DEMO.md](DEMO.md) for more test scenarios.

## 🛠️ Troubleshooting

### Port 8080 Already in Use

Edit `src/server.mts` and change:
```typescript
const port = 3000; // or any other port
```

### Changes Not Syncing

1. Check both tabs show "Online" status
2. Open DevTools Console for errors
3. Verify WebSocket connection in Network tab
4. Restart the server

### Build Errors

Make sure you're in the correct directory:
```bash
pwd  # Should show: .../packages/crdt-block-web-ui
```

## 📚 Learn More

### CRDT Resources

- [CRDT Tech](https://crdt.tech/) - Overview and resources
- [RGA Paper](https://pages.lip6.fr/Marc.Shapiro/papers/RGA-TPDS-2011.pdf) - Original algorithm
- [Conflict-free Replicated Data Types](https://arxiv.org/abs/1805.06358) - Academic survey

### Related Projects

- [Yjs](https://github.com/yjs/yjs) - Production CRDT library
- [Automerge](https://github.com/automerge/automerge) - JSON CRDT
- [ProseMirror](https://prosemirror.net/) - Rich text editor framework

## 📄 License

MIT - Use freely in your projects!

---

**Ready to collaborate?** Run `npm run dev` and open http://localhost:8080 in multiple tabs! 🎉
