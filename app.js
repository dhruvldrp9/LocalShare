(() => {
  const $ = (id) => document.getElementById(id);
  const setup = $("setup"), workspace = $("workspace"), senderView = $("sender-view"), receiverView = $("receiver-view");
  let role, socket, peer, files = [], incoming = null, incomingChunks = [];
  const signalingUrl = window.SHAREIT_SIGNALING_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

  function status(text, error = false) {
    $("connection-status").innerHTML = `<span class="status-dot"></span><span>${text}</span>`;
    $("connection-status").style.background = error ? "#fff0ed" : "";
    $("connection-status").style.color = error ? "#bd5a47" : "";
  }
  function send(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
  function name() { return $("display-name").value.trim() || "Anonymous"; }
  function connect() {
    try { socket = new WebSocket(signalingUrl); } catch { return status("The sharing service address is invalid.", true); }
    socket.onopen = () => {
      status("Connected securely");
      if (role === "receiver") send({ type: "create-room", name: name() });
      else send({ type: "join-room", code: $("room-code").value, name: name() });
    };
    socket.onerror = () => status("Could not reach the sharing service.", true);
    socket.onclose = () => status("Sharing service unavailable. Please try again.", true);
    socket.onmessage = async ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "room-created") showRoom(message.code);
      if (message.type === "room-joined") { $("sender-room").textContent = `Connected to ${escapeHtml(message.peerName)}. Waiting for acceptance…`; send({ type: "request", to: message.peer }); }
      if (message.type === "sender-joined") renderRequest(message);
      if (message.type === "accepted") { await makePeer(message.from, true); status("Receiver accepted. Choose files to send."); }
      if (message.type === "signal") await receiveSignal(message);
      if (message.type === "room-error") status(message.message, true);
      if (message.type === "room-expired") status("This code expired. Start a new receiving session.", true);
    };
  }
  function showRoom(code) {
    $("room-display").innerHTML = `<strong>${code}</strong><div id="qrcode"></div><small>Expires when you close this tab</small>`;
    if (window.QRCode) new QRCode($("qrcode"), { text: `${location.origin}${location.pathname}?room=${code}`, width: 150, height: 150, colorDark: "#20352b", colorLight: "#ffffff" });
    status("Ready to receive");
  }
  function renderRequest(message) {
    $("request-area").innerHTML = `<div class="request"><div><strong>${escapeHtml(message.name)}</strong><small>wants to send you files</small></div><button class="accept">Accept request</button></div>`;
    $("request-area").querySelector("button").onclick = () => { send({ type: "accepted", to: message.from }); makePeer(message.from, false); status("Connected. Waiting for files…"); };
  }
  async function makePeer(target, initiator) {
    peer = new RTCPeerConnection({ iceServers: [] });
    peer.onicecandidate = ({ candidate }) => candidate && send({ type: "signal", to: target, signal: { candidate } });
    peer.ondatachannel = ({ channel }) => prepareChannel(channel);
    if (initiator) {
      const channel = peer.createDataChannel("files");
      peer.fileChannel = channel; prepareChannel(channel);
      await peer.setLocalDescription(await peer.createOffer());
      send({ type: "signal", to: target, signal: { description: peer.localDescription } });
    }
  }
  async function receiveSignal(message) {
    const signal = message.signal;
    if (signal.description) {
      await peer.setRemoteDescription(signal.description);
      if (signal.description.type === "offer") {
        await peer.setLocalDescription(await peer.createAnswer());
        send({ type: "signal", to: message.from, signal: { description: peer.localDescription } });
      }
    } else if (signal.candidate) try { await peer.addIceCandidate(signal.candidate); } catch { status("The direct connection could not be completed.", true); }
  }
  function prepareChannel(channel) {
    channel.binaryType = "arraybuffer";
    channel.onopen = () => { peer.fileChannel = channel; status("Connected directly. Ready to transfer."); $("send-files").disabled = !files.length; };
    channel.onmessage = ({ data }) => receiveChunk(data);
  }
  function receiveChunk(data) {
    if (typeof data === "string") {
      const meta = JSON.parse(data);
      if (meta.type === "file") { incoming = meta; incomingChunks = []; }
      if (meta.type === "end" && incoming) {
        const url = URL.createObjectURL(new Blob(incomingChunks, { type: incoming.mime }));
        $("received-files").insertAdjacentHTML("beforeend", `<div class="received-item"><span>${escapeHtml(incoming.name)} <small>(${formatSize(incoming.size)})</small></span><a href="${url}" download="${escapeHtml(incoming.name)}">Save</a></div>`);
        incoming = null;
      }
    } else incomingChunks.push(data);
  }
  async function transfer() {
    const channel = peer?.fileChannel;
    if (!channel || channel.readyState !== "open") return status("The direct channel is not ready yet.", true);
    for (const file of files) {
      channel.send(JSON.stringify({ type: "file", name: file.name, size: file.size, mime: file.type }));
      for (let offset = 0; offset < file.size; offset += 64 * 1024) channel.send(await file.slice(offset, offset + 64 * 1024).arrayBuffer());
      channel.send(JSON.stringify({ type: "end" }));
    }
    status("Files sent directly.");
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function formatSize(size) { return `${(size / 1024 / 1024).toFixed(2)} MB`; }
  $("files").onchange = (event) => { files = [...event.target.files]; $("selected-files").innerHTML = files.map((file) => `<div class="selected-item"><span>${escapeHtml(file.name)}</span><small>${formatSize(file.size)}</small></div>`).join(""); $("send-files").disabled = !files.length; };
  $("send-files").onclick = transfer;
  $("room-code").value = new URLSearchParams(location.search).get("room") || "";
  $("change-role").onclick = () => location.reload();
  document.querySelectorAll("[data-role]").forEach((button) => button.onclick = () => {
    role = button.dataset.role; setup.classList.add("hidden"); workspace.classList.remove("hidden");
    senderView.classList.toggle("hidden", role !== "sender"); receiverView.classList.toggle("hidden", role !== "receiver");
    document.querySelectorAll(".sender-only").forEach((element) => element.classList.toggle("hidden", role !== "sender"));
    $("role-label").textContent = `${role.toUpperCase()} MODE`; $("workspace-title").textContent = role === "sender" ? "Join a receiver" : "Ready to receive"; connect();
  });
})();
