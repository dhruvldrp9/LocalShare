const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer } = require("ws");

const port = Number(process.env.PORT || 8787);
const root = __dirname;
const clients = new Map();
const rooms = new Map();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function roomCode() {
  let code;
  do { code = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join(""); } while (rooms.has(code));
  return code;
}

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
sockets.on("connection", (socket) => {
  const id = crypto.randomUUID();
  socket.on("message", (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    const client = clients.get(id);
    if (message.type === "create-room" && typeof message.name === "string") {
      const code = roomCode();
      clients.set(id, { id, socket, name: message.name.trim().slice(0, 40) || "Anonymous", role: "receiver", room: code });
      rooms.set(code, id);
      setTimeout(() => {
        if (rooms.get(code) === id) {
          rooms.delete(code);
          const receiver = clients.get(id);
          if (receiver?.socket.readyState === 1) receiver.socket.send(JSON.stringify({ type: "room-expired" }));
        }
      }, 10 * 60 * 1000);
      socket.send(JSON.stringify({ type: "room-created", code }));
      return;
    }
    if (message.type === "join-room" && typeof message.code === "string" && typeof message.name === "string") {
      const code = message.code.toUpperCase().trim();
      const receiverId = rooms.get(code);
      const receiver = clients.get(receiverId);
      if (!receiver || receiver.socket.readyState !== 1) {
        socket.send(JSON.stringify({ type: "room-error", message: "That code is unavailable or expired." }));
        return;
      }
      clients.set(id, { id, socket, name: message.name.trim().slice(0, 40) || "Anonymous", role: "sender", room: code });
      socket.send(JSON.stringify({ type: "room-joined", code, peer: receiverId, peerName: receiver.name }));
      receiver.socket.send(JSON.stringify({ type: "sender-joined", from: id, name: message.name.trim().slice(0, 40) || "Anonymous" }));
      return;
    }
    if (message.type === "request" && client?.room) {
      const target = clients.get(rooms.get(client.room));
      if (target) target.socket.send(JSON.stringify({ ...message, from: id, name: client.name }));
      return;
    }
    const target = clients.get(message.to);
    if (target && target.room === client?.room && target.socket.readyState === 1) target.socket.send(JSON.stringify({ ...message, from: id }));
  });
  socket.on("close", () => {
    const client = clients.get(id);
    if (client?.room && rooms.get(client.room) === id) rooms.delete(client.room);
    clients.delete(id);
  });
});

server.listen(port, "0.0.0.0", () => console.log(`ShareIt signaling server listening on port ${port}`));
