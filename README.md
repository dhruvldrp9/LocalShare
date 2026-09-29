# LocalShare

LocalShare is a browser-based file transfer app for devices on the same local
network. Files are sent directly between browsers with WebRTC; the signaling
server only helps two devices find each other and exchange connection metadata.
File contents never pass through the signaling server.

## Important network note

The frontend can be published to GitHub Pages, but GitHub Pages cannot run the
WebSocket signaling service required for cross-device discovery. For a complete
LAN setup, run the small signaling server on one computer in the network and
open the app through that computer's LAN address:

```bash
npm install
npm start
```

Then visit `http://<host-lan-ip>:8787` on both devices. The app automatically
uses the host and port from the page URL, so users only enter a device name.
The server binds to `0.0.0.0` and accepts signaling connections only;
peer-to-peer file transfer still happens directly between the browsers.

Browsers do not permit a static GitHub Pages site to discover and connect to an
arbitrary private LAN server automatically. For the no-IP-entry experience,
open the app from the LAN machine running `npm start`. GitHub Pages can still
host the interface, but its WebSocket signaling service must be hosted
separately at the same HTTPS origin or the app must be served from the LAN
machine.

## How to use

1. Start the signaling server on a computer connected to the LAN.
2. Open LocalShare on both devices.
3. One person chooses **Send files** and enters a display name.
4. The other chooses **Receive files**, enters a display name, and waits.
5. The sender sees the receiver as available and selects **Request connection**.
6. The receiver accepts the request.
7. The sender chooses files and selects **Send files**. The receiver saves each
   completed file.

The receiver's availability is advertised before a sender makes a request.
Presence disappears automatically when the browser closes or loses its
signaling connection.

## GitHub Pages

The included workflow publishes the static frontend from the repository root
whenever `main` is updated. In GitHub, enable **Pages → Build and deployment →
Source: GitHub Actions**. GitHub Pages serves `index.html`, `styles.css`, and
`app.js`; it does not serve `server.js`.

For a public HTTPS deployment, host `server.js` separately with TLS and use a
`wss://` URL in the app. For LAN-only use, keep the signaling server bound to
the private network and do not expose it to the public internet.

## Browser support

Use a current Chrome, Edge, Firefox, or Safari. WebRTC data channels and the
File API are required. A sender can queue multiple files, and transfers are
chunked to avoid loading entire documents into memory.
