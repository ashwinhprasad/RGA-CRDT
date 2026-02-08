import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebSocketServer } from "ws";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

await build({
  entryPoints: [path.join(__dirname, "client.mts")],
  bundle: true,
  format: "esm",
  outfile: path.join(publicDir, "client.js")
});

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
    }
    res.writeHead(200);
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

const wss = new WebSocketServer({ server });
const opLog: unknown[] = [];
let nextLiveId = 1;
const liveSessions = new Map<number, boolean>();

function broadcastPresence() {
  const presence = Array.from(liveSessions.entries())
    .sort(([a], [b]) => a - b)
    .map(([id, online]) => ({ id, online }));
  broadcast({ type: "live-presence", presence });
}

function broadcast(message: unknown) {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}
wss.on("connection", (socket) => {
  let liveId: number | null = null;
  socket.send(JSON.stringify({ type: "hello", opLog }));

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === "live-hello") {
        const requested = Number(message.replicaId);
        const canReuse = Number.isInteger(requested) && requested > 0 && (!liveSessions.has(requested) || liveSessions.get(requested) === false);
        const replicaId = canReuse ? requested : nextLiveId++;
        liveSessions.set(replicaId, true);
        liveId = replicaId;
        socket.send(JSON.stringify({ type: "live-welcome", replicaId }));
        broadcast({ type: "live-event", event: "join", replicaId });
        broadcastPresence();
        return;
      }
      if (message.type === "live-status") {
        const replicaId = Number(message.replicaId);
        if (Number.isInteger(replicaId) && replicaId > 0) {
          liveSessions.set(replicaId, Boolean(message.online));
          broadcast({ type: "live-event", event: message.online ? "online" : "offline", replicaId });
          broadcastPresence();
        }
        return;
      }
      if (message.type === "op" && message.op) {
        opLog.push(message.op);
        broadcast({ type: "op", op: message.op });
      }
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Invalid payload" }));
    }
  });

  socket.on("close", () => {
    if (liveId !== null) {
      liveSessions.set(liveId, false);
      broadcast({ type: "live-event", event: "leave", replicaId: liveId });
      broadcastPresence();
    }
  });
});

const port = 8080;
server.listen(port, () => {
  console.log(`CRDT demo running at http://localhost:${port}`);
});
