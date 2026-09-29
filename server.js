const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer } = require("ws");

const port = Number(process.env.PORT || 8787);
const root = __dirname;
const clients = new Map();

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(root, requested));
  if (!filePath.startsWith(root + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end("Not found");
      return;
    }
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  });
});

const sockets = new WebSocketServer({ server });
function broadcastPresence() {
  const people = [...clients.values()].map(({ id, name, role }) => ({ id, name, role }));
  for (const client of clients.values()) {
    if (client.socket.readyState === 1) client.socket.send(JSON.stringify({ type: "presence", people }));
  }
}

sockets.on("connection", (socket) => {
  const id = crypto.randomUUID();
  socket.on("message", (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === "join" && typeof message.name === "string" && ["sender", "receiver"].includes(message.role)) {
      clients.set(id, { id, socket, name: message.name.trim().slice(0, 40) || "Anonymous", role: message.role });
      socket.send(JSON.stringify({ type: "identity", id }));
      broadcastPresence();
      return;
    }
    const target = clients.get(message.to);
    if (target && target.socket.readyState === 1) target.socket.send(JSON.stringify({ ...message, from: id }));
  });
  socket.on("close", () => { clients.delete(id); broadcastPresence(); });
});

server.listen(port, "0.0.0.0", () => console.log(`LocalShare signaling server listening on port ${port}`));
