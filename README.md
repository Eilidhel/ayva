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

**TV (Android TV / Google TV / Android set-top boxes):** install `Ayva-Android.apk`:

1. Copy the APK to a USB stick and plug it into the TV or box.
2. Open it with a file manager. If the TV has none, install **File Commander** or **X-plore** from Google Play.
3. When asked, allow installing apps from this source.

You can also use the **Send files to TV** app or `adb install Ayva-Android.apk`.

**Android phone (recommended):** open the Releases page on the phone, download `Ayva-Android.apk` (the same app as the TV), open it and allow installing from your browser. At home the app finds the computer by itself. For away from home, tap **📷 Scan the QR code** and scan the code shown in Ayva on the computer (the phone's own camera app would open it in the browser instead), or tap **+ Add fixed address** and paste the address. The fixed address is kept for next time. The app keeps the phone's [device key](#security) in the Android Keystore, and handles the microphone, sending files and saving recordings.

**iPhone / iPad:** Apple does not allow installing apps from outside the App Store, so Ayva runs in Safari. Open the **fixed address** in Safari, then tap **Share → Add to Home Screen**. Ayva then gets its own icon and opens full screen like an app, with its own storage (clearing Safari's history does not remove its device key). The microphone works there too.

**Any other phone or browser:** nothing to install. Scan the QR code, or open the link shown in Ayva. To be remembered, a browser needs an https address (the fixed address or the internet link); on `http://192.168.x.x` it can watch but is asked about every time.

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

**If the picture never arrives** ("Connecting to the stream…"), the two networks cannot reach each other directly. This happens on some mobile and corporate networks. The [backup route](#backup-route-cloudflare-turn) fixes it.

## Fixed address (Cloudflare, free)

Press **Set up a fixed address (Cloudflare)** in Ayva and follow the steps: on a free Cloudflare account, create an API token from the "Edit Cloudflare Workers" template, paste it into Ayva and choose a viewing password. Ayva deploys itself to your account and gives you a link like `https://ayva.<name>.workers.dev`, with a QR code, that **never changes**. A phone enters the password once and then connects with the same link every time.

**Phone stuck on "Connecting to server…":** some internet providers block `workers.dev` addresses. In Chrome choose **⋮ → Settings → Privacy and security → Use secure DNS → Choose another provider → Cloudflare (1.1.1.1)** and reopen the page. (The Ayva app does this on the computer by itself.) The Android app needs no setting: on such networks it sends the connection's opening message in two parts, so the filter cannot read the address, without touching the encryption.

## Backup route (Cloudflare TURN)

Normally the picture goes straight from your computer to the phone. Some networks don't allow that, and the phone then stays on **Connecting to the stream…**. The backup route sends the picture through a relay in your own free Cloudflare account instead, only for those connections.

### When it helps

| Situation | Without the backup route | With it |
| --- | --- | --- |
| Same Wi-Fi at home | Works | Not used |
| Most home internet and mobile data | Works directly | Not used |
| Mobile operators that put many users behind one address (CGNAT) | Often stuck | Works |
| Work, school, hotel, café and hospital Wi-Fi that blocks UDP | Stuck | Works: the relay can also go over port 443, like an ordinary https site |
| Networks that block Cloudflare entirely, or only allow a few sites | Stuck | Still stuck |
| This month's limit reached (see below) | | Off until next month |

The relay adds very little delay because Cloudflare has servers close to both ends. Remote control may feel slightly slower.

### What it costs

Cloudflare gives **1,000 GB a month free**, then charges $0.05 per GB ([pricing](https://developers.cloudflare.com/realtime/sfu/pricing/)). Only traffic that actually goes through the relay counts; devices that connect directly use none. As a guide, 1080p 60 FPS is about 4–5 GB an hour, and 720p about 1.5–2 GB an hour.

Ayva counts what goes over the relay and **stops using it at a monthly limit you choose (800 GB by default)**, so it stays inside the free allowance. Ayva's count is an estimate; the exact figure is in the Cloudflare dashboard under Realtime → TURN Server → Analytics.

### Setting it up (about 3 minutes)

The backup route is separate from the fixed address. It works with the fixed address and with internet links, but you need a Cloudflare account either way (the free plan is enough).

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) (or create a free account).
2. In the menu, open **Realtime** (on some accounts **Calls**), then **TURN Server**, and press **Create** (or **Create TURN Key**). Any name will do, for example `ayva`.
3. Cloudflare shows two values: **Turn Token ID** and **API Token**. The API Token is shown **only once**, so keep the page open.
4. In Ayva, open **Backup route (Cloudflare TURN)** under the code, paste both values and press **Turn on**. Ayva checks them with Cloudflare before keeping them.

To turn it off, press **Turn off the backup route** in Ayva. To make the key useless everywhere, also delete it in the Cloudflare dashboard.

### Settings

- **Monthly limit (GB):** when this much has gone over the relay in a calendar month, Ayva stops handing it out and tells you. It starts again next month, or when you raise the limit.
- **Hide this computer's IP address:** with a direct connection, the viewing device can see your home's IP address, which reveals roughly where you are and your internet provider. With this ticked, devices over the internet always connect through the relay and only see Cloudflare's address. It uses the allowance for every internet connection, not just the difficult ones.

While a device is using the relay, **Connected devices** shows **backup route** next to it.

### Security

- **The picture stays private.** Video, sound and control are end-to-end encrypted by WebRTC. The relay only passes on encrypted packets; Cloudflare cannot see what you share. It can see which addresses connect, when, and how much data passes.
- **The key never leaves this computer.** The API Token is stored encrypted with Windows' own data protection (DPAPI) and is never sent to a page, a phone or the fixed address. Ayva uses it only to ask Cloudflare for short-lived credentials.
- **Each device gets its own credentials, only after you let it in.** Only devices connecting over the internet get them, and only after approval and their [device key](#security) check. Devices on your home network never get them. Credentials last 4 hours and are renewed while the device watches; they are **revoked as soon as the device leaves** or you disconnect it.
- **Worst case.** If someone copied a device's credentials, they could only use the relay (not see your screen or reach your computer), until the credentials are revoked or expire, and never beyond your monthly limit. If you think the API Token itself leaked (it would take access to your computer), delete the key in the Cloudflare dashboard and create a new one.

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

## Starting from the phone or TV

Under **Remembered devices** in the app, each device has two boxes, both off by default:

- **Can start sharing:** the device shows **Start sharing** while it waits, and **Stop sharing** while it watches. It shares the computer's main screen (with sound, unless you untick that in the picker), and the computer shows a notification every time.
- **Can control:** while sharing, the device can use the mouse and keyboard (and send files) without you pressing **Allow control**. Other devices still only watch. **Ctrl+Alt+K** stops it until sharing starts again.

Only devices you remembered when allowing them get these boxes, never one you let in just once. **Forget** takes both rights away at once.

## Security

**Device keys.** When you remember a device, it creates a key that never leaves it: the Android app keeps it in the Android Keystore, browsers keep a non-extractable WebCrypto key. Each time the device connects, the computer sends it a one-time challenge to sign, and nothing (picture, rights) reaches it before the signature checks out. Someone who overhears or copies the device's id therefore cannot pose as it; the computer cuts them off and tells you. If one of your own devices loses its key (its browser data was cleared, say), **Forget** it and let it in again. Devices remembered before 0.8.0 are asked about once more to get a key.

**PIN.** Under **Remembered devices**, **PIN** sets a 4–8 digit PIN for a device. The device then has to enter it on every connection before it may start sharing or control, so a stolen unlocked phone is not enough. The PIN is stored on the computer only as a salted hash, the device sends a hash tied to that connection, and five wrong tries lock the device's rights for 15 minutes (the computer tells you).

**Connection history.** **Connection history** at the bottom of the app shows who connected and when, how long they stayed, whom you let in or turned away, and who started sharing, recorded or turned the microphone on. Suspicious events, such as a wrong PIN or a device that could not prove its key, show in red. The history stays on this computer (the last 300 events), and **Clear history** deletes it.

## Recording on the phone

**Record** on the phone or browser records what it is watching, on that device. When you stop, the video (MP4 where supported, otherwise WebM) appears with a **Save** button. Nothing extra goes over the network. The computer shows that device as **recording** and sends a notification, so recordings are never secret.
The recording is kept in the phone's memory until it is saved, at about 30 MB per minute, so very long recordings can run out of memory on older phones.

## Talking through the computer

**Talk** sends the phone's microphone to the computer's speakers while you watch. The computer accepts it from remembered devices, or from any device while control is allowed, and shows **microphone on** next to it. **Disconnect** or **Forget** stops it at once.
Browsers only allow the microphone on https pages, so this works at the fixed address or the internet link, not at `http://192.168.x.x`. **You don't hear yourself.** The computer's sound is captured from the speakers' mix, which includes your voice as the computer plays it. While you talk, Ayva subtracts exactly that voice from the sound it sends back, so the phone gets everything else (other people, games, music) without your own voice. It takes about three seconds to lock on after you start talking; after that your voice is about 45 dB quieter in the returned sound, which is inaudible.

**Bluetooth headphones on the phone:** using a Bluetooth headset's microphone switches it to "phone call" mode, and Android then stops the stream's sound in the headset. So while a Bluetooth headset is connected, **Talk** uses the phone's own microphone, and the stream keeps playing in the headphones.

### Talking in Discord (or any other app)

Ayva plays the phone's voice on the computer, and Windows has no way for one program to hand sound to another's microphone. A free virtual audio cable does that:

1. Install **VB-CABLE** from [vb-audio.com/Cable](https://vb-audio.com/Cable/) (run the setup as administrator, then restart Windows).
2. In Ayva, under **Phone voice ("Talk") plays on**, choose **CABLE Input**.
3. In Discord, open **User Settings → Voice & Video** and set **Input Device** to **CABLE Output**.

Now what you say into the phone goes to Discord. If the computer's sound is being shared, the phone also hears the others in Discord, and your own voice no longer comes back to you, because it goes into the cable instead of the speakers. Set the output back to **Default speakers** to hear the phone on the computer again.

## Running in the background

Closing the window keeps Ayva running in the system tray, so TVs can still find the computer. Right-click the tray icon to **Quit**.
Tick **Start Ayva in the background when Windows starts** in the app (or in the tray menu) to launch it automatically.
The internet link changes each time internet access is turned on, so Ayva cannot yet be reached from outside after a restart without looking at the new link.

## Updates

The installed app checks GitHub Releases for a new version at startup and every few hours, and downloads it in the background.
Restarting would end a running share, so Ayva never installs on its own: click the notification, or **Restart and update** at the bottom of the Ayva window (or in the tray menu), when it suits you. The same line shows the installed version, and **Check for updates** there checks right away.

The Android app (0.8.1 and later) also checks GitHub Releases when it opens. When there is a new version, **⬆ Update to Ayva x.y.z** appears at the top of the list: tap it to download the update and open Android's own install prompt. The first time, Android asks you to let Ayva install apps. The version line at the bottom of the list checks right away. Going from 0.8.0 to 0.8.1 is a one-time manual install.

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

These are for running the server on its own, or for your own TURN server ([coturn](https://github.com/coturn/coturn) or a hosted one). In the desktop app, the [backup route](#backup-route-cloudflare-turn) is the simpler way.

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
- `android/` is the Android app for TVs and phones (plain Java, no dependencies): discovery, fixed addresses, and a full-screen WebView player with the device key in the Android Keystore.

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
