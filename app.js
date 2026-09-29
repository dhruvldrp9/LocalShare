(() => {
  const $ = (id) => document.getElementById(id);
  const setup = $("setup"), workspace = $("workspace"), senderView = $("sender-view"), receiverView = $("receiver-view");
  let role, socket, identity, peer, selectedPeer, files = [], incoming = null, incomingChunks = [];
  const connections = new Map();
  const signalingUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

  function status(text, error = false) {
    $("connection-status").innerHTML = `<span class="status-dot"></span><span>${text}</span>`;
    $("connection-status").style.background = error ? "#fff0ed" : "";
    $("connection-status").style.color = error ? "#bd5a47" : "";
  }
  function send(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
  function reset() {
    socket?.close(); peer?.close(); connections.forEach((pc) => pc.close()); connections.clear();
    workspace.classList.add("hidden"); setup.classList.remove("hidden"); senderView.classList.add("hidden"); receiverView.classList.add("hidden");
  }
  function connect() {
    if (!location.host) return status("Open LocalShare from the LAN server address.", true);
    try { socket = new WebSocket(signalingUrl); } catch { return status("The local connection address is not valid.", true); }
    socket.onopen = () => { status("Connected to the LAN"); send({ type: "join", name: $("display-name").value.trim() || "Anonymous", role }); };
    socket.onerror = () => status("Could not reach the signaling server.", true);
    socket.onclose = () => status("Disconnected from the signaling server.", true);
    socket.onmessage = async ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "identity") identity = message.id;
      if (message.type === "presence" && role === "sender") renderPeers(message.people.filter((person) => person.role === "receiver" && person.id !== identity));
      if (message.type === "request" && role === "receiver") renderRequest(message);
      if (message.type === "accepted" && role === "sender") { await requestConnection(message.from); status("Receiver accepted. You can send files."); }
      if (message.type === "signal") await receiveSignal(message);
    };
  }
  function renderPeers(peers) {
    $("device-count").textContent = `${peers.length} device${peers.length === 1 ? "" : "s"}`;
    $("device-list").innerHTML = peers.length ? peers.map((person) => `<div class="device"><div class="device-info"><span class="avatar">${person.name[0].toUpperCase()}</span><div><strong>${escapeHtml(person.name)}</strong><small>Ready to receive</small></div></div><button class="primary" data-peer="${person.id}">Request connection</button></div>`).join("") : '<div class="empty">Waiting for a receiver to come online…</div>';
    document.querySelectorAll("[data-peer]").forEach((button) => button.onclick = () => requestPeer(button.dataset.peer));
  }
  function requestPeer(id) {
    selectedPeer = id; $("file-picker").classList.remove("hidden"); send({ type: "request", to: id, name: $("display-name").value.trim() || "Anonymous" });
    status("Connection request sent. Waiting for acceptance…");
  }
  function renderRequest(message) {
    $("request-area").innerHTML = `<div class="request"><div><strong>${escapeHtml(message.name)}</strong><small>wants to send you files</small></div><button class="accept">Accept request</button></div>`;
    $("request-area").querySelector("button").onclick = () => acceptRequest(message.from);
  }
  async function makePeer(target, initiator) {
    const pc = new RTCPeerConnection({ iceServers: [] });
    connections.set(target, pc);
    pc.onicecandidate = ({ candidate }) => candidate && send({ type: "signal", to: target, signal: { candidate } });
    pc.ondatachannel = ({ channel }) => prepareChannel(channel);
    if (initiator) {
      const channel = pc.createDataChannel("files");
      pc._fileChannel = channel; prepareChannel(channel);
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      send({ type: "signal", to: target, signal: { description: pc.localDescription } });
    }
    return pc;
  }
  async function requestConnection(target) { peer = await makePeer(target, true); }
  async function acceptRequest(target) {
    selectedPeer = target; peer = await makePeer(target, false); send({ type: "accepted", to: target }); status("Connected. The sender can now choose files.");
  }
  async function receiveSignal(message) {
    const target = message.from, signal = message.signal;
    let pc = connections.get(target);
    if (!pc) pc = await makePeer(target, false);
    if (signal.description) {
      await pc.setRemoteDescription(signal.description);
      if (signal.description.type === "offer") {
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        send({ type: "signal", to: target, signal: { description: pc.localDescription } });
      }
    } else if (signal.candidate) try { await pc.addIceCandidate(signal.candidate); } catch { status("The peer connection could not be completed.", true); }
  }
  function prepareChannel(channel) {
    channel.binaryType = "arraybuffer";
    channel.onopen = () => { status("Connected directly. Ready to transfer."); $("send-files").disabled = !files.length; };
    channel.onmessage = ({ data }) => receiveChunk(data);
    channel.onclose = () => status("Peer disconnected.", true);
    const connection = [...connections.values()].find((pc) => pc._fileChannel === channel);
    if (connection) connection._fileChannel = channel;
  }
  function receiveChunk(data) {
    if (typeof data === "string") {
      const meta = JSON.parse(data);
      if (meta.type === "file") { incoming = meta; incomingChunks = []; }
      if (meta.type === "end" && incoming) {
        const blob = new Blob(incomingChunks, { type: incoming.mime }); const url = URL.createObjectURL(blob);
        $("received-files").insertAdjacentHTML("beforeend", `<div class="received-item"><span>${escapeHtml(incoming.name)} <small>(${formatSize(incoming.size)})</small></span><a href="${url}" download="${escapeHtml(incoming.name)}">Save</a></div>`);
        incoming = null;
      }
    } else incomingChunks.push(data);
  }
  async function transfer() {
    if (!peer || peer.connectionState !== "connected") return status("Accept the receiver's request first.", true);
    for (const file of files) {
      const dataChannel = peer._fileChannel;
      if (!dataChannel || dataChannel.readyState !== "open") return status("The direct channel is not ready yet.", true);
      dataChannel.send(JSON.stringify({ type: "file", name: file.name, size: file.size, mime: file.type }));
      for (let offset = 0; offset < file.size; offset += 64 * 1024) dataChannel.send(await file.slice(offset, offset + 64 * 1024).arrayBuffer());
      dataChannel.send(JSON.stringify({ type: "end" }));
    }
    status("Files sent directly to the receiver.");
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
  function formatSize(size) { return `${(size / 1024 / 1024).toFixed(2)} MB`; }
  $("files").onchange = (event) => { files = [...event.target.files]; $("selected-files").innerHTML = files.map((file) => `<div class="selected-item"><span>${escapeHtml(file.name)}</span><small>${formatSize(file.size)}</small></div>`).join(""); $("send-files").disabled = !files.length; };
  $("send-files").onclick = transfer;
  $("change-role").onclick = reset;
  document.querySelectorAll("[data-role]").forEach((button) => button.onclick = async () => {
    role = button.dataset.role; setup.classList.add("hidden"); workspace.classList.remove("hidden");
    senderView.classList.toggle("hidden", role !== "sender"); receiverView.classList.toggle("hidden", role !== "receiver");
    $("role-label").textContent = `${role.toUpperCase()} MODE`; $("workspace-title").textContent = role === "sender" ? "Nearby devices" : "Ready to receive";
    connect();
  });
})();
