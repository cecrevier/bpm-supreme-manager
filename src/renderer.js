const state = {
  connected: false, genres: [], selectedGenre: null, tracks: [], records: {}, settings: {},
  wanted: new Set(['intro clean', 'clean extended', 'dirty extended']),
  skip: 0, pageSize: 50, hasMore: false, loading: false, albumIds: new Set(),
  queue: [], queueBusy: false, currentJob: null, queueId: 0, genreBusy: false, lastTrackProgressRender: 0
};

const $ = id => document.getElementById(id);
const payload = body => body?.data ?? body;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const messages = {
  fr: { subtitle: 'Bibliothèque multiplateforme', search: 'Rechercher un titre…', speed: 'Vitesse', modeCautious: 'Prudent · 8 s', modeBalanced: 'Équilibré · 3 s', modeFast: 'Rapide · 1 s', settings: '⚙ Paramètres', location: 'Emplacement', openSettings: 'Ouvrir les paramètres…', settingsTitle: 'Paramètres', settingsSubtitle: 'Stockage, langue et organisation', language: 'Langue', languageSystem: 'Langue du système', destination: 'Disque ou dossier de destination', chooseDestination: 'Choisir un disque ou dossier…', organize: 'Classer l’existant par genre…', connected: 'Connecté', disconnected: 'Non connecté', account: 'Compte', login: 'Se connecter', download: 'Télécharger', queued: 'Ajouté', downloading: 'Télécharge', clearErrors: 'Effacer les erreurs' },
  en: { subtitle: 'Cross-platform library', search: 'Search tracks…', speed: 'Speed', modeCautious: 'Cautious · 8 s', modeBalanced: 'Balanced · 3 s', modeFast: 'Fast · 1 s', settings: '⚙ Settings', location: 'Location', openSettings: 'Open settings…', settingsTitle: 'Settings', settingsSubtitle: 'Storage, language and organization', language: 'Language', languageSystem: 'System language', destination: 'Destination drive or folder', chooseDestination: 'Choose a drive or folder…', organize: 'Organize existing files by genre…', connected: 'Connected', disconnected: 'Disconnected', account: 'Account', login: 'Sign in', download: 'Download', queued: 'Queued', downloading: 'Downloading', clearErrors: 'Clear errors' },
  es: { subtitle: 'Biblioteca multiplataforma', search: 'Buscar canciones…', speed: 'Velocidad', modeCautious: 'Prudente · 8 s', modeBalanced: 'Equilibrado · 3 s', modeFast: 'Rápido · 1 s', settings: '⚙ Ajustes', location: 'Ubicación', openSettings: 'Abrir ajustes…', settingsTitle: 'Ajustes', settingsSubtitle: 'Almacenamiento, idioma y organización', language: 'Idioma', languageSystem: 'Idioma del sistema', destination: 'Disco o carpeta de destino', chooseDestination: 'Elegir disco o carpeta…', organize: 'Organizar archivos por género…', connected: 'Conectado', disconnected: 'Desconectado', account: 'Cuenta', login: 'Iniciar sesión', download: 'Descargar', queued: 'En cola', downloading: 'Descargando', clearErrors: 'Borrar errores' }
};
function activeLanguage() { const selected = state.settings.language || 'system'; const system = (navigator.language || 'en').slice(0, 2); return selected === 'system' ? (messages[system] ? system : 'en') : selected; }
function tr(key) { return messages[activeLanguage()]?.[key] || messages.fr[key] || key; }
function applyLanguage() {
  document.documentElement.lang = activeLanguage();
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = tr(element.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => { element.placeholder = tr(element.dataset.i18nPlaceholder); });
  renderAuth(); renderTracks(); renderDownloadCenter();
}
function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function toast(message, error = false) { const element = $('toast'); element.textContent = message; element.className = error ? 'show error' : 'show'; setTimeout(() => { element.className = ''; }, 5000); }
function listFrom(body, keys = []) {
  const root = payload(body);
  if (Array.isArray(root)) return root;
  for (const key of [...keys, 'albums', 'genres', 'items', 'results', 'data']) if (Array.isArray(root?.[key])) return root[key];
  return [];
}
function normalizeGenres(body) {
  return listFrom(body, ['genres']).flatMap(item => Array.isArray(item.genres) ? item.genres : [item]).filter(item => item?.name || item?.title);
}
function parseAlbums(body) {
  return listFrom(body, ['albums']).flatMap(album => {
    const artist = typeof album.artist === 'string' ? album.artist : (album.artist?.name || album.artists?.map(value => value.name).filter(Boolean).join(', ') || 'Artiste inconnu');
    const genre = album.genre?.name || album.genre_name || state.selectedGenre?.name || 'Genre inconnu';
    return (album.media || album.versions || []).map(media => ({
      id: Number(media.id), albumId: Number(album.id), title: album.name || album.title || 'Sans titre', artist, genre,
      version: media.version?.name || media.version_name || 'Version', downloadCount: Number(media.download_count || 0)
    }));
  }).filter(item => Number.isFinite(item.id));
}
function renderAuth() {
  $('authBadge').textContent = state.connected ? tr('connected') : tr('disconnected');
  $('authBadge').className = `badge ${state.connected ? 'online' : 'offline'}`;
  $('loginBtn').textContent = state.connected ? tr('account') : tr('login');
}
function renderGenres() {
  $('categories').innerHTML = state.genres.map(genre => {
    const key = genre.slug || genre.id || genre.name;
    return `<button class="category ${state.selectedGenre?.key === String(key) ? 'active' : ''}" data-key="${escapeHTML(key)}">${escapeHTML(genre.name || genre.title)}</button>`;
  }).join('') || '<div class="empty">Aucun genre.</div>';
  document.querySelectorAll('.category[data-key]').forEach(button => { button.onclick = () => selectGenre(button.dataset.key); });
}
function eligibleTracks() {
  const priority = new Map([['intro clean', 0], ['clean extended', 1], ['dirty extended', 2], ['clean', 10], ['clean radio edit', 11], ['clean short edit', 12], ['intro dirty', 13], ['dirty', 14], ['dirty radio edit', 15]]);
  const groups = new Map();
  for (const track of state.tracks) {
    const key = track.albumId || `${track.artist}-${track.title}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(track);
  }
  return [...groups.values()].flatMap(tracks => tracks.sort((left, right) => {
    const leftUnavailable = left.downloadCount >= 3 && !state.records[String(left.id)] ? 100 : 0;
    const rightUnavailable = right.downloadCount >= 3 && !state.records[String(right.id)] ? 100 : 0;
    return leftUnavailable + (priority.get(left.version.toLowerCase()) ?? 50) - rightUnavailable - (priority.get(right.version.toLowerCase()) ?? 50);
  }).slice(0, 3));
}
function pendingTracks() { return eligibleTracks().filter(track => !state.records[String(track.id)] && track.downloadCount < 3); }
function renderTracks() {
  const search = $('search').value.trim().toLowerCase();
  const visible = state.tracks.filter(track => !search || `${track.title} ${track.artist} ${track.version}`.toLowerCase().includes(search));
  const chosenIds = new Set(eligibleTracks().map(track => track.id));
  const titleCount = new Set(visible.map(track => track.albumId || `${track.artist}-${track.title}`)).size;
  $('collectionCount').textContent = `${titleCount} titre${titleCount === 1 ? '' : 's'} • ${visible.length} version${visible.length === 1 ? '' : 's'}`;
  if (!state.selectedGenre) { $('collections').innerHTML = '<div class="empty">Choisissez un genre pour afficher ses titres.</div>'; return; }
  const rows = visible.map(track => {
    const done = Boolean(state.records[String(track.id)]); const limited = track.downloadCount >= 3; const wanted = chosenIds.has(track.id);
    const queuedSong = state.queue.flatMap(job => job.songs || []).find(song => String(song.id) === String(track.id) && !['existing', 'limited'].includes(song.status));
    const action = queuedSong ? `<span class="track-inline-progress" data-progress-id="${track.id}"><progress value="${queuedSong.progress}" max="100"></progress><b>${Math.round(queuedSong.progress)}%</b></span>` : `<button class="track-download" data-download-id="${track.id}" ${done || limited ? 'disabled' : ''}>${done ? '✓' : tr('download')}</button>`;
    return `<div class="track genre-track ${done ? 'downloaded-frame' : queuedSong ? 'queued-frame' : wanted && !limited ? 'queued-frame' : ''}" data-track-id="${track.id}"><div class="${done ? 'downloaded' : limited ? 'limit' : ''}">${done ? '●' : limited ? '!' : queuedSong ? '↓' : wanted ? '↓' : '–'}</div><div><h5>${escapeHTML(track.title)}</h5><p>${escapeHTML(track.artist)} • ${escapeHTML(track.version)} • ${escapeHTML(track.genre)}</p></div><span class="${done ? 'downloaded' : limited ? 'limit' : ''}">${done ? 'Déjà téléchargé' : limited ? 'Limite 3/3' : queuedSong ? tr('queued') : wanted ? `${track.downloadCount}/3 • Sélectionnée` : 'Version non cochée'}</span>${action}</div>`;
  }).join('');
  $('collections').innerHTML = rows || '<div class="empty">Aucun titre avec les versions choisies.</div>';
  document.querySelectorAll('[data-download-id]').forEach(button => { button.onclick = () => downloadSingleTrack(Number(button.dataset.downloadId)); });
}
async function loadGenres() {
  $('categories').innerHTML = '<div class="empty">Chargement…</div>';
  const response = await window.bpm.api('genres', { library: 'music' });
  state.genres = normalizeGenres(response);
  renderGenres();
}
async function selectGenre(key) {
  if (state.genreBusy) return;
  const genre = state.genres.find(item => String(item.slug || item.id || item.name) === String(key));
  if (!genre) return;
  state.genreBusy = true;
  state.selectedGenre = { ...genre, key: String(key), name: genre.name || genre.title };
  state.tracks = []; state.skip = 0; state.hasMore = false; state.albumIds = new Set();
  $('sectionTitle').textContent = state.selectedGenre.name;
  $('categoryDownloadBtn').hidden = false;
  renderGenres();
  await loadGenrePage(true);
  const button = $('categoryDownloadBtn'); button.disabled = true;
  try { await loadEveryGenreTrack(); }
  finally { state.genreBusy = false; button.disabled = false; button.textContent = `Télécharger tout le genre (${pendingTracks().length})`; renderTracks(); }
}
async function loadGenrePage(reset) {
  if (state.loading || !state.selectedGenre) return;
  state.loading = true;
  if (reset) $('collections').innerHTML = '<div class="empty">Chargement des titres…</div>';
  try {
    const response = await window.bpm.api('albums', { library: 'music', genre: state.selectedGenre.key, limit: state.pageSize, skip: state.skip });
    const albums = listFrom(response, ['albums']);
    const incoming = parseAlbums(response);
    const newAlbums = albums.filter(album => !state.albumIds.has(String(album.id)));
    newAlbums.forEach(album => state.albumIds.add(String(album.id)));
    const known = new Set(state.tracks.map(track => track.id));
    state.tracks.push(...incoming.filter(track => !known.has(track.id)));
    if (incoming.length) {
      const detection = await window.bpm.detectDownloaded(incoming, reset);
      state.records = detection.records;
    }
    state.skip += albums.length;
    state.hasMore = albums.length > 0 && newAlbums.length > 0;
    renderTracks();
  } catch (error) { toast(error.message, true); if (reset) $('collections').innerHTML = '<div class="empty">Impossible de charger les titres.</div>'; }
  finally { state.loading = false; }
}
async function loadEveryGenreTrack() {
  const button = $('categoryDownloadBtn');
  while (state.hasMore) {
    button.textContent = `Chargement de tout le genre… ${state.tracks.length} titres`;
    await loadGenrePage(false);
    await sleep(400);
  }
}
function genreJobQueued() { return state.queue.some(job => job.genreKey === state.selectedGenre?.key && !['done', 'error'].includes(job.status)); }
function enqueueDownload(items) {
  if (!state.selectedGenre || !items.length) return;
  const collection = { id: `genre-${state.selectedGenre.key}`, slug: state.selectedGenre.key, title: state.selectedGenre.name, kind: 'genre' };
  state.queue.push({
    id: ++state.queueId, genreKey: state.selectedGenre.key, genreName: state.selectedGenre.name,
    collection, items, status: 'pending', current: 'En attente', currentCount: 0,
    total: items.length, progress: 0, songProgress: 0,
    songs: items.map(item => ({ id: item.id, label: `${item.artist} — ${item.title} [${item.version}]`, status: state.records[String(item.id)] ? 'existing' : item.downloadCount >= 3 ? 'limited' : 'pending', progress: state.records[String(item.id)] ? 100 : 0 }))
  });
  renderDownloadCenter(); processQueue(); renderTracks();
}
function downloadSingleTrack(id) {
  const track = state.tracks.find(item => item.id === id);
  const alreadyQueued = state.queue.some(job => !['done', 'error'].includes(job.status) && (job.songs || []).some(song => song.id === id));
  if (!track || alreadyQueued || state.records[String(id)] || track.downloadCount >= 3) return;
  enqueueDownload([track]);
  toast(`${track.artist} — ${track.title} ${tr('queued').toLowerCase()}.`);
}
async function downloadWholeGenre() {
  if (!state.selectedGenre || state.genreBusy || genreJobQueued()) return;
  state.genreBusy = true; const button = $('categoryDownloadBtn'); button.disabled = true;
  try {
    await loadEveryGenreTrack();
    const items = eligibleTracks();
    if (!items.length) { toast('Aucun titre admissible dans ce genre.', true); return; }
    enqueueDownload(items);
    toast(`${items.length} titre(s) de ${state.selectedGenre.name} ajoutés au centre de téléchargement.`);
  } finally { state.genreBusy = false; button.disabled = false; button.textContent = `Télécharger tout le genre (${pendingTracks().length})`; }
}
function renderDownloadCenter() {
  const center = $('downloadMonitor'); center.hidden = !state.queue.length; if (!state.queue.length) return;
  const pending = state.queue.filter(job => job.status === 'pending').length;
  $('monitorTitle').textContent = state.currentJob ? 'Téléchargement en cours' : 'File d’attente';
  $('monitorCount').textContent = `${pending} en attente • ${state.queue.length} total`;
  const labels = { pending: 'En attente', active: 'Actif', done: 'Terminé', error: 'Erreur', downloading: 'Télécharge', completed: 'Terminé', existing: 'Déjà là', limited: 'Limite' };
  $('queueRows').innerHTML = state.queue.map(job => {
    const percent = Math.max(0, Math.min(100, Math.round(job.progress * 100)));
    return `<div class="queue-row job-row"><span class="queue-state ${job.status}">${labels[job.status]}</span><span>${escapeHTML(job.genreName)}</span><span title="${escapeHTML(job.current)}">${escapeHTML(job.current)}</span><span class="queue-progress"><progress value="${percent}" max="100"></progress><b>${job.currentCount}/${job.total} · ${percent}%</b></span></div>`;
  }).join('');
  $('monitorProgress').value = state.currentJob?.progress || 0;
  $('monitorCurrent').textContent = state.currentJob ? `${state.currentJob.genreName} — ${state.currentJob.current} — ${Math.round((state.currentJob.progress || 0) * 100)}%` : 'File terminée';
}
function removeFinishedJob(job) {
  setTimeout(() => {
    if (job.status !== 'done') return;
    state.queue = state.queue.filter(item => item !== job);
    renderDownloadCenter(); renderTracks();
  }, 1500);
}
async function processQueue() {
  if (state.queueBusy) return; state.queueBusy = true;
  try {
    while (true) {
      const job = state.queue.find(item => item.status === 'pending'); if (!job) break;
      state.currentJob = job; job.status = 'active'; job.current = 'Préparation…'; renderDownloadCenter();
      try {
        const result = await window.bpm.download({ collection: job.collection, items: job.items, genreName: job.genreName });
        state.records = result.records; job.status = result.errors.length ? 'error' : 'done'; job.current = result.errors.length ? `${result.errors.length} erreur(s)` : `${result.completed} fichier(s) ajouté(s)`;
      } catch (error) { job.status = 'error'; job.current = error.message; }
      job.currentCount = job.total; job.progress = 1; renderDownloadCenter(); renderTracks();
      if (job.status === 'done') removeFinishedJob(job);
    }
  } finally { state.currentJob = null; state.queueBusy = false; renderDownloadCenter(); }
}
async function initialize() {
  state.settings = await window.bpm.getSettings(); state.records = await window.bpm.getDownloaded();
  $('destinationPath').textContent = state.settings.destination;
  $('destinationPathSummary').textContent = state.settings.destination;
  $('downloadMode').value = state.settings.downloadMode || 'balanced';
  $('languageSelect').value = state.settings.language || 'system';
  applyLanguage();
  state.connected = (await window.bpm.status()).connected; renderAuth();
  if (state.connected) await loadGenres();
}

window.bpm.onProgress(info => {
  const job = state.currentJob; if (!job) return;
  job.current = info.label || job.current;
  if (info.phase !== 'waiting') {
    job.currentCount = Number(info.current || 0);
    job.total = Number(info.total || job.total);
    job.songProgress = Number(info.songProgress || 0);
    job.progress = job.total ? Math.min(1, (job.currentCount + (info.phase === 'downloading' ? job.songProgress / 100 : 0)) / job.total) : 0;
    const song = (job.songs || []).find(item => String(item.id) === String(info.itemId));
    if (song) {
      song.progress = info.phase === 'completed' ? 100 : job.songProgress;
      song.status = info.phase === 'completed' ? 'completed' : info.phase === 'error' ? 'error' : info.phase === 'downloading' ? 'downloading' : 'active';
    }
  }
  renderDownloadCenter();
  if (info.phase === 'downloading') {
    const progress = document.querySelector(`[data-progress-id="${CSS.escape(String(info.itemId))}"]`);
    if (progress) {
      progress.querySelector('progress').value = job.songProgress;
      progress.querySelector('b').textContent = `${Math.round(job.songProgress)}%`;
    }
  } else {
    renderTracks();
  }
});
window.bpm.onAuthChanged(async () => { state.connected = (await window.bpm.status()).connected; renderAuth(); if (state.connected) { toast('Connexion réussie.'); await loadGenres(); } });
window.bpm.onOrganizeProgress(info => { $('organizeBtn').textContent = `Classement ${info.processed}/${info.total}`; });
$('loginBtn').onclick = async () => { if (state.connected) { if (confirm('Déconnecter le compte BPM Supreme?')) { await window.bpm.logout(); state.connected = false; renderAuth(); } } else { await window.bpm.login(); toast('Connectez-vous dans la fenêtre BPM Supreme. Elle se fermera automatiquement.'); } };
$('refreshBtn').onclick = async () => { state.connected = (await window.bpm.status()).connected; renderAuth(); if (state.connected) await loadGenres(); };
$('destinationBtn').onclick = async () => { state.settings = await window.bpm.chooseDestination(); $('destinationPath').textContent = state.settings.destination; $('destinationPathSummary').textContent = state.settings.destination; };
$('downloadMode').onchange = async event => { state.settings = await window.bpm.updateSettings({ downloadMode: event.target.value }); };
$('languageSelect').onchange = async event => { state.settings = await window.bpm.updateSettings({ language: event.target.value }); applyLanguage(); };
$('settingsBtn').onclick = $('openSettingsBtn').onclick = () => { $('settingsPanel').hidden = false; };
$('settingsClose').onclick = () => { $('settingsPanel').hidden = true; };
$('settingsPanel').onclick = event => { if (event.target === $('settingsPanel')) $('settingsPanel').hidden = true; };
$('organizeBtn').onclick = async () => { const button = $('organizeBtn'); button.disabled = true; button.textContent = 'Analyse en cours…'; try { const preview = await window.bpm.organizePreview(); if (!preview.movable) { toast('Les fichiers sont déjà classés directement par genre.'); return; } if (!confirm(`${preview.movable} fichier(s) seront déplacés directement dans :\n${preview.destination}/Genre\n\nAucun morceau ne sera retéléchargé. Les playlists seront regroupées dans « Serato Playlists » et les anciens dossiers vides seront supprimés. Continuer?`)) return; const result = await window.bpm.organizeByGenre(); state.records = result.records; toast(`${result.moved} fichier(s) classé(s) et ${result.foldersRemoved} ancien(s) dossier(s) supprimé(s).`); renderTracks(); } catch (error) { toast(error.message, true); } finally { button.disabled = false; button.textContent = 'Classer l’existant par genre…'; } };
$('search').oninput = renderTracks;
$('categoryDownloadBtn').onclick = downloadWholeGenre;
$('monitorClose').onclick = () => { $('downloadMonitor').classList.toggle('collapsed'); $('monitorClose').textContent = $('downloadMonitor').classList.contains('collapsed') ? '⌃' : '⌄'; };
$('clearFinishedBtn').onclick = () => { state.queue = state.queue.filter(job => job.status !== 'error'); renderDownloadCenter(); };
initialize();
