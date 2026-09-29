(() => {
  const $ = (id) => document.getElementById(id);
  const setup = $("setup"), workspace = $("workspace"), senderView = $("sender-view"), receiverView = $("receiver-view");
  let role, peer, connection, files = [], incoming = null, incomingChunks = [];
  const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function status(text, error = false) {
    $("connection-status").innerHTML = `<span class="status-dot"></span><span>${text}</span>`;
    $("connection-status").style.background = error ? "#fff0ed" : "";
    $("connection-status").style.color = error ? "#bd5a47" : "";
  }
  function name() { return $("display-name").value.trim() || "Anonymous"; }
  function randomCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return [...bytes].map((byte) => codeAlphabet[byte % codeAlphabet.length]).join("");
  }
  function openReceiver() {
    const code = randomCode();
    peer = new Peer(`shareit-${code.toLowerCase()}`, { debug: 0 });
    peer.on("open", () => showRoom(code));
    peer.on("connection", (incomingConnection) => {
      connection = incomingConnection;
      connection.on("open", () => {
        connection.on("data", receiveMessage);
        renderRequest(connection);
      });
    });
    peer.on("error", (error) => {
      if (error.type === "unavailable-id") return openReceiver();
      status("Could not create a secure sharing room. Please try again.", true);
    });
    peer.on("disconnected", () => status("Sharing service unavailable. Please try again.", true));
  }
  function openSender() {
    const code = $("room-code").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return status("Enter the receiver's six-character code.", true);
    peer = new Peer({ debug: 0 });
    peer.on("open", () => {
      connection = peer.connect(`shareit-${code.toLowerCase()}`, { reliable: true });
      connection.on("open", () => {
        connection.on("data", receiveMessage);
        connection.send({ type: "request", name: name() });
        $("sender-room").textContent = "Request sent. Waiting for receiver approval…";
        status("Waiting for receiver approval");
      });
      connection.on("error", () => status("That code is unavailable or expired.", true));
    });
    peer.on("error", (error) => status(error.type === "peer-unavailable" ? "That code is unavailable or expired." : "Could not connect to the sharing service.", true));
  }
  function showRoom(code) {
    $("room-display").innerHTML = `<strong>${code}</strong><small>Share this six-character code with the sender</small>`;
    status("Ready to receive");
  }
  function renderRequest(message) {
    $("request-area").innerHTML = `<div class="request"><div><strong>${escapeHtml(message.name)}</strong><small>wants to send you files</small></div><button class="accept">Accept request</button></div>`;
    $("request-area").querySelector("button").onclick = () => {
      connection.send({ type: "accepted" });
      $("request-area").innerHTML = '<div class="empty">Connected. Waiting for files…</div>';
      status("Connected directly");
    };
  }
  function receiveMessage(message) {
    if (message.type === "accepted") {
      $("sender-room").textContent = "Connected to the receiver. Choose files below.";
      $("file-picker").classList.remove("hidden");
      status("Connected directly. Ready to transfer.");
    }
    if (message.type === "file") { incoming = message; incomingChunks = []; }
    if (message.type === "chunk") incomingChunks.push(message.data);
    if (message.type === "end" && incoming) {
      const url = URL.createObjectURL(new Blob(incomingChunks, { type: incoming.mime }));
      $("received-files").insertAdjacentHTML("beforeend", `<div class="received-item"><span>${escapeHtml(incoming.name)} <small>(${formatSize(incoming.size)})</small></span><a href="${url}" download="${escapeHtml(incoming.name)}">Save</a></div>`);
      incoming = null;
    }
  }
  async function transfer() {
    if (!connection || !connection.open) return status("Wait for the receiver to accept.", true);
    for (const file of files) {
      connection.send({ type: "file", name: file.name, size: file.size, mime: file.type });
      for (let offset = 0; offset < file.size; offset += 64 * 1024) {
        const buffer = await file.slice(offset, offset + 64 * 1024).arrayBuffer();
        connection.send({ type: "chunk", data: buffer });
      }
      connection.send({ type: "end" });
    }
    status("Files sent directly.");
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function formatSize(size) { return `${(size / 1024 / 1024).toFixed(2)} MB`; }
  $("join-room").onclick = openSender;
  $("files").onchange = (event) => { files = [...event.target.files]; $("selected-files").innerHTML = files.map((file) => `<div class="selected-item"><span>${escapeHtml(file.name)}</span><small>${formatSize(file.size)}</small></div>`).join(""); $("send-files").disabled = !files.length; };
  $("send-files").onclick = transfer;
  $("change-role").onclick = () => location.reload();
  document.querySelectorAll("[data-role]").forEach((button) => button.onclick = () => {
    role = button.dataset.role; setup.classList.add("hidden"); workspace.classList.remove("hidden");
    senderView.classList.toggle("hidden", role !== "sender"); receiverView.classList.toggle("hidden", role !== "receiver");
    document.querySelectorAll(".sender-only").forEach((element) => element.classList.toggle("hidden", role !== "sender"));
    $("role-label").textContent = `${role.toUpperCase()} MODE`;
    $("workspace-title").textContent = role === "sender" ? "Join a receiver" : "Ready to receive";
    if (role === "receiver") openReceiver();
  });
})();
