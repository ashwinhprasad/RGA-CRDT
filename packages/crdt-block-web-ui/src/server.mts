import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebSocketServer } from "ws";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

// Build the client bundle
await build({
  entryPoints: [path.join(__dirname, "client.mts")],
  bundle: true,
  format: "esm",
  outfile: path.join(publicDir, "client.js"),
  external: []
});

console.log("Client bundle built successfully");

// HTTP server for static files
const server = createServer(async (req, res) => {
  try {
    const url = req.url ?? "/";
    const file = url === "/" ? "index.html" : url.slice(1);
    const filePath = path.join(publicDir, file);

    const content = await readFile(filePath);
    if (file.endsWith(".js")) {
      res.setHeader("Content-Type", "application/javascript");
    } else if (file.endsWith(".html")) {
      res.setHeader("Content-Type", "text/html");
    } else if (file.endsWith(".css")) {
      res.setHeader("Content-Type", "text/css");
    }
    res.writeHead(200);
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

// WebSocket server for real-time collaboration
const wss = new WebSocketServer({ server });

// Store all operations for new clients
const opLog: unknown[] = [];

// Track connected replicas
let nextReplicaId = 1;
const activeSessions = new Map<number, { online: boolean; name: string }>();

function broadcast(message: unknown, exclude?: any) {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client !== exclude && client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastPresence() {
  const presence = Array.from(activeSessions.entries()).map(([id, info]) => ({
    id,
    online: info.online,
    name: info.name
  }));
  broadcast({ type: "presence", presence });
}

wss.on("connection", (socket) => {
  let replicaId: number | null = null;
  let lastSeenOpIndex = 0; // Track which operations this client has seen
  console.log("New WebSocket connection");

  // Send initial state to new client
  socket.send(JSON.stringify({ type: "init", opLog }));
  console.log(`Sent ${opLog.length} operations to new client`);

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle replica registration
      if (message.type === "register") {
        const requested = Number(message.replicaId);
        const canReuse =
          Number.isInteger(requested) &&
          requested > 0 &&
          (!activeSessions.has(requested) || activeSessions.get(requested)?.online === false);

        replicaId = canReuse ? requested : nextReplicaId++;
        const name = message.name || `User ${replicaId}`;

        activeSessions.set(replicaId, { online: true, name });
        console.log(`Registered replica ${replicaId} (${name})`);
        
        // Store replicaId on socket for later reference
        (socket as any).replicaId = replicaId;

        socket.send(JSON.stringify({ type: "registered", replicaId, name }));
        broadcast({ type: "user-joined", replicaId, name }, socket);
        broadcastPresence();
        
        // Client has seen all operations up to this point
        lastSeenOpIndex = opLog.length;
        return;
      }

      // Handle status updates
      if (message.type === "status") {
        const id = Number(message.replicaId);
        if (Number.isInteger(id) && id > 0 && activeSessions.has(id)) {
          const session = activeSessions.get(id)!;
          session.online = Boolean(message.online);
          activeSessions.set(id, session);
          broadcast({ type: "user-status", replicaId: id, online: session.online });
          broadcastPresence();
        }
        return;
      }

      // Handle sync requests (when client goes back online)
      if (message.type === "sync_request") {
        const id = Number(message.replicaId);
        if (Number.isInteger(id) && id > 0) {
          // Send all operations since the client went offline
          const missedOps = opLog.slice(lastSeenOpIndex);
          console.log(`Syncing ${missedOps.length} missed operations to replica ${id} (from index ${lastSeenOpIndex} to ${opLog.length})`);
          
          // Send sync response immediately
          socket.send(JSON.stringify({ type: "sync", operations: missedOps }));
          
          // Update the index to current position
          // This prevents the client from receiving its own operations back
          lastSeenOpIndex = opLog.length;
          
          console.log(`Replica ${id} is now synced up to operation ${lastSeenOpIndex}`);
        }
        return;
      }

      // Handle operations
      if (message.type === "operation" && message.op) {
        opLog.push(message.op);
        console.log(`Received operation from replica ${replicaId}:`, message.op.kind);
        
        // Broadcast to all OTHER clients who are online
        wss.clients.forEach((client) => {
          if (client !== socket && client.readyState === client.OPEN) {
            // Check if this client's replica is online before sending
            const clientReplicaId = (client as any).replicaId;
            if (clientReplicaId && activeSessions.has(clientReplicaId)) {
              const session = activeSessions.get(clientReplicaId)!;
              if (session.online) {
                client.send(JSON.stringify({ type: "operation", op: message.op }));
              } else {
                console.log(`Skipping broadcast to offline replica ${clientReplicaId}`);
              }
            }
          }
        });
        
        // Update this client's lastSeenOpIndex since they sent this operation
        lastSeenOpIndex = opLog.length;
        
        console.log(`Broadcast to online clients`);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      socket.send(JSON.stringify({ type: "error", message: "Invalid message" }));
    }
  });

  socket.on("close", () => {
    if (replicaId !== null && activeSessions.has(replicaId)) {
      const session = activeSessions.get(replicaId)!;
      session.online = false;
      activeSessions.set(replicaId, session);
      broadcast({ type: "user-left", replicaId });
      broadcastPresence();
    }
  });
});

const port = 8080;
server.listen(port, () => {
  console.log(`Block CRDT Editor running at http://localhost:${port}`);
});
