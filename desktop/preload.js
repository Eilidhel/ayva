// Exposes the desktop app's features to the share page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ayva', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  selectSource: (sourceId, audio) => ipcRenderer.invoke('select-source', { sourceId, audio }),
  hideFromCapture: (on) => ipcRenderer.send('hide-from-capture', on),
  notify: (title, body, filePath) => ipcRenderer.send('notify', title, body, filePath),

  controlSupported: () => ipcRenderer.invoke('control-supported'),
  setControl: (on) => ipcRenderer.invoke('set-control', on),
  sendControl: (msg) => ipcRenderer.send('control-input', msg),
  onControlForcedOff: (fn) => ipcRenderer.on('control-forced-off', () => fn()),

  fileBegin: (id, name, size, batchKey) => ipcRenderer.send('file-begin', id, name, size, batchKey),
  fileChunk: (id, data) => ipcRenderer.send('file-chunk', id, data),
  fileEnd: (id) => ipcRenderer.invoke('file-end', id),
  batchEnd: (batchKey) => ipcRenderer.invoke('batch-end', batchKey),
  openFolder: (dir) => ipcRenderer.send('open-folder', dir),
  setClipboard: (text) => ipcRenderer.invoke('set-clipboard', text),
  getClipboard: () => ipcRenderer.invoke('get-clipboard'),

  internetSupported: () => ipcRenderer.invoke('internet-supported'),
  startInternet: () => ipcRenderer.invoke('internet-start'),
  stopInternet: () => ipcRenderer.invoke('internet-stop'),
  makeQr: (text) => ipcRenderer.invoke('make-qr', text),
  onInternetProgress: (fn) => ipcRenderer.on('internet-progress', (_e, fraction) => fn(fraction)),
  onInternetStopped: (fn) => ipcRenderer.on('internet-stopped', () => fn()),

  cloudStatus: () => ipcRenderer.invoke('cloud-status'),
  cloudSetup: (apiToken, password) => ipcRenderer.invoke('cloud-setup', apiToken, password),
  cloudRemove: () => ipcRenderer.invoke('cloud-remove'),
  onCloudProgress: (fn) => ipcRenderer.on('cloud-progress', (_e, step) => fn(step)),

  getStartWithWindows: () => ipcRenderer.invoke('get-start-with-windows'),
  setStartWithWindows: (on) => ipcRenderer.invoke('set-start-with-windows', on),
});
