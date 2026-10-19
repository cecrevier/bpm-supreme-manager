const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');

const extensions = new Set(['.mp3', '.wav', '.aif', '.aiff', '.m4a', '.flac']);
const fingerprint = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+\(\d+\)$/i, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();

function visit(folder, files) {
  let entries;
  try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'Serato Playlists') visit(fullPath, files);
    } else if (entry.isFile() && !entry.name.startsWith('.') && extensions.has(path.extname(entry.name).toLowerCase())) {
      const key = fingerprint(path.basename(entry.name, path.extname(entry.name)));
      if (key && !files.has(key)) files.set(key, fullPath);
    }
  }
}

try {
  const files = new Map();
  visit(workerData.destination, files);
  parentPort.postMessage({ entries: [...files] });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
