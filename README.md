# ShareIt

ShareIt is a browser-based file transfer app. A receiver creates a temporary
six-character code and QR link, then a sender enters or scans it. Files are
sent directly between browsers with WebRTC; the signaling server only helps
the two devices find each other and exchange connection metadata.

## Public signaling

The browser uses the public PeerJS signaling service to introduce the two
devices, so the GitHub Pages site does not need a custom `wss://` URL. The
signaling service sees temporary peer IDs and setup metadata only. Files use a
direct encrypted WebRTC data channel and are not uploaded to PeerJS.

The included `server.js` remains available for self-hosting, but it is not
required for the GitHub Pages version.

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
After deployment, open the GitHub Pages URL on both devices. No backend URL
configuration is required.

## Browser support

Use a current Chrome, Edge, Firefox, or Safari. WebRTC data channels and the
File API are required. A sender can queue multiple files, and transfers are
chunked to avoid loading entire documents into memory.
