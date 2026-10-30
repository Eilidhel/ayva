# Ayva

Share your computer screen to a TV or phone, at home or from anywhere, and control the computer from that device.
Open Ayva on your computer and press **Start sharing**. The TV app finds the computer by itself. A phone can connect from any network with a QR code.

[Türkçe](README.tr.md)

- **Zero typing on the TV:** the Android TV app finds computers on your network and connects automatically.
- **From anywhere:** turn on internet access and scan the QR code on your phone. No account and no router setup.
- **Remote control:** use the computer's mouse and keyboard from your phone (touchpad), the TV remote, or another computer's browser.
- **Files and clipboard:** send files and text between the computer and your phone.
- **You decide who connects:** new devices must be approved on the computer. Remembered devices connect without asking, and anyone can be disconnected with one click.
- **Peer-to-peer:** video goes straight from your computer to the viewer over WebRTC, at up to 1440p 60 FPS with sound.
- **Runs in the background:** Ayva can live in the system tray and start with Windows.

## Install

Download both files from the [Releases](../../releases) page.

**Computer (Windows 10/11):** run `Ayva-Setup-x.y.z.exe`. Windows SmartScreen may warn that the app is unsigned; choose **More info → Run anyway**. The installer allows Ayva through the Windows firewall for your local network only.

**TV (Android TV / Google TV / Android set-top boxes):** install `Ayva-TV.apk`:

1. Copy the APK to a USB stick and plug it into the TV or box.
2. Open it with a file manager. If the TV has none, install **File Commander** or **X-plore** from Google Play.
3. When asked, allow installing apps from this source.

You can also use the **Send files to TV** app or `adb install Ayva-TV.apk`.

**Phone:** nothing to install. Scan the QR code, or open the link shown in Ayva.

## Using Ayva

1. Open **Ayva** on the computer, choose a quality (1080p 60 FPS is a good default), and press **Start sharing**.
2. Pick **Entire screen**, or a single window.
3. **TV:** open Ayva on the TV. **Phone at home:** open the address shown under "On the TV open". **Phone elsewhere:** see below.
4. The first time a device connects, the computer asks **Allow / Deny**. Tick **Remember this device** to skip the question next time.

While sharing:

- **Switch screen** changes what is shared without disconnecting anyone.
- The code, links and QR code are **blurred** (press **Show** to see them), and the Ayva window itself is **left out of the stream**.
- **Connected devices** lists who is watching, with a **Disconnect** button for each. Remembered devices can be forgotten there too.

## Watching from anywhere

Press **Allow access over the internet** in Ayva. The first time, Cloudflare's free tunnel tool `cloudflared` is downloaded (~60 MB, from Cloudflare's GitHub releases).
Ayva then shows a `https://….trycloudflare.com` link and a **QR code**. Scan it with your phone on mobile data or any Wi-Fi.

- The link contains a long random **access key**. The 6-digit code alone is not enough over the internet.
- After 10 wrong attempts, an address is blocked for 15 minutes.
- Turning internet access off and on again creates a **new link** and the old one stops working.
- People connecting over the internet can only watch. Control is possible only if you allow it.

Cloudflare offers these quick tunnels free of charge but meant for testing, with no uptime guarantee.

**If the picture never arrives** ("Connecting to the stream…"), the two networks cannot reach each other directly. This happens on some mobile and corporate networks. A **TURN** relay fixes it (see [Configuration](#configuration)).

## Fixed address (Cloudflare, free)

Press **Set up a fixed address (Cloudflare)** in Ayva and follow the steps: on a free Cloudflare account, create an API token from the "Edit Cloudflare Workers" template, paste it into Ayva and choose a viewing password. Ayva deploys itself to your account and gives you a link like `https://ayva.<name>.workers.dev`, with a QR code, that **never changes**. A phone enters the password once and then connects with the same link every time.

**Phone stuck on "Connecting to server…":** some internet providers block `workers.dev` addresses. In Chrome choose **⋮ → Settings → Privacy and security → Use secure DNS → Choose another provider → Cloudflare (1.1.1.1)** and reopen the page. (The Ayva app does this on the computer by itself.)

## Remote control

While sharing, press **Allow control**. Watching devices can then use the computer's mouse and keyboard:

| Device | How |
| --- | --- |
| **Phone / tablet** | The picture works like a touchpad: slide to move, tap to click, two-finger tap to right-click, two-finger slide to scroll, tap then slide to drag. **Keyboard** opens the phone keyboard and adds Esc, Tab, arrow and Win keys. |
| **TV app** | Arrow keys move the cursor and speed up while held. OK clicks, holding OK right-clicks, Play/Pause controls the computer's player, and channel up/down scrolls. |
| **Another computer's browser** | Point and click on the picture and type normally. When a window is shared, click the picture to capture the mouse, and press Esc to release it. |

Control is **off by default** and turns off whenever sharing stops or Ayva restarts. **Ctrl+Alt+K** on the computer switches it off immediately.
Windows does not let other programs control windows running as administrator (such as Task Manager), and Ctrl+Alt+Del cannot be sent.

## Files and clipboard

- **Computer → phone:** **Send file** and **Send clipboard** appear while a phone or browser is watching. Received items show up on the phone with **Save** or **Copy**.
- **Phone → computer:** with control allowed, the phone shows a **Send** button for files and text. Files picked together go into one folder named after the date and time, under `Desktop\Ayva` (for example `Desktop\Ayva\2026-10-30 15.42.07`), and text goes to the computer's clipboard.
  The computer refuses files and text while control is off, so only devices you trust with the mouse and keyboard can drop files on it.

## Running in the background

Closing the window keeps Ayva running in the system tray, so TVs can still find the computer. Right-click the tray icon to **Quit**.
Tick **Start Ayva in the background when Windows starts** in the app (or in the tray menu) to launch it automatically.
The internet link changes each time internet access is turned on, so Ayva cannot yet be reached from outside after a restart without looking at the new link.

## Updates

The installed app checks GitHub Releases for a new version at startup and every few hours, and downloads it in the background.
Restarting would end a running share, so Ayva never installs on its own: click the notification or **Restart to update** in the tray menu when it suits you. **Check for updates** in the tray menu checks right away.

## Browser only (no install)

The server also runs on its own, without the desktop app (remote control, internet access and files from viewers need the app):

1. Install [Node.js](https://nodejs.org) 18 or newer.
2. Download this project and run `start.bat` (Windows), or `npm install` then `npm start`.
3. On the computer open **http://localhost:3000/share**. On the TV, open the address shown there.

## Configuration

Environment variables for `server.js` (also read by the desktop app):

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port (the app tries 3000–3010) |
| `DISCOVERY_PORT` | `41234` | UDP port for TV discovery |
| `TURN_URL` | none | TURN server URL(s), comma separated |
| `TURN_USER` / `TURN_PASS` | none | TURN credentials |
| `ICE_SERVERS` | Google STUN | Full ICE server list as JSON (overrides the TURN variables) |

Run your own TURN server with [coturn](https://github.com/coturn/coturn) or use a hosted one.

## Tips and limits

- **Sound:** keep **Also send the computer's sound** ticked when picking a screen.
- **Quality:** 1080p 60 FPS looks smoothest. Over mobile data the quality drops automatically to fit the connection.
- **Protected content** (Netflix, Disney+, etc.) shows up black, because Windows blocks it from being captured.
- **Many viewers:** each viewer gets its own stream, so upload bandwidth grows with each one. Up to about 5 viewers is comfortable.

## How it works

```
Computer (Ayva app / share page) ── WebSocket ── server.js ── WebSocket ── viewer (watch page)
          └──────────── WebRTC: video, audio, control + transfer channels (peer-to-peer) ───────┘
TV app ── UDP broadcast "AYVA_DISCOVER" :41234 ──> server.js replies with name, port, rooms
Phone elsewhere ── https ── Cloudflare quick tunnel ── server.js (access key required)
```

- `server.js` serves the pages, relays WebRTC signaling within a room (the 6-digit code), asks the host to approve each viewer, checks access keys for tunnel connections, and answers LAN discovery.
- `public/share.js` captures the screen and opens one `RTCPeerConnection` per viewer, with `control` and `transfer` data channels.
- `public/watch.js`, `control.js` and `inbox.js` are the viewer: playback, remote control, and files/clipboard.
- `desktop/` is the Electron app: source picker, input injection (`input.js`, Win32 `SendInput`), tunnel (`tunnel.js`), tray, files and clipboard.
- `android/` is the Android TV app (plain Java, no dependencies): discovery and a full-screen WebView player.

## Building

```bash
npm install
npm run app     # run the desktop app
npm run dist    # build the Windows installer into dist/
```

Android (JDK 17 and the Android SDK are required):

```bash
cd android
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk
```

Pushing a tag like `v0.5.0` makes GitHub Actions build both and attach them to a release (`.github/workflows/build.yml`).

## License

[MIT](LICENSE)
