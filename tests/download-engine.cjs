// Run with: electron tests/download-engine.cjs (requires openssl for a local certificate)
// Uses the actual main-process download code and Electron download manager.
// All audio, account state and requests are temporary localhost fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const electron = require('electron');

if (!electron.app) throw new Error('Run this integration test using Electron.');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-download-engine-'));
const profile = path.join(temporary, 'profile');
const destination = path.join(temporary, 'library');
fs.mkdirSync(profile, { recursive: true });
electron.app.setPath('userData', profile);

let server;
let exitCode = 0;
const watchdog = setTimeout(() => {
  console.error('FAIL: native download integration exceeded 15 seconds.');
  electron.app.exit(1);
}, 15000);

async function run() {
  await fsp.mkdir(destination, { recursive: true });
  const keyPath = path.join(temporary, 'localhost.key');
  const certificatePath = path.join(temporary, 'localhost.crt');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certificatePath, '-subj', '/CN=127.0.0.1', '-days', '1'], { stdio: 'ignore' });
  const fixtureSession = electron.session.fromPartition('persist:bpm-supreme-account');
  fixtureSession.setCertificateVerifyProc((request, callback) => callback(request.hostname === '127.0.0.1' ? 0 : -3));
  const audio = new Map([
    ['101', Buffer.alloc(128 * 1024, 0x31)],
    ['102', Buffer.alloc(96 * 1024, 0x72)]
  ]);
  const requests = [];
  const grants = [];
  let inFlight = 0;
  let maximumInFlight = 0;
  let firstRequest;
  const requested = new Promise(resolve => { firstRequest = resolve; });
  server = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certificatePath) }, (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'https://localhost').pathname);
    const grantId = pathname.match(/^\/grant\/(\d+)$/)?.[1];
    if (grantId) {
      grants.push({ id: grantId, cookie: request.headers.cookie });
      response.writeHead(302, { Location: encodeURI(`/audio/${grantId} – Fixture Track.mp3`) });
      response.end();
      return;
    }
    const id = pathname.match(/^\/audio\/(\d+) – Fixture Track\.mp3$/)?.[1];
    const bytes = audio.get(id);
    if (!bytes) { response.writeHead(404); response.end(); return; }
    requests.push({ id, cookie: request.headers.cookie });
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    response.once('close', () => { inFlight -= 1; });
    response.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': bytes.length,
      'Content-Disposition': `attachment; filename="${id}.mp3"`
    });
    let position = 0;
    function nextChunk() {
      const end = Math.min(position + 16 * 1024, bytes.length);
      response.write(bytes.subarray(position, end));
      position = end;
      if (position === bytes.length) response.end();
      else setTimeout(nextChunk, 10);
    }
    nextChunk();
    firstRequest();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const fixtureOrigin = `https://127.0.0.1:${server.address().port}`;
  await fixtureSession.cookies.set({ url: fixtureOrigin, name: 'bpm_fixture_session', value: 'authorized-fixture', secure: true, sameSite: 'no_restriction' });

  const existingPath = path.join(destination, 'existing.mp3');
  await fsp.writeFile(existingPath, Buffer.from('existing fixture'));
  const records = { '100': { mediaId: 100, filePath: existingPath } };
  for (let index = 0; index < 27060; index += 1) {
    records[String(index + 1000)] = { mediaId: index + 1000, filePath: `/fixture/unrelated-${index}.mp3` };
  }
  await fsp.writeFile(path.join(profile, 'settings.json'), JSON.stringify({ destination, language: 'en' }));
  await fsp.writeFile(path.join(profile, 'downloads.json'), JSON.stringify(records));

  const handlers = new Map();
  const progress = [];
  let windowsCreated = 0;
  const testElectron = {
    ...electron,
    app: {
      getPath: name => electron.app.getPath(name),
      getVersion: () => electron.app.getVersion(),
      getLocale: () => 'en',
      requestSingleInstanceLock: () => true,
      // Loading the module must not start its production windows or read a
      // real account; everything else below uses its actual registered handlers.
      whenReady: () => ({ then() {} }),
      on() {}
    },
    BrowserWindow: function ForbiddenWindow() {
      windowsCreated += 1;
      throw new Error('The download engine attempted to create a browser window.');
    },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) }
  };
  const sourcePath = path.resolve(__dirname, '../src/main.js');
  const sandbox = {
    require: name => name === 'electron' ? testElectron : require(name),
    __dirname: path.dirname(sourcePath),
    Buffer, URL, console, setTimeout, clearTimeout,
    fixtureOrigin,
    recordProgress: value => progress.push(value)
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });
  vm.runInContext(`
    apiJSON = async apiPath => {
      const parts = apiPath.split('/');
      const id = parts.length === 3 && parts[0] === 'media' && parts[2] === 'download' ? parts[1] : null;
      if (!id) throw new Error('Unexpected fixture API path: ' + apiPath);
      const fixturePath = id === '101' ? '/grant/101?version=Intro Clean' : '/audio/102 – Fixture Track.mp3?version=Intro Clean';
      return { data: { url: fixtureOrigin + fixturePath } };
    };
    mainLanguage = async () => 'en';
    downloadMode = async () => ({ delay: 0 });
    mainWindow = { webContents: { send: (_channel, value) => recordProgress(value) } };
  `, sandbox);

  assert.equal(handlers.get('app:version')(), electron.app.getVersion());
  const items = [100, 101, 102].map(id => ({ id, artist: 'Fixture Artist', title: `Track ${id}`, version: 'Intro Clean', genre: 'Fixture Genre' }));
  const payload = { collection: { id: 'fixture', title: 'Fixture Genre', slug: 'fixture', kind: 'genre' }, items, genreName: 'Fixture Genre' };
  const completed = handlers.get('downloads:start')(null, payload);
  await requested;
  await assert.rejects(handlers.get('downloads:start')(null, payload), /already running/);
  const result = await completed;

  assert.equal(result.completed, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(grants.map(request => request.id), ['101']);
  assert.deepEqual(requests.map(request => request.id), ['101', '102']);
  assert.ok(grants.every(request => request.cookie?.includes('bpm_fixture_session=authorized-fixture')));
  assert.ok(requests.every(request => request.cookie?.includes('bpm_fixture_session=authorized-fixture')));
  assert.equal(maximumInFlight, 1);
  assert.equal(windowsCreated, 0);
  assert.deepEqual(Object.keys(result.records).sort(), ['100', '101', '102']);
  for (const id of ['101', '102']) {
    assert.equal(path.dirname(result.records[id].filePath), path.join(destination, 'Fixture Genre'));
    assert.deepEqual(await fsp.readFile(result.records[id].filePath), audio.get(id));
    assert.ok(progress.some(event => String(event.itemId) === id && event.phase === 'completed' && event.songProgress === 100));
  }
  const persisted = JSON.parse(await fsp.readFile(path.join(profile, 'downloads.json'), 'utf8'));
  assert.equal(Object.keys(persisted).length, 27063);
  assert.deepEqual(persisted['100'], records['100']);
  assert.deepEqual(persisted['1000'], records['1000']);
  assert.equal(Object.keys({ ...records, ...result.records }).length, 27063);
  const repeated = await handlers.get('downloads:start')(null, payload);
  assert.equal(repeated.completed, 0);
  assert.equal(repeated.skipped, 3);
  assert.equal(requests.length, 2);
  assert.equal(grants.length, 1);
  console.log('PASS: redirected and raw-space/Unicode native URLs saved automatically; exact bytes and account-session cookie; max one transfer; zero browser windows; recorded track skipped; narrow IPC reply; 27,061 previous records preserved; repeat job skips all files.');
}

electron.app.whenReady().then(run).catch(error => {
  exitCode = 1;
  console.error(error);
}).finally(async () => {
  clearTimeout(watchdog);
  if (server) await new Promise(resolve => server.close(resolve));
  await fsp.rm(temporary, { recursive: true, force: true });
  electron.app.exit(exitCode);
});
