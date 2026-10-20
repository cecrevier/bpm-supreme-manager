const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

// Run: node_modules/.bin/electron tests/renderer-performance.cjs
// Exercises the shipped renderer with synthetic metadata, never real downloads.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-renderer-performance-'));
app.setPath('userData', profile);
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const source = process.env.BPM_PERF_SOURCE || path.join(__dirname, '..', 'src');
const trackCount = Number(process.env.BPM_PERF_TRACKS || 20000);
const legacy = process.env.BPM_PERF_EXPECT_LEGACY === '1';
let queuedPayload = null;
let finishDownload;
let apiCalls = 0;
let apiFailure = false;
ipcMain.handle('performance:api', () => {
  apiCalls += 1;
  if (apiFailure) throw new Error('Mock catalogue unavailable');
  return { data: [] };
});
ipcMain.handle('performance:download', (_, payload) => {
  queuedPayload = payload;
  return new Promise(resolve => { finishDownload = resolve; });
});

function metrics() {
  return app.getAppMetrics().map(({ type, cpu, memory, pid }) => ({
    type, pid, cpu: Number(cpu.percentCPUUsage.toFixed(2)), memoryMB: Math.round(memory.workingSetSize / 1024)
  }));
}

async function measure(window, name, action) {
  await window.webContents.executeJavaScript('window.performanceFrames = []; window.performanceLongTasks = [];');
  metrics();
  const started = performance.now();
  if (action) await action();
  await wait(2000);
  const result = await window.webContents.executeJavaScript(`(() => {
    const frames = window.performanceFrames;
    const sorted = [...frames].sort((a,b) => a-b);
    return { frames: frames.length, p95FrameMs: sorted[Math.floor(sorted.length*.95)] || 0,
      maxFrameMs: Math.max(0, ...frames), longTasks: window.performanceLongTasks,
      renderedTracks: document.querySelectorAll('[data-track-id]').length,
      progressElements: document.querySelectorAll('progress').length,
      queuedTracks: state.currentJob?.items.length || 0,
      activeSongs: state.currentJob?.songs.filter(song => song.status === 'downloading' || song.status === 'active').length || 0 };
  })()`);
  return { name, elapsedMs: Math.round(performance.now() - started), ...result, cpu: metrics() };
}

async function scenario(mode) {
  queuedPayload = null;
  const window = new BrowserWindow({
    title: 'BPM renderer performance test — mock data', width: 1440, height: 900,
    show: false, webPreferences: { preload: path.join(__dirname, 'renderer-performance-preload.cjs'), contextIsolation: true, backgroundThrottling: false }
  });
  await window.loadFile(path.join(source, 'index.html'));
  window.showInactive();
  if (mode === 'css') await window.webContents.insertCSS(`
    progress { appearance: none !important; -webkit-appearance: none !important; }
    progress::-webkit-progress-bar { background: #292d36; }
    progress::-webkit-progress-value { background: #32d273; }
  `);
  await window.webContents.executeJavaScript(`(() => {
    state.selectedGenre = {key:'mock', name:'Performance test'};
    state.genres = [{slug:'mock', name:'Performance test'}];
    state.tracks = Array.from({length:${trackCount}}, (_, index) => ({
      id:index+1, albumId:Math.floor(index/3)+1, title:'Mock title '+Math.floor(index/3),
      artist:'Mock artist', genre:'Performance test', version:['Intro Clean','Clean Extended','Dirty Extended'][index%3], downloadCount:0
    }));
    state.tracksRevision += 1; state.eligibleCache=null; state.hasMore=false; state.genreBusy=false;
    state.renderLimit=100; renderGenres(); renderTracks();
    document.getElementById('categoryDownloadBtn').hidden=false;
    window.performanceFrames=[]; window.performanceLongTasks=[];
    let last=performance.now();
    const frame = now => { window.performanceFrames.push(now-last); last=now; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    new PerformanceObserver(list => { for (const item of list.getEntries()) window.performanceLongTasks.push(item.duration); }).observe({type:'longtask', buffered:false});
  })()`);
  await wait(500);
  let clickMs = 0;
  const results = [await measure(window, `${mode}:before`), await measure(window, `${mode}:queued`, async () => {
    const started = performance.now();
    await window.webContents.executeJavaScript("document.getElementById('categoryDownloadBtn').click()");
    while (!queuedPayload && performance.now() - started < 5000) await wait(10);
    clickMs = Math.round(performance.now() - started);
  })];
  assert.equal(queuedPayload?.items.length, trackCount, 'Download entire genre must enqueue every track, not only visible rows');
  if (legacy) {
    console.log(JSON.stringify({mode:'legacy', source, clickMs, results}, null, 2));
    window.destroy();
    return;
  }
  assert.ok(clickMs < 1000, `Enqueueing must remain responsive (observed ${clickMs}ms)`);
  assert.ok(results.at(-1).renderedTracks <= 100, 'Enqueueing must not render the entire genre');
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Profiler.enable');
  await window.webContents.debugger.sendCommand('Profiler.start');
  results.push(await measure(window, `${mode}:250-progress-events`, async () => {
    for (let index=0;index<250;index++) {
      window.webContents.send('performance:progress', {phase:'downloading', itemId:1, current:0, total:trackCount, label:'Mock artist — Mock title 0 [Intro Clean]', songProgress:index%101});
      await wait(8);
    }
  }));
  const {profile: cpuProfile} = await window.webContents.debugger.sendCommand('Profiler.stop');
  const counts = new Map();
  for (const sample of cpuProfile.samples || []) counts.set(sample, (counts.get(sample) || 0)+1);
  const hotFunctions = cpuProfile.nodes.filter(node => counts.has(node.id)).map(node => ({
    name: node.callFrame.functionName || '(anonymous)', url: path.basename(node.callFrame.url), samples: counts.get(node.id)
  })).sort((a,b) => b.samples-a.samples).slice(0,12);
  assert.equal(results.at(-1).activeSongs, 1, 'Progress must update exactly one active item');
  assert.ok(results.at(-1).progressElements <= 4, 'Only the current track may create a progress control');
  assert.ok(results.at(-1).longTasks.every(duration => duration < 250), 'Progress events must not freeze the renderer');
  finishDownload({ records: { '1': { filePath: '/tmp/mock-library/new-download.mp3' } }, completed: 1, errors: [] });
  await wait(100);
  const preserved = await window.webContents.executeJavaScript("Boolean(state.records['999999']?.filePath && state.records['1']?.filePath)");
  assert.ok(preserved, 'Completing a job must merge its records without erasing earlier downloads');
  apiFailure = true; apiCalls = 0;
  await window.webContents.executeJavaScript("selectGenre('mock')");
  const selectionReleased = await window.webContents.executeJavaScript("!state.genreBusy && !document.getElementById('categoryDownloadBtn').disabled");
  assert.equal(apiCalls, 1, 'A failed genre selection must issue one request without retrying forever');
  assert.ok(selectionReleased, 'A failed genre selection must release its busy state');
  apiCalls = 0;
  await window.webContents.executeJavaScript("state.queue=[];state.hasMore=true;downloadWholeGenre()");
  const downloadReleased = await window.webContents.executeJavaScript("!state.genreBusy && !document.getElementById('categoryDownloadBtn').disabled");
  assert.equal(apiCalls, 1, 'A failed catalogue page must stop the genre download preparation');
  assert.ok(downloadReleased, 'A failed catalogue page must release the download button');
  apiFailure = false;
  const severeFrames = results.flatMap(result => result.longTasks).filter(duration => duration > 200);
  console.log(JSON.stringify({mode, clickMs, recordsPreserved:preserved, selectionFailureReleased:selectionReleased, downloadFailureReleased:downloadReleased, results, hotFunctions, severeLongTasks:severeFrames}, null, 2));
  window.destroy();
  await wait(500);
  return {mode, results};
}

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { console.error('Renderer performance test exceeded 30 seconds'); app.exit(2); }, 30000);
  try {
    for (const mode of (legacy ? ['native'] : ['native','css'])) await scenario(mode);
    clearTimeout(watchdog);
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
app.on('window-all-closed', () => {});
