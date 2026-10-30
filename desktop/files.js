// Saves files that viewers send to this computer. Every send (one file, or
// many picked together) gets its own folder named after the date and time:
//   <root>\2026-10-30 15.42.07\photo.jpg
// root is Desktop\Ayva in the app.

const fs = require('fs');
const path = require('path');

const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024;

function pad(n) {
  return String(n).padStart(2, '0');
}

// Keep only a plain file name; strip anything Windows doesn't allow.
function safeName(name) {
  let safe = path.basename(String(name)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 150);
  if (!safe || safe === '.' || safe === '..') safe = 'file';
  return safe;
}

// taken: paths already handed out, whose files may not be on disk yet
// (phones often send several "IMG_0001.jpg" in one go).
function uniquePath(dir, name, taken) {
  const safe = safeName(name);
  const ext = path.extname(safe);
  const base = safe.slice(0, safe.length - ext.length);
  const used = (p) => taken.has(p.toLowerCase()) || fs.existsSync(p);
  let candidate = path.join(dir, safe);
  for (let i = 2; used(candidate); i++) candidate = path.join(dir, base + ' (' + i + ')' + ext);
  taken.add(candidate.toLowerCase());
  return candidate;
}

class Receiver {
  constructor(root) {
    this.root = root;
    this.files = new Map(); // file id -> { stream, path, written }
    this.batches = new Map(); // batch key -> { dir, count }
  }

  // Windows doesn't allow ":" in names, so the time uses dots.
  newFolder() {
    const d = new Date();
    const name = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
      + `${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
    let dir = path.join(this.root, name);
    for (let i = 2; fs.existsSync(dir); i++) dir = path.join(this.root, name + ' (' + i + ')');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  begin(id, name, size, batchKey) {
    if (size > MAX_FILE_BYTES) return false;
    const key = String(batchKey || id);
    let batch = this.batches.get(key);
    if (!batch) {
      batch = { dir: this.newFolder(), count: 0, taken: new Set() };
      this.batches.set(key, batch);
    }
    batch.count++;
    const file = uniquePath(batch.dir, name, batch.taken);
    this.files.set(String(id), { stream: fs.createWriteStream(file), path: file, written: 0 });
    return true;
  }

  chunk(id, data) {
    const entry = this.files.get(String(id));
    if (!entry) return;
    entry.written += data.length;
    if (entry.written > MAX_FILE_BYTES) {
      entry.stream.destroy();
      fs.rm(entry.path, () => {});
      this.files.delete(String(id));
      return;
    }
    entry.stream.write(Buffer.from(data));
  }

  // Resolves with the saved path once the file is fully written.
  end(id) {
    const entry = this.files.get(String(id));
    if (!entry) return Promise.resolve(null);
    this.files.delete(String(id));
    return new Promise((resolve) => entry.stream.end(() => resolve(entry.path)));
  }

  // The send is complete: where did the files go?
  endBatch(batchKey) {
    const batch = this.batches.get(String(batchKey));
    if (!batch) return null;
    this.batches.delete(String(batchKey));
    return { dir: batch.dir, count: batch.count };
  }

  // Only folders this receiver made.
  owns(dir) {
    const target = path.resolve(String(dir));
    return target.startsWith(path.resolve(this.root) + path.sep) && fs.existsSync(target);
  }
}

module.exports = { Receiver };
