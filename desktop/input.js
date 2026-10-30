// Turns remote-control messages into real mouse and keyboard input on Windows
// (user32 SendInput via koffi). Other platforms: control is unavailable.
//
// Windows blocks injected input into windows running as administrator
// (UIPI), and Ctrl+Alt+Del can never be sent. Everything else works.

const supported = process.platform === 'win32';

let user32 = null;
let SendInput, GetSystemMetrics, GetCursorPos, SetCursorPos, MapVirtualKeyW;
let INPUT, POINT;

const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;
const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_HWHEEL = 0x1000;
const MOUSEEVENTF_VIRTUALDESK = 0x4000;
const MOUSEEVENTF_ABSOLUTE = 0x8000;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;
const SM_XVIRTUALSCREEN = 76;
const SM_YVIRTUALSCREEN = 77;
const SM_CXVIRTUALSCREEN = 78;
const SM_CYVIRTUALSCREEN = 79;

const BUTTONS = {
  left: [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP],
  right: [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP],
  middle: [MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP],
};

// KeyboardEvent.code -> Windows virtual-key code. Only these keys can be sent.
const VK = {
  Backspace: 0x08, Tab: 0x09, Enter: 0x0d, NumpadEnter: 0x0d,
  ShiftLeft: 0xa0, ShiftRight: 0xa1, ControlLeft: 0xa2, ControlRight: 0xa3,
  AltLeft: 0xa4, AltRight: 0xa5, MetaLeft: 0x5b, MetaRight: 0x5c, ContextMenu: 0x5d,
  Pause: 0x13, CapsLock: 0x14, Escape: 0x1b, Space: 0x20,
  PageUp: 0x21, PageDown: 0x22, End: 0x23, Home: 0x24,
  ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28,
  PrintScreen: 0x2c, Insert: 0x2d, Delete: 0x2e,
  NumpadMultiply: 0x6a, NumpadAdd: 0x6b, NumpadSubtract: 0x6d, NumpadDecimal: 0x6e, NumpadDivide: 0x6f,
  NumLock: 0x90, ScrollLock: 0x91,
  Semicolon: 0xba, Equal: 0xbb, Comma: 0xbc, Minus: 0xbd, Period: 0xbe, Slash: 0xbf,
  Backquote: 0xc0, BracketLeft: 0xdb, Backslash: 0xdc, BracketRight: 0xdd, Quote: 0xde, IntlBackslash: 0xe2,
  MediaPlayPause: 0xb3, MediaTrackNext: 0xb0, MediaTrackPrevious: 0xb1, MediaStop: 0xb2,
  AudioVolumeMute: 0xad, AudioVolumeDown: 0xae, AudioVolumeUp: 0xaf,
};
for (let i = 0; i < 26; i++) VK['Key' + String.fromCharCode(65 + i)] = 0x41 + i;
for (let i = 0; i < 10; i++) {
  VK['Digit' + i] = 0x30 + i;
  VK['Numpad' + i] = 0x60 + i;
}
for (let i = 1; i <= 12; i++) VK['F' + i] = 0x6f + i;

// Keys that need the "extended" flag to be told apart from their twins
// (e.g. arrow keys vs. the number pad).
const EXTENDED = new Set([
  'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Insert', 'Delete', 'Home', 'End',
  'PageUp', 'PageDown', 'ControlRight', 'AltRight', 'MetaLeft', 'MetaRight', 'ContextMenu',
  'NumpadDivide', 'NumpadEnter', 'NumLock', 'PrintScreen',
]);

function init() {
  if (user32 || !supported) return;
  const koffi = require('koffi');
  user32 = koffi.load('user32.dll');

  const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
    dx: 'long', dy: 'long', mouseData: 'uint32', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr_t',
  });
  const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
    wVk: 'uint16', wScan: 'uint16', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr_t',
  });
  const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', { uMsg: 'uint32', wParamL: 'uint16', wParamH: 'uint16' });
  const UNION = koffi.union('INPUT_UNION', { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT });
  INPUT = koffi.struct('INPUT', { type: 'uint32', u: UNION });
  POINT = koffi.struct('POINT', { x: 'long', y: 'long' });

  SendInput = user32.func('uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)');
  GetSystemMetrics = user32.func('int __stdcall GetSystemMetrics(int nIndex)');
  GetCursorPos = user32.func('bool __stdcall GetCursorPos(_Out_ POINT *lpPoint)');
  SetCursorPos = user32.func('bool __stdcall SetCursorPos(int X, int Y)');
  MapVirtualKeyW = user32.func('uint32 __stdcall MapVirtualKeyW(uint32 uCode, uint32 uMapType)');
}

let inputSize = 0;

function send(input) {
  if (!inputSize) inputSize = require('koffi').sizeof(INPUT);
  return SendInput(1, [input], inputSize);
}

function sendMouse(flags, dx, dy, data) {
  return send({ type: INPUT_MOUSE, u: { mi: { dx: dx || 0, dy: dy || 0, mouseData: data || 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } });
}

function sendKey(vk, scan, flags) {
  return send({ type: INPUT_KEYBOARD, u: { ki: { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } } });
}

// ---- Public API ----

function moveBy(dx, dy) {
  const p = {};
  GetCursorPos(p);
  SetCursorPos(Math.round(p.x + dx), Math.round(p.y + dy));
}

// (x, y) in physical screen pixels, anywhere on the virtual desktop.
function moveTo(x, y) {
  const vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
  const vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
  const vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
  const vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
  const nx = Math.round(((x - vx) * 65535) / Math.max(1, vw - 1));
  const ny = Math.round(((y - vy) * 65535) / Math.max(1, vh - 1));
  sendMouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, nx, ny);
}

function button(name, down) {
  const flags = BUTTONS[name];
  if (flags) sendMouse(down ? flags[0] : flags[1]);
}

// Wheel deltas in Windows units (120 = one notch); positive dy scrolls up.
function wheel(dx, dy) {
  if (dy) sendMouse(MOUSEEVENTF_WHEEL, 0, 0, dy | 0);
  if (dx) sendMouse(MOUSEEVENTF_HWHEEL, 0, 0, dx | 0);
}

function key(code, down) {
  const vk = VK[code];
  if (!vk) return false;
  const scan = MapVirtualKeyW(vk, 0) & 0xffff;
  let flags = down ? 0 : KEYEVENTF_KEYUP;
  if (EXTENDED.has(code)) flags |= KEYEVENTF_EXTENDEDKEY;
  sendKey(vk, scan, flags);
  return true;
}

// Types text as Unicode characters, independent of the keyboard layout.
function text(str) {
  for (const ch of String(str)) {
    if (ch === '\n' || ch === '\r') {
      key('Enter', true);
      key('Enter', false);
      continue;
    }
    for (let i = 0; i < ch.length; i++) {
      const unit = ch.charCodeAt(i);
      sendKey(0, unit, KEYEVENTF_UNICODE);
      sendKey(0, unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP);
    }
  }
}

module.exports = {
  supported,
  init,
  moveBy,
  moveTo,
  button,
  wheel,
  key,
  text,
  isKnownKey: (code) => Object.prototype.hasOwnProperty.call(VK, code),
};
