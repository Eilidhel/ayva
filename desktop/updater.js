// Automatic updates from GitHub Releases. New versions download in the
// background; installing restarts Ayva, which would end a running share, so it
// only happens when the user asks for it (notification or tray menu).

const { app, Notification } = require('electron');
const path = require('path');

const FIRST_CHECK_DELAY = 30 * 1000;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

class Updater {
  constructor(isTurkish, onChange) {
    this.tr = isTurkish;
    this.onChange = onChange; // called when the tray menu should be rebuilt
    this.state = 'idle'; // idle | checking | downloading | ready | latest | error
    this.version = null;
    this.manual = false; // the current check was started from the tray menu
    this.autoUpdater = null;
  }

  // Only installed builds can update themselves; `electron .` runs skip this.
  get supported() {
    return app.isPackaged && process.platform === 'win32';
  }

  start() {
    if (!this.supported) return;
    const { autoUpdater } = require('electron-updater');
    this.autoUpdater = autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => this.set('checking'));
    autoUpdater.on('update-available', (info) => {
      this.version = info.version;
      this.set('downloading');
    });
    autoUpdater.on('update-not-available', () => {
      this.set('latest');
      if (this.manual) this.notify(this.tr() ? 'Ayva güncel.' : 'Ayva is up to date.');
      this.manual = false;
    });
    autoUpdater.on('update-downloaded', (info) => {
      this.version = info.version;
      this.set('ready');
      this.manual = false;
      this.notify(
        this.tr()
          ? 'Ayva ' + info.version + ' hazır. Yeniden başlatıp kurmak için tıkla.'
          : 'Ayva ' + info.version + ' is ready. Click to restart and install.',
        () => this.install(),
      );
    });
    autoUpdater.on('error', () => {
      this.set('error');
      if (this.manual) {
        this.notify(this.tr() ? 'Güncellemeler denetlenemedi.' : 'Could not check for updates.');
      }
      this.manual = false;
    });

    setTimeout(() => this.check(false), FIRST_CHECK_DELAY);
    setInterval(() => this.check(false), CHECK_INTERVAL);
  }

  check(manual) {
    if (!this.autoUpdater || ['checking', 'downloading', 'ready'].includes(this.state)) return;
    this.manual = !!manual;
    this.autoUpdater.checkForUpdates().catch(() => {});
  }

  install() {
    if (this.state !== 'ready') return;
    // Silent install, then start Ayva again.
    this.autoUpdater.quitAndInstall(true, true);
  }

  // Entry for the tray menu, or null when updates are not supported.
  menuItem() {
    if (!this.supported) return null;
    const tr = this.tr();
    switch (this.state) {
      case 'ready':
        return {
          label: tr ? 'Yeniden başlat ve güncelle (' + this.version + ')' : 'Restart to update (' + this.version + ')',
          click: () => this.install(),
        };
      case 'checking':
        return { label: tr ? 'Güncellemeler denetleniyor…' : 'Checking for updates…', enabled: false };
      case 'downloading':
        return { label: tr ? 'Güncelleme indiriliyor…' : 'Downloading update…', enabled: false };
      default:
        return { label: tr ? 'Güncellemeleri denetle' : 'Check for updates', click: () => this.check(true) };
    }
  }

  set(state) {
    this.state = state;
    this.onChange();
  }

  notify(body, onClick) {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: 'Ayva', body, icon: path.join(__dirname, 'icon.png') });
    if (onClick) n.on('click', onClick);
    n.show();
  }
}

module.exports = { Updater };
