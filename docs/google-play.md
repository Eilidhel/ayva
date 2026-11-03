# Publishing Ayva on Google Play

Everything needed to put the Android app on Google Play, ready for the day we decide to. The code side is done; what is left is filled in on the Play Console.

## What is ready in the repository

| Requirement | Where |
|---|---|
| **No self-updating** (Play allows updates only through Play) | The `play` build flavor has no updater and no `REQUEST_INSTALL_PACKAGES` permission. Its Settings say updates come from Google Play and open Ayva's Play page. The `github` flavor (the APK on GitHub Releases) keeps updating itself. |
| **Target API level** | `targetSdk 36` (Android 16), with content kept clear of the system bars (`SystemBars`), which Android 15+ draws over apps. Back keeps working as before (`enableOnBackInvokedCallback="false"`). |
| **App bundle (AAB)** | Every CI run builds `Ayva-Play.aab` as the workflow artifact **android-play-bundle** (Actions → the run → Artifacts). It is not attached to releases. Locally: `gradlew bundlePlayRelease` → `android/app/build/outputs/bundle/playRelease/app-play-release.aab`. |
| **Privacy policy** | [PRIVACY.md](../PRIVACY.md), public at `https://github.com/Eilidhel/ayva/blob/main/PRIVACY.md`. |
| **Data safety answers** | [Below](#data-safety). |
| **Foreground service declaration** | [Below](#foreground-service-declaration). |
| **Store listing text** | [Below](#store-listing). |

## Before the first upload

1. **Developer account.** A one-time fee of 25 USD and an identity check, at <https://play.google.com/console>.
2. **Closed test first.** Personal accounts created after 13 November 2023 must run a closed test with at least **12 testers for 14 days in a row** before they can publish to everyone. Testers join with their Google account through an opt-in link.
3. **Signing.** Play signs the app with its own *app signing key* and accepts uploads signed with your *upload key*.
   - **Recommended: give Play the key the GitHub APK is signed with** (Play Console → Setup → App signing → "Use a different key" → export with Google's PEPK tool). Then both builds have the same signature: people who installed Ayva from GitHub can move to the Play version without uninstalling, and the other way round.
   - Otherwise Play makes a new key, and anyone with the GitHub APK must uninstall it once before installing from Play (their saved computers and settings are lost).
   - The CI bundle is signed with the same keystore as the APK (secret `ANDROID_KEYSTORE_BASE64`), which can serve as the upload key.
4. **Version numbers.** The bundle has the same `versionCode` as the release (0.8.10 → 810), so each Play upload must come from a newer release.

## App content (Play Console → Policy → App content)

| Question | Answer |
|---|---|
| Privacy policy | `https://github.com/Eilidhel/ayva/blob/main/PRIVACY.md` |
| Ads | No ads |
| App access | "All or some functionality is restricted" → add instructions (see [For the reviewer](#for-the-reviewer)) |
| Content rating | Category **Utility, productivity, communication or other**. Violence, sexuality, language, drugs, gambling: none. "Can users interact or exchange content?" **Yes** (voice and screen sharing with people the user lets in). "Shares the user's location?" No. "Allows purchases?" No. |
| Target audience | **18 and over** (keeps the app out of the Families programme; nothing in Ayva is aimed at children). |
| News app | No |
| Government app | No |
| Financial features | None |
| Health | None |
| Data safety | See below |

### Data safety

Play counts data as *collected* when it leaves the device for the developer or a third party. Ayva sends nothing to the developer, has no analytics or crash reporting, and the screen, camera, voice and files go end-to-end encrypted (WebRTC, DTLS-SRTP) to the user's own computer, at most through relays in the user's own Cloudflare account that cannot read them. Data sent end-to-end encrypted, and data that stays on the device, does not count as collected.

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| (If asked) Is all user data encrypted in transit? | Yes |
| (If asked) Can users ask for their data to be deleted? | No data is collected; uninstalling removes what is on the device |

If a reviewer disagrees, the cautious alternative is to declare **Audio (voice), Photos and videos** and **App activity: Other user-generated content** as *collected, not shared, processed ephemerally, required only when the user starts the feature, encrypted in transit*, for the purpose **App functionality**.

### Foreground service declaration

Play Console → App content → **Foreground service permissions** → `FOREGROUND_SERVICE_MEDIA_PROJECTION`.

- **Task type:** Media projection.
- **Description:**
  > Ayva can show the phone's screen and sound on the user's own computer ("Show my screen"). The user starts it from the Ayva page, Android's own screen-capture prompt asks for consent every time, and a notification with a Stop button stays up while it runs. The capture runs in a foreground service so it keeps going while the user switches to other apps, which is the purpose of the feature (for example showing a video or another app on the computer). It stops when the user taps Stop, on the phone or the computer, or when the screen locks.
- **Impact if deferred or interrupted:** The user's screen would stop showing on their computer as soon as they leave the Ayva app.
- **Video** (unlisted YouTube link, 30–60 s), showing:
  1. Ayva open on the computer and the phone connected to it.
  2. On the phone: **More → Show my screen**, Android's capture prompt, **Start now**.
  3. The phone's screen appearing in a window on the computer, and the notification on the phone.
  4. Switching to another app on the phone; the computer keeps showing it.
  5. **Stop** in the notification; the window on the computer closes.

### For the reviewer

Paste into App access → instructions:

> Ayva needs the free Ayva program running on a Windows computer on the same Wi-Fi network: download Ayva-Setup from https://github.com/Eilidhel/ayva/releases/latest, install and open it, and choose **Start sharing**. Then open the Ayva app on the phone or TV: the computer appears in the list (or tap **Scan the QR code** and scan the code shown on the computer). Allow the device on the computer when it asks. No account or login is needed. A video of the whole flow: <link>.

Reviewers often cannot set up a second device, so the video link matters; reuse the foreground service video or record a longer walkthrough.

### Things a reviewer may ask about

- **Phone control from the computer** is not done by the app itself. The computer starts a small helper over Android's **Wireless debugging** (ADB), which the user turns on and pairs in Developer options, the same way scrcpy works. The app has no accessibility service.
- **SplitProxy** is a local proxy on 127.0.0.1 that only carries the app's own connection to the user's fixed address (`*.workers.dev`), because some networks drop connections to that domain by name. It does not decrypt anything and accepts no other destination.
- **Cleartext traffic** is allowed for the user's computer on the local network (`http://192.168…`); everything leaving the network is HTTPS or WebRTC.

## Store listing

**App name:** Ayva

**Short description** (max. 80 characters)
- EN: `Watch your computer's screen on your TV or phone, and show your phone on it.`
- TR: `Bilgisayarının ekranını TV'de, telefonda izle; telefonunu bilgisayarda göster.`

**Full description (EN)**

> Ayva puts your computer's screen on your TV, phone or tablet, at home or away, without accounts or subscriptions.
>
> • Watch your computer on the TV: open the Ayva program on your Windows computer and the TV finds it on your Wi-Fi.
> • Use your computer from the phone: move the mouse, type, scroll, send files and the clipboard.
> • Show your phone on the computer: its screen and sound in a window, and its camera too.
> • Talk: your voice from the phone to the computer's speakers.
> • Away from home: a fixed address in your own Cloudflare account, so it works from anywhere.
> • Private by design: no accounts, no ads, no tracking. Everything goes encrypted straight between your own devices.
>
> Ayva needs the free Ayva program on a Windows computer: https://github.com/Eilidhel/ayva
> Ayva is open source.

**Full description (TR)**

> Ayva bilgisayarının ekranını TV'ne, telefonuna ya da tabletine getirir; evde de dışarıda da, hesap ya da abonelik olmadan.
>
> • Bilgisayarını TV'de izle: Windows bilgisayarında Ayva programını aç, TV onu Wi-Fi'da bulur.
> • Bilgisayarını telefondan kullan: fareyi oynat, yaz, kaydır, dosya ve pano gönder.
> • Telefonunu bilgisayarda göster: ekranı ve sesi bir pencerede, istersen kamerası da.
> • Konuş: sesin telefondan bilgisayarın hoparlörlerine.
> • Dışarıdayken: kendi Cloudflare hesabında sabit bir adres, her yerden çalışır.
> • Gizli kalır: hesap yok, reklam yok, takip yok. Her şey şifreli olarak doğrudan kendi cihazların arasında gider.
>
> Ayva, Windows bilgisayarda ücretsiz Ayva programını gerektirir: https://github.com/Eilidhel/ayva
> Ayva açık kaynaktır.

**Category:** Tools. **Contact e-mail:** required by Play and shown on the listing (choose one you are happy to make public).

**Graphics to prepare**

| Asset | Size |
|---|---|
| App icon | 512 × 512 PNG |
| Feature graphic | 1024 × 500 |
| Phone screenshots | 2–8, e.g. 1080 × 1920 |
| Android TV banner | 1280 × 720 (needed for the TV listing) |
| Android TV screenshots | at least 1, 1920 × 1080 |

## Android TV

Ayva already runs on TV (Leanback launcher entry, banner, D-pad navigation, no touchscreen required). To list it for TV, opt in under **Release → Advanced settings → Form factors → Android TV**; Google then reviews it separately against its TV quality guidelines. Say in the listing that on TV Ayva watches the computer only (TVs cannot share their own screen).

## Each later release

1. Release as usual (version bump, tag, CI).
2. Download **android-play-bundle** from that run's artifacts.
3. Play Console → the track (closed test, later production) → **Create new release** → upload `Ayva-Play.aab` → add release notes (from the GitHub release) → roll out.
