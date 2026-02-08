# RGA Text CRDT Simulator (Web)

An interactive web UI that visualizes a **character-level RGA (Replicated Growable Array) CRDT** from the `text-crdt` package. It includes a deterministic playground and a realtime collaboration mode so you can see convergence behavior visually.

## Features

- **Deterministic Playground**: fixed replicas A/B/C with scripted scenarios and step/run controls.
- **Inspector**: RGA tree view and linked-list view for any replica.
- **Global timeline**: readable op history with optional JSON view.
- **Realtime Simulation**: each browser tab becomes a live replica via WebSocket relay.
- **Presence & events**: join/leave/online/offline tracking for live replicas.

## Quick start

From the repo root:

```bash
npm install
npm --workspace crdt-web run dev
```

Then open:

```bash
http://localhost:8080
```

## How it works

### Server (`src/server.mts`)

- Bundles `src/client.mts` into `public/client.js` using `esbuild`.
- Serves `public/index.html` and the bundled JS.
- Acts as a **relay** for CRDT ops and presence messages over WebSocket.
- Keeps an in-memory op log so new tabs can replay history on connect.

### Client (`src/client.mts`)

- Implements two modes:
	- **Deterministic**: scripted ops across replicas A/B/C (local CRDT instances).
	- **Realtime**: one replica per browser tab, ops broadcast via the server.
- Renders the RGA tree, linked list, and text output.
- Tracks global and live op timelines with a readable/JSON toggle.

### WebSocket flow

All tabs connect to the server via WebSocket and exchange JSON messages:

- `live-hello` → server assigns/returns a live replica id (`live-welcome`).
- `op` → client sends insert/delete ops; server relays to all tabs.
- `live-presence` / `live-event` → server broadcasts join/leave/online/offline updates.
- `hello` → server sends historical op log so late joiners can replay state.

## Project layout

```
packages/crdt-web/
	public/
		index.html       # UI markup and styles
		client.js        # Bundled client output (generated)
	src/
		server.mts       # Web server + WebSocket relay
		client.mts       # UI + CRDT logic
```


