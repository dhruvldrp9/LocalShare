# ShareIt

ShareIt is a browser-based file transfer app. A receiver creates a temporary
six-character code and QR link, then a sender enters or scans it. Files are
sent directly between browsers with WebRTC; the signaling server only helps
the two devices find each other and exchange connection metadata.

## Run the signaling service

```bash
npm install
npm start
```

The server binds to `0.0.0.0` and can be deployed to Render, Railway, Fly.io,
or a VPS. Set the frontend's `window.SHAREIT_SIGNALING_URL` to its secure
`wss://` URL before publishing the static frontend. The server stores no files.

## How to use

1. Open ShareIt on both devices.
2. The receiver chooses **Receive files**, enters a display name, and shares the
   generated six-character code or QR link.
3. The sender chooses **Send files**, enters the code, or scans the QR link.
4. The receiver accepts the connection request.
5. The sender chooses files and selects **Send files**. The receiver saves each
   completed file.

Codes are cryptographically random, temporary, and removed when the receiver
disconnects. The receiver must approve each sender.

## GitHub Pages

The included workflow publishes the static frontend from the repository root.
GitHub Pages serves the UI, but `server.js` must be deployed separately as a
secure WebSocket service. The frontend supports `window.SHAREIT_SIGNALING_URL`
so the public signaling URL can differ from the GitHub Pages URL.

## Browser support

Use a current Chrome, Edge, Firefox, or Safari. WebRTC data channels and the
File API are required. A sender can queue multiple files, and transfers are
chunked to avoid loading entire documents into memory.
