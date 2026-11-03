# Ayva privacy policy

*Effective 3 November 2026*

Ayva shows a computer's screen on your other devices (TVs, phones, tablets, other computers) and, if you choose, a phone's screen, camera or voice on the computer. This policy covers the Ayva Windows program, the Ayva Android app (from GitHub or Google Play) and the Ayva pages your devices open.

## In short

- Ayva has **no accounts, no ads, no analytics and no tracking**.
- The developer of Ayva runs **no servers** and **receives none of your data**.
- Whatever you share goes **from your device to your own computer** (or from your computer to the devices you let in), encrypted, and nowhere else.

## What Ayva uses on your phone or TV, and why

Each of these is used only when you start the feature, and Android asks for your permission first where it requires one.

| What | Why | Where it goes |
|---|---|---|
| **Camera** | To scan the QR code shown on your computer. With **Camera** in Ayva, to show the camera's picture on your computer. | The QR code is read on the phone and not stored. The camera picture goes only to your computer, live, and is not recorded by Ayva. |
| **Microphone** | **Talk**: your voice to your computer's speakers. | Only to your computer, live. Not recorded. |
| **Screen and its sound** | **Show my screen**: your phone's screen and sound on your computer. Android asks every time, and a notification stays up while it runs. | Only to your computer, live. Not recorded by Ayva. |
| **Local network** | To find computers running Ayva on your Wi-Fi, and to connect to them. | Stays on your network. |
| **Notifications** | The notification Android requires while your screen is shown. | Stays on the phone. |
| **Device key** | A key made on your device, kept in Android's secure key store, so your computer recognises your device when you have allowed it. The private part never leaves the device. | Your computer gets only signatures it asked for. |
| **Files you receive** | Files your computer sends you are saved to **Downloads/Ayva**. | Stay on the phone. |

If you set up phone control from your computer (over Android's **Wireless debugging**, which you pair yourself), your computer can send touches, key presses and typed text to the phone. Typed letters that have no key are passed through the phone's clipboard. Nothing is read back from the phone this way.

## What Ayva keeps on your devices

Ayva keeps your settings on the device itself: the computers and addresses you added, your language and colour choices, the devices you allowed (on the computer) and a short history of who connected (on the computer). Uninstalling Ayva removes them. Nothing of this is sent to the developer.

## How things travel

- Pictures, sound, voice, control and files go directly between your devices over an encrypted WebRTC connection (DTLS-SRTP).
- At home, your devices talk to each other over your own network.
- Away from home, Ayva uses services **in your own Cloudflare account**, which you set up yourself: the **fixed address** (a small Cloudflare Worker that only puts your devices in touch) and, when a direct route is not possible, the **backup route** (Cloudflare's relay). The relay passes the encrypted stream along but cannot read it. Cloudflare's own privacy policy applies to your Cloudflare account; the developer of Ayva has no access to it.
- A **link for others** (Cloudflare quick tunnel) works the same way, through Cloudflare, while you share it.
- The Windows program and the GitHub build of the Android app check **GitHub** for new versions; GitHub sees your device's internet address, as with any website. The Google Play build gets its updates from Google Play instead.

## Children

Ayva is a general tool and is not directed at children.

## Your choices

You decide what is shared and with whom: every device must be allowed on your computer, and you can stop sharing, remove a device, or turn off a permission in Android's settings at any time. Since the developer holds no data about you, there is nothing to request or delete from the developer; uninstalling Ayva removes what it kept on that device.

## Changes

If this policy changes, the new version will be published here with a new date.

## Contact

Questions about this policy: open an issue at <https://github.com/Eilidhel/ayva/issues>.
