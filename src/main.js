const { app, BrowserWindow, dialog, ipcMain, session, shell, safeStorage } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const NodeID3 = require('node-id3');

const API = 'https://api.download.bpmsupreme.com/v1';
const PARTITION = 'persist:bpm-supreme-account';
let mainWindow;
let loginWindow;
let downloaderWindow;
let downloadsActive = 0;
let authWaiters = [];
let authCheckInProgress = false;
let audioIndexCache = null;
const AUTH_COOKIE_NAMES = ['CloudFront-Key-Pair-Id', 'CloudFront-Policy', 'CloudFront-Signature'];

const userFile = name => path.join(app.getPath('userData'), name);
const defaultDestination = () => path.join(app.getPath('downloads'), 'BPM Supreme');

async function readJSON(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJSON(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(value, null, 2));
}
async function persistAuthCookies() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  const partition = session.fromPartition(PARTITION);
  const cookies = (await partition.cookies.get({ domain: 'bpmsupreme.com' })).filter(cookie => AUTH_COOKIE_NAMES.includes(cookie.name));
  if (!AUTH_COOKIE_NAMES.every(name => cookies.some(cookie => cookie.name === name))) return false;
  const portable = cookies.map(cookie => ({ name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path || '/', secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite }));
  await fsp.writeFile(userFile('auth-cookies.enc'), safeStorage.encryptString(JSON.stringify(portable)).toString('base64'), 'utf8');
  return true;
}
async function restoreAuthCookies() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  try {
    const encrypted = Buffer.from(await fsp.readFile(userFile('auth-cookies.enc'), 'utf8'), 'base64');
    const cookies = JSON.parse(safeStorage.decryptString(encrypted));
    const partition = session.fromPartition(PARTITION);
    for (const cookie of cookies) {
      if (!AUTH_COOKIE_NAMES.includes(cookie.name) || !cookie.value) continue;
      const domain = cookie.domain || '.bpmsupreme.com';
      await partition.cookies.set({
        url: `https://${domain.replace(/^\./, '')}${cookie.path || '/'}`,
        name: cookie.name, value: cookie.value, domain, path: cookie.path || '/',
        secure: cookie.secure !== false, httpOnly: Boolean(cookie.httpOnly),
        sameSite: cookie.sameSite || 'unspecified', expirationDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
      });
    }
    await partition.cookies.flushStore();
    return true;
  } catch { return false; }
}
async function clearPersistedAuthentication() {
  await fsp.unlink(userFile('auth-cookies.enc')).catch(() => {});
}
function installAuthCookiePersistence() {
  const partition = session.fromPartition(PARTITION);
  let timer;
  partition.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (removed || !AUTH_COOKIE_NAMES.includes(cookie.name)) return;
    clearTimeout(timer);
    timer = setTimeout(() => persistAuthCookies().catch(() => {}), 200);
  });
}
async function settings() {
  return readJSON(userFile('settings.json'), { destination: defaultDestination(), downloadMode: 'balanced', language: 'system' });
}
const MAIN_MESSAGES = {
  fr: { loginTitle: 'Connexion BPM Supreme', authRequired: 'Connexion BPM Supreme requise pour continuer.', rateLimit: seconds => `Limite BPM atteinte — reprise automatique dans ${seconds} s`, unknownError: 'Erreur inconnue', rateLimitPersistent: 'la limite de requêtes persiste après plusieurs reprises.', noLink: 'Aucun lien de téléchargement retourné.', interrupted: state => `Téléchargement du fichier interrompu (${state}).`, timeout: 'Le téléchargement du fichier a expiré.', chooseFolder: 'Choisir le dossier ou le disque', waitDownloads: 'Attendez la fin du centre de téléchargement avant de classer les fichiers.', invalidParameters: 'BPM Supreme a refusé les paramètres de téléchargement. Opération arrêtée pour éviter de répéter la même erreur.' },
  en: { loginTitle: 'BPM Supreme Sign In', authRequired: 'BPM Supreme sign-in is required to continue.', rateLimit: seconds => `BPM rate limit reached — resuming automatically in ${seconds}s`, unknownError: 'Unknown error', rateLimitPersistent: 'the request limit is still active after several retries.', noLink: 'No download link was returned.', interrupted: state => `File download interrupted (${state}).`, timeout: 'The file download timed out.', chooseFolder: 'Choose a folder or drive', waitDownloads: 'Wait for the Download Center to finish before organizing files.', invalidParameters: 'BPM Supreme rejected the download parameters. The operation was stopped to avoid repeating the same error.' },
  es: { loginTitle: 'Inicio de sesión de BPM Supreme', authRequired: 'Debes iniciar sesión en BPM Supreme para continuar.', rateLimit: seconds => `Límite de BPM alcanzado — reanudación automática en ${seconds} s`, unknownError: 'Error desconocido', rateLimitPersistent: 'el límite de solicitudes continúa activo después de varios intentos.', noLink: 'No se recibió ningún enlace de descarga.', interrupted: state => `Descarga del archivo interrumpida (${state}).`, timeout: 'La descarga del archivo agotó el tiempo de espera.', chooseFolder: 'Elegir una carpeta o unidad', waitDownloads: 'Espera a que termine el Centro de descargas antes de organizar los archivos.', invalidParameters: 'BPM Supreme rechazó los parámetros de descarga. La operación se detuvo para evitar repetir el mismo error.' }
};
async function mainLanguage() {
  const selected = (await settings()).language || 'system';
  const system = (app.getLocale() || 'en').slice(0, 2);
  return selected === 'system' ? (MAIN_MESSAGES[system] ? system : 'en') : selected;
}
async function mt(key, ...args) { const language = await mainLanguage(); const value = MAIN_MESSAGES[language]?.[key] ?? MAIN_MESSAGES.en[key]; return typeof value === 'function' ? value(...args) : value; }
const DOWNLOAD_MODES = {
  cautious: { delay: 8000, rateLimitMinimum: 120 },
  balanced: { delay: 3000, rateLimitMinimum: 60 },
  fast: { delay: 1000, rateLimitMinimum: 30 }
};
async function downloadMode() {
  const current = await settings();
  return DOWNLOAD_MODES[current.downloadMode] || DOWNLOAD_MODES.balanced;
}
async function authenticatedFetch(url, options = {}) {
  const partition = session.fromPartition(PARTITION);
  return partition.fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'BPM-Integration': 'BPMWeb',
      Origin: 'https://app.bpmsupreme.com',
      Referer: 'https://app.bpmsupreme.com/',
      ...(options.headers || {})
    }
  });
}
async function validateSession() {
  try {
    const response = await authenticatedFetch(`${API}/online-crate`);
    return response.ok;
  } catch { return false; }
}
function settleAuthWaiters(error) {
  const waiters = authWaiters; authWaiters = [];
  for (const waiter of waiters) error ? waiter.reject(error) : waiter.resolve();
}
async function finishLoginIfReady() {
  if (authCheckInProgress) return false;
  authCheckInProgress = true;
  const valid = await validateSession();
  authCheckInProgress = false;
  if (!valid) return false;
  await persistAuthCookies();
  await session.fromPartition(PARTITION).cookies.flushStore();
  mainWindow?.webContents.send('auth:changed');
  settleAuthWaiters();
  if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
  mainWindow?.show(); mainWindow?.focus();
  return true;
}
async function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.show(); loginWindow.focus(); return; }
  loginWindow = new BrowserWindow({ width: 1050, height: 760, parent: mainWindow, title: await mt('loginTitle'), webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false } });
  let authenticated = false;
  const openDirectLoginForm = async () => {
    if (!loginWindow || loginWindow.isDestroyed() || !/^https:\/\/app\.bpmsupreme\.com\/d(?:[/?#]|$)/.test(loginWindow.webContents.getURL())) return;
    await loginWindow.webContents.executeJavaScript(`(() => {
      const controls = [...document.querySelectorAll('button, a, [role="button"]')];
      const login = controls.find(element => /^(log in|login|sign in)$/i.test((element.innerText || element.textContent || '').trim()));
      if (login) login.click();
      return Boolean(login);
    })()`).catch(() => false);
  };
  const check = async () => {
    if (await finishLoginIfReady()) authenticated = true;
    else await openDirectLoginForm();
  };
  const loginSession = session.fromPartition(PARTITION);
  const cookieListener = (_event, cookie, _cause, removed) => {
    if (!removed && ['CloudFront-Key-Pair-Id', 'CloudFront-Policy', 'CloudFront-Signature'].includes(cookie.name)) setTimeout(check, 250);
  };
  loginSession.cookies.on('changed', cookieListener);
  loginWindow.webContents.on('did-navigate', check);
  loginWindow.webContents.on('did-redirect-navigation', check);
  loginWindow.webContents.on('did-finish-load', check);
  loginWindow.on('closed', () => {
    loginSession.cookies.removeListener('changed', cookieListener);
    loginWindow = null;
    mainWindow?.show(); mainWindow?.focus();
    if (!authenticated && authWaiters.length) mt('authRequired').then(message => settleAuthWaiters(new Error(message)));
    mainWindow?.webContents.send('auth:changed');
  });
  await loginWindow.loadURL('https://app.bpmsupreme.com/login?redirect=%2Fd');
  setTimeout(check, 400);
  const poll = setInterval(check, 1500);
  loginWindow.once('closed', () => clearInterval(poll));
}
async function waitForAuthentication() {
  return new Promise((resolve, reject) => {
    authWaiters.push({ resolve, reject });
    openLoginWindow().catch(error => {
      authWaiters = authWaiters.filter(waiter => waiter.resolve !== resolve);
      reject(error);
    });
  });
}
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitForRateLimit(seconds, apiPath) {
  seconds = Math.max(seconds, (await downloadMode()).rateLimitMinimum);
  for (let remaining = seconds; remaining > 0; remaining -= 1) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('downloads:progress', {
        phase: 'waiting',
        label: await mt('rateLimit', remaining),
        detail: apiPath
      });
    }
    await sleep(1000);
  }
}
async function apiJSON(apiPath, query = {}, authenticationRetry = false) {
  if (!await validateSession()) await waitForAuthentication();
  const url = new URL(`${API}/${apiPath.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(query || {})) if (value !== undefined && value !== null) url.searchParams.append(key, String(value));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await authenticatedFetch(url);
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 500) }; }
    if (response.status === 429 && attempt < 5) {
      const retryHeader = response.headers.get('retry-after');
      const headerSeconds = /^\d+$/.test(retryHeader || '') ? Number(retryHeader) : 0;
      const seconds = Math.max(30, Math.min(180, headerSeconds || 30 * (attempt + 1)));
      await waitForRateLimit(seconds, apiPath);
      continue;
    }
    if ((response.status === 401 || response.status === 403) && !authenticationRetry) {
      mainWindow?.webContents.send('auth:changed');
      await waitForAuthentication();
      return apiJSON(apiPath, query, true);
    }
    if (!response.ok) throw new Error(`BPM Supreme ${apiPath} — HTTP ${response.status}: ${body.message || body.error || await mt('unknownError')}`);
    return body;
  }
  throw new Error(`BPM Supreme ${apiPath} — ${await mt('rateLimitPersistent')}`);
}
function safeName(value) {
  return String(value || 'Sans titre').normalize('NFKC').replace(/[\x00-\x1f\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').replace(/^[ .-]+|[ .-]+$/g, '').slice(0, 150) || 'Sans titre';
}
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.aif', '.aiff', '.m4a', '.flac']);
function fileFingerprint(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+\(\d+\)$/i, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}
async function buildAudioIndex(destination, refresh = false) {
  if (!refresh && audioIndexCache?.destination === destination) return audioIndexCache.files;
  const files = new Map();
  const visit = async folder => {
    let entries;
    try { entries = await fsp.readdir(folder, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'Serato Playlists') await visit(fullPath); continue; }
      if (!entry.isFile() || entry.name.startsWith('.') || !AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const fingerprint = fileFingerprint(path.basename(entry.name, path.extname(entry.name)));
      if (fingerprint && !files.has(fingerprint)) files.set(fingerprint, fullPath);
    }
  };
  await visit(destination);
  audioIndexCache = { destination, files };
  return files;
}
async function detectDownloadedItems(items, refresh = false) {
  const current = await settings();
  const records = await readJSON(userFile('downloads.json'), {});
  const files = await buildAudioIndex(current.destination, refresh);
  let matched = 0;
  for (const item of items || []) {
    if (records[String(item.id)]?.filePath && fs.existsSync(records[String(item.id)].filePath)) continue;
    const stem = `${safeName(item.artist)} - ${safeName(item.title)} [${safeName(item.version)}]`;
    const filePath = files.get(fileFingerprint(stem));
    if (!filePath) continue;
    records[String(item.id)] = { mediaId: item.id, filePath, downloadedAt: new Date().toISOString(), collectionId: 'disk-scan', genre: normalizedGenre(item.genre) };
    matched += 1;
  }
  if (matched) await writeJSON(userFile('downloads.json'), records);
  return { records, matched, indexed: files.size };
}
function normalizedGenre(value) {
  const compact = String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').split(/[\/;]/)[0].trim();
  const aliases = { 'Hip hop': 'Hip Hop', 'R&b': 'R&B', 'Rnb': 'R&B', 'Drum and Bass': 'Drum & Bass' };
  return aliases[compact] || compact || 'Genre inconnu';
}
async function readTags(filePath) {
  let handle;
  try {
    handle = await fsp.open(filePath, 'r');
    const header = Buffer.alloc(10);
    const { bytesRead } = await handle.read(header, 0, 10, 0);
    if (bytesRead < 10 || header.toString('ascii', 0, 3) !== 'ID3') return {};
    const tagSize = 10 + ((header[6] & 0x7f) << 21) + ((header[7] & 0x7f) << 14) + ((header[8] & 0x7f) << 7) + (header[9] & 0x7f);
    const buffer = Buffer.alloc(Math.min(tagSize, 16 * 1024 * 1024));
    await handle.read(buffer, 0, buffer.length, 0);
    return NodeID3.read(buffer) || {};
  } catch { return {}; }
  finally { await handle?.close().catch(() => {}); }
}
async function walk(folder, wantedExtension, result = []) {
  let entries = [];
  try { entries = await fsp.readdir(folder, { withFileTypes: true }); } catch { return result; }
  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) await walk(fullPath, wantedExtension, result);
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === wantedExtension) result.push(fullPath);
  }
  return result;
}
async function removeEmptyFolders(folder, rootFolder) {
  let removed = 0;
  let entries = [];
  try { entries = await fsp.readdir(folder, { withFileTypes: true }); } catch { return removed; }
  for (const entry of entries) {
    if (entry.isDirectory()) removed += await removeEmptyFolders(path.join(folder, entry.name), rootFolder);
  }
  if (folder === rootFolder || path.basename(folder) === 'Serato Playlists') return removed;
  try {
    const remaining = await fsp.readdir(folder);
    for (const name of remaining.filter(name => name === '.DS_Store' || name === '._.DS_Store')) {
      await fsp.unlink(path.join(folder, name)).catch(() => {});
    }
    if ((await fsp.readdir(folder)).length === 0) { await fsp.rmdir(folder); removed += 1; }
  } catch {}
  return removed;
}
async function organizePreview() {
  const current = await settings();
  const records = await readJSON(userFile('downloads.json'), {});
  let existing = 0; let movable = 0; let unknown = 0;
  for (const record of Object.values(records)) {
    if (!record.filePath || !fs.existsSync(record.filePath) || path.basename(record.filePath).startsWith('._')) continue;
    existing += 1;
    const tags = await readTags(record.filePath);
    const genre = normalizedGenre(record.genre || tags.genre);
    if (genre === 'Genre inconnu') unknown += 1;
    if (path.dirname(record.filePath) !== path.join(current.destination, safeName(genre))) movable += 1;
  }
  return { total: Object.keys(records).length, existing, movable, unknown, destination: current.destination };
}
async function organizeByGenre() {
  const current = await settings();
  const registryPath = userFile('downloads.json');
  const records = await readJSON(registryPath, {});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFolder = path.join(app.getPath('userData'), 'backups', `avant-classement-${stamp}`);
  await fsp.mkdir(backupFolder, { recursive: true });
  await fsp.copyFile(registryPath, path.join(backupFolder, 'downloads.json'));
  const playlists = await walk(current.destination, '.m3u8');
  for (const playlist of playlists) {
    const backup = path.join(backupFolder, 'playlists', path.relative(current.destination, playlist));
    await fsp.mkdir(path.dirname(backup), { recursive: true });
    await fsp.copyFile(playlist, backup);
  }
  const pathChanges = new Map();
  let moved = 0; let unchanged = 0; let unknown = 0; let processed = 0;
  const values = Object.values(records);
  for (const record of values) {
    processed += 1;
    if (!record.filePath || !fs.existsSync(record.filePath) || path.basename(record.filePath).startsWith('._')) continue;
    const oldPath = record.filePath;
    const tags = await readTags(oldPath);
    const genre = normalizedGenre(record.genre || tags.genre);
    if (genre === 'Genre inconnu') unknown += 1;
    const targetFolder = path.join(current.destination, safeName(genre));
    record.genre = genre;
    delete record.collectionTitle;
    if (path.dirname(oldPath) === targetFolder) { unchanged += 1; continue; }
    await fsp.mkdir(targetFolder, { recursive: true });
    let target = path.join(targetFolder, path.basename(oldPath));
    if (fs.existsSync(target) && target !== oldPath) {
      const ext = path.extname(target); const stem = path.basename(target, ext);
      target = await uniquePath(targetFolder, stem, ext.replace(/^\./, '') || 'mp3');
    }
    try { await fsp.rename(oldPath, target); }
    catch (error) {
      if (error.code !== 'EXDEV') throw error;
      await fsp.copyFile(oldPath, target); await fsp.unlink(oldPath);
    }
    const sidecar = path.join(path.dirname(oldPath), `._${path.basename(oldPath)}`);
    if (fs.existsSync(sidecar)) {
      try { await fsp.rename(sidecar, path.join(targetFolder, path.basename(sidecar))); } catch {}
    }
    record.filePath = target;
    pathChanges.set(oldPath, target);
    moved += 1;
    if (moved % 25 === 0) await writeJSON(registryPath, records);
    mainWindow?.webContents.send('library:organize-progress', { processed, total: values.length, moved, label: path.basename(target) });
  }
  await writeJSON(registryPath, records);
  const centralPlaylists = path.join(current.destination, 'Serato Playlists');
  await fsp.mkdir(centralPlaylists, { recursive: true });
  let playlistsUpdated = 0;
  for (const playlist of playlists) {
    let contents = await fsp.readFile(playlist, 'utf8');
    for (const [oldPath, newPath] of pathChanges) contents = contents.split(oldPath).join(newPath);
    let targetPlaylist = path.join(centralPlaylists, path.basename(playlist));
    if (playlist !== targetPlaylist && fs.existsSync(targetPlaylist)) {
      const ext = path.extname(targetPlaylist); const stem = path.basename(targetPlaylist, ext);
      targetPlaylist = await uniquePath(centralPlaylists, stem, ext.replace(/^\./, '') || 'm3u8');
    }
    await fsp.writeFile(playlist, contents, 'utf8');
    if (playlist !== targetPlaylist) {
      await fsp.rename(playlist, targetPlaylist);
    }
    playlistsUpdated += 1;
  }
  const foldersRemoved = await removeEmptyFolders(current.destination, current.destination);
  return { moved, unchanged, unknown, records, playlistsUpdated, foldersRemoved, backupFolder };
}
async function uniquePath(folder, stem, extension) {
  let candidate = path.join(folder, `${stem}.${extension}`);
  let index = 2;
  while (fs.existsSync(candidate)) candidate = path.join(folder, `${stem} (${index++}).${extension}`);
  return candidate;
}
async function writeSeratoPlaylist(items, collection, destination, records, genreName) {
  const playlistFolder = path.join(destination, 'Serato Playlists');
  await fsp.mkdir(playlistFolder, { recursive: true });
  const lines = ['#EXTM3U'];
  for (const item of items) {
    const record = records[String(item.id)];
    if (!record?.filePath || !fs.existsSync(record.filePath)) continue;
    lines.push(`#EXTINF:-1,${item.artist} - ${item.title} [${item.version}]`);
    lines.push(record.filePath);
  }
  const playlistPath = path.join(playlistFolder, `${safeName(collection.title)}.m3u8`);
  await fsp.writeFile(playlistPath, `\uFEFF${lines.join('\n')}\n`, 'utf8');
  return playlistPath;
}
async function getDownloaderWindow() {
  if (!downloaderWindow || downloaderWindow.isDestroyed()) {
    downloaderWindow = new BrowserWindow({ show: false, webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false } });
    downloaderWindow.on('closed', () => { downloaderWindow = null; });
  }
  await downloaderWindow.loadURL('https://app.bpmsupreme.com/');
  return downloaderWindow;
}
async function downloadOne(item, collection, destination, records, genreName, progress = () => {}) {
  const fromLocation = collection.kind === 'genre' ? `/d/genres?genre=${encodeURIComponent(collection.slug || '')}` : collection.kind === 'curated' ? `/d/curated-set/${collection.id}` : `/d/exclusive-playlist/${collection.id}`;
  const result = await apiJSON(`media/${item.id}/download`, { from_location: fromLocation, from_library: 'music' });
  const signedURL = result.data?.url || result.url;
  if (!signedURL) throw new Error(await mt('noLink'));
  const genre = normalizedGenre(item.genre || genreName);
  const collectionFolder = genre ? path.join(destination, safeName(genre)) : path.join(destination, safeName(collection.title));
  await fsp.mkdir(collectionFolder, { recursive: true });
  let remoteName = '';
  try { remoteName = decodeURIComponent(path.basename(new URL(signedURL).pathname)); } catch {}
  const extension = path.extname(remoteName).replace('.', '') || 'mp3';
  const stem = `${safeName(item.artist)} - ${safeName(item.title)} [${safeName(item.version)}]`;
  const target = await uniquePath(collectionFolder, stem, extension);
  // BPM's audio host rejects programmatic fetches, but accepts the same URL
  // through Chromium's native download flow (the mechanism used by its site).
  const downloadSession = session.fromPartition(PARTITION);
  const downloader = await getDownloaderWindow();
  const downloaderContents = downloader.webContents;
  const downloadCopy = MAIN_MESSAGES[await mainLanguage()] || MAIN_MESSAGES.en;
  await new Promise((resolve, reject) => {
      let timeout;
      const cleanup = () => {
        clearTimeout(timeout);
        downloadSession.removeListener('will-download', onDownload);
      };
      const onDownload = (_event, downloadItem, sourceContents) => {
        if (sourceContents !== downloaderContents) return;
        cleanup();
        downloadItem.setSavePath(target);
        let lastProgressAt = 0;
        const reportProgress = () => {
          const now = Date.now();
          if (now - lastProgressAt < 250) return;
          lastProgressAt = now;
          const receivedBytes = downloadItem.getReceivedBytes();
          const totalBytes = downloadItem.getTotalBytes();
          progress({ receivedBytes, totalBytes, percent: totalBytes > 0 ? Math.min(100, Math.round(receivedBytes * 100 / totalBytes)) : 0 });
        };
        downloadItem.on('updated', reportProgress);
        downloadItem.once('done', (_doneEvent, state) => {
          downloadItem.removeListener('updated', reportProgress);
          if (state === 'completed') progress({ receivedBytes: downloadItem.getReceivedBytes(), totalBytes: downloadItem.getTotalBytes(), percent: 100 });
          if (state === 'completed') resolve();
          else reject(new Error(downloadCopy.interrupted(state)));
        });
      };
      downloadSession.on('will-download', onDownload);
      downloader.loadURL(signedURL, {
        extraHeaders: 'Referer: https://app.bpmsupreme.com/\r\n'
      }).catch(() => {});
      timeout = setTimeout(() => {
        cleanup();
        reject(new Error(downloadCopy.timeout));
      }, 30000);
  });
  records[String(item.id)] = { mediaId: item.id, filePath: target, downloadedAt: new Date().toISOString(), collectionId: collection.id, genre };
  await writeJSON(userFile('downloads.json'), records);
  return target;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380, height: 850, minWidth: 1050, minHeight: 650,
    title: 'BPM Supreme Manager',
    backgroundColor: '#0d0e11',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(async () => {
  await restoreAuthCookies();
  installAuthCookiePersistence();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('auth:status', async () => ({ connected: await validateSession() }));
ipcMain.handle('auth:login', async () => {
  await openLoginWindow();
  return { opened: true };
});
ipcMain.handle('auth:logout', async () => { await clearPersistedAuthentication(); await session.fromPartition(PARTITION).clearStorageData(); return { connected: false }; });
ipcMain.handle('settings:get', async () => settings());
ipcMain.handle('settings:update', async (_, patch) => {
  const current = await settings();
  if (patch.downloadMode && DOWNLOAD_MODES[patch.downloadMode]) current.downloadMode = patch.downloadMode;
  if (patch.language && ['system', 'fr', 'en', 'es'].includes(patch.language)) current.language = patch.language;
  await writeJSON(userFile('settings.json'), current); return current;
});
ipcMain.handle('settings:destination', async () => {
  const current = await settings();
  const result = await dialog.showOpenDialog(mainWindow, { title: await mt('chooseFolder'), defaultPath: current.destination, properties: ['openDirectory', 'createDirectory'] });
  if (!result.canceled && result.filePaths[0]) { current.destination = result.filePaths[0]; audioIndexCache = null; await writeJSON(userFile('settings.json'), current); }
  return current;
});
ipcMain.handle('downloads:list', async () => readJSON(userFile('downloads.json'), {}));
ipcMain.handle('downloads:detect', async (_, { items, refresh }) => detectDownloadedItems(items, refresh));
ipcMain.handle('library:organize-preview', organizePreview);
ipcMain.handle('library:organize', async () => {
  if (downloadsActive) throw new Error(await mt('waitDownloads'));
  return organizeByGenre();
});
ipcMain.handle('api:get', async (_, { path: apiPath, query }) => apiJSON(apiPath, query));
ipcMain.handle('file:reveal', async (_, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('downloads:start', async (_, { collection, items, genreName, categoryName }) => {
  downloadsActive += 1;
  try {
  const current = await settings();
  const records = await readJSON(userFile('downloads.json'), {});
  const pending = items.filter(item => !records[String(item.id)] && Number(item.downloadCount || 0) < 3);
  let completed = 0; const errors = [];
  for (const item of pending) {
    const label = `${item.artist} — ${item.title} [${item.version}]`;
    mainWindow.webContents.send('downloads:progress', { phase: 'starting', itemId: item.id, current: completed, total: pending.length, label, songProgress: 0 });
    try {
      const filePath = await downloadOne(item, collection, current.destination, records, genreName || categoryName, details => {
        mainWindow.webContents.send('downloads:progress', { phase: 'downloading', itemId: item.id, current: completed, total: pending.length, label, songProgress: details.percent, receivedBytes: details.receivedBytes, totalBytes: details.totalBytes });
      });
      mainWindow.webContents.send('downloads:progress', { phase: 'completed', itemId: item.id, current: completed + 1, total: pending.length, label, filePath, songProgress: 100 });
    }
    catch (error) {
      errors.push({ id: item.id, message: error.message });
      mainWindow.webContents.send('downloads:progress', { phase: 'error', itemId: item.id, current: completed + 1, total: pending.length, label, message: error.message, songProgress: 0 });
      if (/HTTP 400:\s*Invalid parameters/i.test(error.message)) {
        throw new Error(await mt('invalidParameters'));
      }
    }
    completed += 1;
    // Leave room between granted downloads so a large collection does not
    // immediately trigger BPM Supreme's HTTP 429 protection.
    await sleep((await downloadMode()).delay);
  }
  const playlist = await writeSeratoPlaylist(items, collection, current.destination, records, genreName || categoryName);
  return { completed: completed - errors.length, skipped: items.length - pending.length, errors, records, playlist };
  } finally { downloadsActive = Math.max(0, downloadsActive - 1); }
});
