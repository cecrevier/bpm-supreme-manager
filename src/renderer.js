const state = {
  connected: false, genres: [], selectedGenre: null, tracks: [], records: {}, settings: {},
  wanted: new Set(['intro clean', 'clean extended', 'dirty extended']),
  skip: 0, pageSize: 50, hasMore: false, loading: false, albumIds: new Set(),
  queue: [], queueBusy: false, currentJob: null, queueId: 0, genreBusy: false,
  tracksRevision: 0, recordsRevision: 0, eligibleCache: null, renderLimit: 100, downloadCenterFrame: 0, downloadCenterLastRender: 0,
  trackIds: new Set(), searchTimer: 0, trackRows: new Map()
};

const $ = id => document.getElementById(id);
const payload = body => body?.data ?? body;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const messages = {
  fr: {
    subtitle: 'Bibliothèque multiplateforme', search: 'Rechercher un titre…', speed: 'Vitesse', modeCautious: 'Prudent · 8 s', modeBalanced: 'Équilibré · 3 s', modeFast: 'Rapide · 1 s', settings: '⚙ Paramètres', location: 'Emplacement', openSettings: 'Ouvrir les paramètres…', settingsTitle: 'Paramètres', settingsSubtitle: 'Stockage, langue et organisation', language: 'Langue', languageSystem: 'Langue du système', destination: 'Disque ou dossier de destination', chooseDestination: 'Choisir un disque ou dossier…', organize: 'Classer l’existant par genre…', connected: 'Connecté', disconnected: 'Non connecté', account: 'Compte', login: 'Se connecter', download: 'Télécharger', queued: 'En attente', downloading: 'Téléchargement', clearErrors: 'Effacer les erreurs',
    library: 'Bibliothèque', genres: 'Genres', genre: 'Genre', song: 'Chanson', preparing: 'Préparation…', refresh: 'Actualiser', chooseInSettings: 'À choisir dans Paramètres', chooseGenre: 'Choisissez un genre', preferredVersions: 'Versions prioritaires :', versionRule: 'Maximum 3 versions par titre; l’application complète avec les versions disponibles.', selectedVersion: 'Version cochée', alreadyDownloaded: 'Déjà téléchargé', limitReached: 'Limite atteinte', unselectedVersion: '— Version non cochée', connectChooseGenre: 'Connectez-vous et choisissez un genre.', loading: 'Chargement…', downloadCenter: 'Centre de téléchargement', queue: 'File d’attente', noDownload: 'Aucun téléchargement', status: 'État', currentTrack: 'Chanson actuelle', progress: 'Progression', collapse: 'Réduire', close: 'Fermer', none: 'Aucun', noGenre: 'Aucun genre.', noTracks: 'Aucun titre avec les versions choisies.', chooseGenreTracks: 'Choisissez un genre pour afficher ses titres.', loadingTracks: 'Chargement des titres…', loadFailed: 'Impossible de charger les titres.', downloadGenre: 'Télécharger tout le genre', loadingGenre: 'Chargement de tout le genre…', loadMore: 'Afficher plus', pending: 'En attente', active: 'Actif', done: 'Terminé', error: 'Erreur', existing: 'Déjà là', limited: 'Limite', selected: 'Sélectionnée', queueFinished: 'File terminée', track: 'titre', tracks: 'titres', version: 'version', versions: 'versions', task: 'tâche', tasks: 'tâches', pendingCount: 'en attente', unknownArtist: 'Artiste inconnu', unknownGenre: 'Genre inconnu', untitled: 'Sans titre', signInSuccess: 'Connexion réussie.', signInWindow: 'Connectez-vous dans la fenêtre BPM Supreme. Elle se fermera automatiquement.', signOutConfirm: 'Déconnecter le compte BPM Supreme?', noEligible: 'Aucun titre admissible dans ce genre.', analysis: 'Analyse en cours…'
  },
  en: {
    subtitle: 'Cross-platform library', search: 'Search tracks…', speed: 'Speed', modeCautious: 'Cautious · 8 s', modeBalanced: 'Balanced · 3 s', modeFast: 'Fast · 1 s', settings: '⚙ Settings', location: 'Location', openSettings: 'Open settings…', settingsTitle: 'Settings', settingsSubtitle: 'Storage, language and organization', language: 'Language', languageSystem: 'System language', destination: 'Destination drive or folder', chooseDestination: 'Choose a drive or folder…', organize: 'Organize existing files by genre…', connected: 'Connected', disconnected: 'Disconnected', account: 'Account', login: 'Sign in', download: 'Download', queued: 'Queued', downloading: 'Downloading', clearErrors: 'Clear errors',
    library: 'Library', genres: 'Genres', genre: 'Genre', song: 'Song', preparing: 'Preparing…', refresh: 'Refresh', chooseInSettings: 'Choose in Settings', chooseGenre: 'Choose a genre', preferredVersions: 'Preferred versions:', versionRule: 'Maximum 3 versions per title; the app fills remaining slots with available versions.', selectedVersion: 'Selected version', alreadyDownloaded: 'Already downloaded', limitReached: 'Limit reached', unselectedVersion: '— Unselected version', connectChooseGenre: 'Sign in and choose a genre.', loading: 'Loading…', downloadCenter: 'Download Center', queue: 'Queue', noDownload: 'No download', status: 'Status', currentTrack: 'Current track', progress: 'Progress', collapse: 'Collapse', close: 'Close', none: 'None', noGenre: 'No genres.', noTracks: 'No tracks match the selected versions.', chooseGenreTracks: 'Choose a genre to display its tracks.', loadingTracks: 'Loading tracks…', loadFailed: 'Unable to load tracks.', downloadGenre: 'Download entire genre', loadingGenre: 'Loading entire genre…', loadMore: 'Load more', pending: 'Pending', active: 'Active', done: 'Completed', error: 'Error', existing: 'Already downloaded', limited: 'Limit reached', selected: 'Selected', queueFinished: 'Queue complete', track: 'track', tracks: 'tracks', version: 'version', versions: 'versions', task: 'task', tasks: 'tasks', pendingCount: 'pending', unknownArtist: 'Unknown artist', unknownGenre: 'Unknown genre', untitled: 'Untitled', signInSuccess: 'Sign-in successful.', signInWindow: 'Sign in using the BPM Supreme window. It will close automatically.', signOutConfirm: 'Sign out of the BPM Supreme account?', noEligible: 'No eligible tracks are available in this genre.', analysis: 'Analyzing…'
  },
  es: {
    subtitle: 'Biblioteca multiplataforma', search: 'Buscar canciones…', speed: 'Velocidad', modeCautious: 'Prudente · 8 s', modeBalanced: 'Equilibrado · 3 s', modeFast: 'Rápido · 1 s', settings: '⚙ Ajustes', location: 'Ubicación', openSettings: 'Abrir ajustes…', settingsTitle: 'Ajustes', settingsSubtitle: 'Almacenamiento, idioma y organización', language: 'Idioma', languageSystem: 'Idioma del sistema', destination: 'Disco o carpeta de destino', chooseDestination: 'Elegir disco o carpeta…', organize: 'Organizar archivos por género…', connected: 'Conectado', disconnected: 'Desconectado', account: 'Cuenta', login: 'Iniciar sesión', download: 'Descargar', queued: 'En cola', downloading: 'Descargando', clearErrors: 'Borrar errores',
    library: 'Biblioteca', genres: 'Géneros', genre: 'Género', song: 'Canción', preparing: 'Preparando…', refresh: 'Actualizar', chooseInSettings: 'Elegir en Ajustes', chooseGenre: 'Elige un género', preferredVersions: 'Versiones preferidas:', versionRule: 'Máximo 3 versiones por título; la aplicación completa con las versiones disponibles.', selectedVersion: 'Versión seleccionada', alreadyDownloaded: 'Ya descargado', limitReached: 'Límite alcanzado', unselectedVersion: '— Versión no seleccionada', connectChooseGenre: 'Inicia sesión y elige un género.', loading: 'Cargando…', downloadCenter: 'Centro de descargas', queue: 'Cola', noDownload: 'Sin descargas', status: 'Estado', currentTrack: 'Canción actual', progress: 'Progreso', collapse: 'Contraer', close: 'Cerrar', none: 'Ninguno', noGenre: 'No hay géneros.', noTracks: 'No hay canciones con las versiones seleccionadas.', chooseGenreTracks: 'Elige un género para ver sus canciones.', loadingTracks: 'Cargando canciones…', loadFailed: 'No se pudieron cargar las canciones.', downloadGenre: 'Descargar género completo', loadingGenre: 'Cargando género completo…', loadMore: 'Mostrar más', pending: 'En cola', active: 'Activo', done: 'Completado', error: 'Error', existing: 'Ya descargado', limited: 'Límite alcanzado', selected: 'Seleccionada', queueFinished: 'Cola completada', track: 'canción', tracks: 'canciones', version: 'versión', versions: 'versiones', task: 'tarea', tasks: 'tareas', pendingCount: 'pendientes', unknownArtist: 'Artista desconocido', unknownGenre: 'Género desconocido', untitled: 'Sin título', signInSuccess: 'Inicio de sesión correcto.', signInWindow: 'Inicia sesión en la ventana de BPM Supreme. Se cerrará automáticamente.', signOutConfirm: '¿Cerrar la sesión de BPM Supreme?', noEligible: 'No hay canciones disponibles en este género.', analysis: 'Analizando…'
  }
};
function activeLanguage() { const selected = state.settings.language || 'system'; const system = (navigator.language || 'en').slice(0, 2); return selected === 'system' ? (messages[system] ? system : 'en') : selected; }
function tr(key) { return messages[activeLanguage()]?.[key] || messages.fr[key] || key; }
function countLabel(count, singular, plural) { return `${count} ${tr(count === 1 ? singular : plural)}`; }
function applyLanguage() {
  document.documentElement.lang = activeLanguage();
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = tr(element.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => { element.placeholder = tr(element.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-title]').forEach(element => { element.title = tr(element.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(element => { element.setAttribute('aria-label', tr(element.dataset.i18nAriaLabel)); });
  if (state.settings.destination) {
    $('destinationPath').textContent = state.settings.destination;
    $('destinationPathSummary').textContent = state.settings.destination;
  }
  if (state.selectedGenre) $('sectionTitle').textContent = state.selectedGenre.name;
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
    const artist = typeof album.artist === 'string' ? album.artist : (album.artist?.name || album.artists?.map(value => value.name).filter(Boolean).join(', ') || tr('unknownArtist'));
    const genre = album.genre?.name || album.genre_name || state.selectedGenre?.name || tr('unknownGenre');
    return (album.media || album.versions || []).map(media => ({
      id: Number(media.id), albumId: Number(album.id), title: album.name || album.title || tr('untitled'), artist, genre,
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
  }).join('') || `<div class="empty">${escapeHTML(tr('noGenre'))}</div>`;
  document.querySelectorAll('.category[data-key]').forEach(button => { button.onclick = () => selectGenre(button.dataset.key); });
}
function eligibleTracks() {
  const cacheKey = `${state.tracksRevision}:${state.recordsRevision}`;
  if (state.eligibleCache?.key === cacheKey) return state.eligibleCache.value;
  const priority = new Map([['intro clean', 0], ['clean extended', 1], ['dirty extended', 2], ['clean', 10], ['clean radio edit', 11], ['clean short edit', 12], ['intro dirty', 13], ['dirty', 14], ['dirty radio edit', 15]]);
  const groups = new Map();
  for (const track of state.tracks) {
    const key = track.albumId || `${track.artist}-${track.title}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(track);
  }
  const result = [...groups.values()].flatMap(tracks => tracks.sort((left, right) => {
    const leftUnavailable = left.downloadCount >= 3 && !state.records[String(left.id)] ? 100 : 0;
    const rightUnavailable = right.downloadCount >= 3 && !state.records[String(right.id)] ? 100 : 0;
    return leftUnavailable + (priority.get(left.version.toLowerCase()) ?? 50) - rightUnavailable - (priority.get(right.version.toLowerCase()) ?? 50);
  }).slice(0, 3));
  state.eligibleCache = { key: cacheKey, value: result };
  return result;
}
function pendingTracks() { return eligibleTracks().filter(track => !state.records[String(track.id)] && track.downloadCount < 3); }
function renderTracks() {
  const search = $('search').value.trim().toLowerCase();
  const visible = state.tracks.filter(track => !search || `${track.title} ${track.artist} ${track.version}`.toLowerCase().includes(search));
  const chosenIds = new Set(eligibleTracks().map(track => track.id));
  const titleCount = new Set(visible.map(track => track.albumId || `${track.artist}-${track.title}`)).size;
  $('collectionCount').textContent = `${countLabel(titleCount, 'track', 'tracks')} • ${countLabel(visible.length, 'version', 'versions')}`;
  state.trackRows.clear();
  if (!state.selectedGenre) { $('collections').innerHTML = `<div class="empty">${escapeHTML(tr('chooseGenreTracks'))}</div>`; return; }
  const renderedTracks = visible.slice(0, state.renderLimit);
  const rows = renderedTracks.map(track => {
    const done = Boolean(state.records[String(track.id)]); const limited = track.downloadCount >= 3; const wanted = chosenIds.has(track.id);
    const queuedSong = state.queue.map(job => job.songById?.get(String(track.id))).find(song => song && !['existing', 'limited'].includes(song.status));
    const active = queuedSong && ['active', 'downloading'].includes(queuedSong.status);
    const action = done ? '<button class="track-download" disabled>✓</button>' : active ? `<span class="track-inline-progress" data-progress-id="${track.id}"><progress value="${queuedSong.progress}" max="100"></progress><b>${Math.round(queuedSong.progress)}%</b></span>` : queuedSong ? `<span class="track-queued">${escapeHTML(tr('queued'))}</span>` : `<button class="track-download" data-download-id="${track.id}" ${limited ? 'disabled' : ''}>${tr('download')}</button>`;
    const status = done ? tr('alreadyDownloaded') : limited ? `${tr('limited')} 3/3` : queuedSong ? tr('queued') : wanted ? `${track.downloadCount}/3 • ${tr('selected')}` : tr('unselectedVersion').replace(/^—\s*/, '');
    return `<div class="track genre-track ${done ? 'downloaded-frame' : queuedSong ? 'queued-frame' : wanted && !limited ? 'queued-frame' : ''}" data-track-id="${track.id}"><div class="${done ? 'downloaded' : limited ? 'limit' : ''}">${done ? '●' : limited ? '!' : queuedSong ? '↓' : wanted ? '↓' : '–'}</div><div><h5>${escapeHTML(track.title)}</h5><p>${escapeHTML(track.artist)} • ${escapeHTML(track.version)} • ${escapeHTML(track.genre)}</p></div><span class="${done ? 'downloaded' : limited ? 'limit' : ''}">${escapeHTML(status)}</span>${action}</div>`;
  }).join('');
  const more = visible.length > renderedTracks.length ? `<button class="load-more" id="loadMoreBtn">${escapeHTML(tr('loadMore'))} (${visible.length - renderedTracks.length})</button>` : '';
  $('collections').innerHTML = rows ? rows + more : `<div class="empty">${escapeHTML(tr('noTracks'))}</div>`;
  $('collections').querySelectorAll('[data-track-id]').forEach(row => state.trackRows.set(row.dataset.trackId, row));
  document.querySelectorAll('[data-download-id]').forEach(button => { button.onclick = () => downloadSingleTrack(Number(button.dataset.downloadId)); });
  if ($('loadMoreBtn')) $('loadMoreBtn').onclick = () => { state.renderLimit += 100; renderTracks(); };
}
async function loadGenres() {
  $('categories').innerHTML = `<div class="empty">${escapeHTML(tr('loading'))}</div>`;
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
  state.tracks = []; state.skip = 0; state.hasMore = false; state.albumIds = new Set(); state.trackIds = new Set(); state.renderLimit = 100; state.tracksRevision += 1; state.eligibleCache = null;
  $('sectionTitle').textContent = state.selectedGenre.name;
  $('categoryDownloadBtn').hidden = false;
  renderGenres();
  const button = $('categoryDownloadBtn'); button.disabled = true;
  try { await loadGenrePage(true, true); await loadEveryGenreTrack(); }
  catch (error) { toast(error.message, true); }
  finally { state.genreBusy = false; button.disabled = false; button.textContent = `${tr('downloadGenre')} (${pendingTracks().length})`; renderTracks(); }
}
async function loadGenrePage(reset, shouldRender = true) {
  if (state.loading || !state.selectedGenre) return;
  state.loading = true;
  if (reset) $('collections').innerHTML = `<div class="empty">${escapeHTML(tr('loadingTracks'))}</div>`;
  try {
    const response = await window.bpm.api('albums', { library: 'music', genre: state.selectedGenre.key, limit: state.pageSize, skip: state.skip });
    const albums = listFrom(response, ['albums']);
    const incoming = parseAlbums(response);
    const newAlbums = albums.filter(album => !state.albumIds.has(String(album.id)));
    newAlbums.forEach(album => state.albumIds.add(String(album.id)));
    const additions = incoming.filter(track => !state.trackIds.has(track.id));
    additions.forEach(track => state.trackIds.add(track.id));
    state.tracks.push(...additions);
    if (additions.length) { state.tracksRevision += 1; state.eligibleCache = null; }
    if (incoming.length) {
      const detection = await window.bpm.detectDownloaded(incoming, false);
      if (detection.matches && Object.keys(detection.matches).length) {
        Object.assign(state.records, detection.matches); state.recordsRevision += 1; state.eligibleCache = null;
      }
    }
    state.skip += albums.length;
    state.hasMore = albums.length > 0 && newAlbums.length > 0;
    if (!$('search').value.trim()) $('collectionCount').textContent = `${countLabel(state.albumIds.size, 'track', 'tracks')} • ${countLabel(state.tracks.length, 'version', 'versions')}`;
    if (shouldRender) renderTracks();
  } catch (error) { if (reset) $('collections').innerHTML = `<div class="empty">${escapeHTML(tr('loadFailed'))}</div>`; throw error; }
  finally { state.loading = false; }
}
async function loadEveryGenreTrack() {
  const button = $('categoryDownloadBtn');
  while (state.hasMore) {
    button.textContent = `${tr('loadingGenre')} ${countLabel(state.albumIds.size, 'track', 'tracks')}`;
    await loadGenrePage(false, false);
    await sleep(100);
  }
}
function genreJobQueued() { return state.queue.some(job => job.genreKey === state.selectedGenre?.key && !['done', 'error'].includes(job.status)); }
function enqueueDownload(items) {
  if (!state.selectedGenre || !items.length) return;
  const collection = { id: `genre-${state.selectedGenre.key}`, slug: state.selectedGenre.key, title: state.selectedGenre.name, kind: 'genre' };
  const songs = items.map(item => ({ id: item.id, label: `${item.artist} — ${item.title} [${item.version}]`, status: state.records[String(item.id)] ? 'existing' : item.downloadCount >= 3 ? 'limited' : 'pending', progress: state.records[String(item.id)] ? 100 : 0 }));
  state.queue.push({
    id: ++state.queueId, genreKey: state.selectedGenre.key, genreName: state.selectedGenre.name,
    collection, items, status: 'pending', current: tr('pending'), currentCount: 0,
    total: items.length, progress: 0, songProgress: 0,
    songs, songById: new Map(songs.map(song => [String(song.id), song]))
  });
  renderDownloadCenter(); renderTracks();
  // Paint the queued state before crossing IPC or starting any download work.
  requestAnimationFrame(() => { processQueue(); });
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
    button.textContent = tr('preparing');
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    await loadEveryGenreTrack();
    const items = pendingTracks();
    if (!items.length) { toast(tr('noEligible'), true); return; }
    enqueueDownload(items);
    toast(`${countLabel(items.length, 'track', 'tracks')} — ${state.selectedGenre.name}`);
  } catch (error) { toast(error.message, true); }
  finally { state.genreBusy = false; button.disabled = false; button.textContent = `${tr('downloadGenre')} (${pendingTracks().length})`; }
}
function renderDownloadCenter() {
  if (state.downloadCenterFrame) clearTimeout(state.downloadCenterFrame);
  state.downloadCenterFrame = 0;
  state.downloadCenterLastRender = performance.now();
  const center = $('downloadMonitor'); center.hidden = !state.queue.length; if (!state.queue.length) return;
  const pending = state.queue.filter(job => job.status === 'pending').length;
  $('monitorTitle').textContent = state.currentJob ? tr('downloading') : tr('queue');
  $('monitorCount').textContent = `${pending} ${tr('pendingCount')} • ${countLabel(state.queue.length, 'task', 'tasks')}`;
  const labels = { pending: tr('pending'), active: tr('active'), done: tr('done'), error: tr('error'), downloading: tr('downloading'), completed: tr('done'), existing: tr('existing'), limited: tr('limited') };
  $('queueRows').innerHTML = state.queue.map(job => {
    const percent = Math.max(0, Math.min(100, Math.round(job.progress * 100)));
    return `<div class="queue-row job-row" data-job-id="${job.id}"><span class="queue-state ${job.status}">${labels[job.status]}</span><span>${escapeHTML(job.genreName)}</span><span class="job-current" title="${escapeHTML(job.current)}">${escapeHTML(job.current)}</span><span class="queue-progress"><progress value="${percent}" max="100"></progress><b>${job.currentCount}/${job.total} · ${percent}%</b></span></div>`;
  }).join('');
  $('monitorProgress').value = state.currentJob?.progress || 0;
  $('monitorCurrent').textContent = state.currentJob ? `${state.currentJob.genreName} — ${state.currentJob.current} — ${Math.round((state.currentJob.progress || 0) * 100)}%` : tr('queueFinished');
}
function updateActiveJobUI(job) {
  const row = document.querySelector(`[data-job-id="${CSS.escape(String(job.id))}"]`);
  const percent = Math.max(0, Math.min(100, Math.round(job.progress * 100)));
  if (row) {
    const current = row.querySelector('.job-current');
    if (current) { current.textContent = job.current; current.title = job.current; }
    const progress = row.querySelector('progress'); if (progress) progress.value = percent;
    const count = row.querySelector('.queue-progress b'); if (count) count.textContent = `${job.currentCount}/${job.total} · ${percent}%`;
  }
  $('monitorProgress').value = job.progress || 0;
  $('monitorCurrent').textContent = `${job.genreName} — ${job.current} — ${percent}%`;
}
function scheduleDownloadCenterRender(immediate = false) {
  if (immediate || performance.now() - state.downloadCenterLastRender >= 200) { renderDownloadCenter(); return; }
  if (state.downloadCenterFrame) return;
  const delay = Math.max(0, 200 - (performance.now() - state.downloadCenterLastRender));
  state.downloadCenterFrame = setTimeout(() => renderDownloadCenter(), delay);
}
function updateTrackProgress(itemId, progressValue, completed = false) {
  const row = state.trackRows.get(String(itemId));
  if (!row) return;
  let progress = row.querySelector('.track-inline-progress');
  if (!completed && !progress && !state.records[String(itemId)]) {
    row.lastElementChild.outerHTML = `<span class="track-inline-progress" data-progress-id="${Number(itemId)}"><progress value="0" max="100"></progress><b>0%</b></span>`;
    progress = row.lastElementChild;
    row.children[2].textContent = tr('downloading');
  }
  if (progress) {
    progress.querySelector('progress').value = progressValue;
    progress.querySelector('b').textContent = `${Math.round(progressValue)}%`;
  }
  if (!completed) return;
  row.classList.remove('queued-frame'); row.classList.add('downloaded-frame');
  row.firstElementChild.className = 'downloaded'; row.firstElementChild.textContent = '●';
  const status = row.children[2]; status.className = 'downloaded'; status.textContent = tr('alreadyDownloaded');
  if (progress) progress.outerHTML = '<button class="track-download" disabled>✓</button>';
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
      state.currentJob = job; job.status = 'active'; job.current = tr('preparing'); renderDownloadCenter();
      try {
        const result = await window.bpm.download({ collection: job.collection, items: job.items, genreName: job.genreName });
        Object.assign(state.records, result.records); state.recordsRevision += 1; state.eligibleCache = null; job.status = result.errors.length ? 'error' : 'done'; job.current = result.errors.length ? `${result.errors.length} ${tr('error')}` : `${result.completed} ${tr('done')}`;
      } catch (error) { job.status = 'error'; job.current = error.message; }
      job.currentCount = job.total; job.progress = 1; renderDownloadCenter(); renderTracks();
      if (job.status === 'done') removeFinishedJob(job);
    }
  } finally { state.currentJob = null; state.queueBusy = false; renderDownloadCenter(); }
}
async function initialize() {
  if (window.bpm.getVersion) {
    const version = await window.bpm.getVersion();
    $('appVersion').textContent = `v${version}`;
    document.title = `BPM Supreme Manager ${version}`;
  }
  state.settings = await window.bpm.getSettings(); state.records = await window.bpm.getDownloaded(); state.recordsRevision += 1;
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
    const song = job.songById?.get(String(info.itemId));
    if (song) {
      song.progress = info.phase === 'completed' ? 100 : job.songProgress;
      song.status = info.phase === 'completed' ? 'completed' : info.phase === 'error' ? 'error' : info.phase === 'downloading' ? 'downloading' : 'active';
    }
  }
  updateActiveJobUI(job);
  if (info.phase === 'starting' || info.phase === 'downloading') {
    updateTrackProgress(info.itemId, job.songProgress);
  } else if (info.phase === 'completed') {
    if (info.filePath) state.records[String(info.itemId)] = { filePath: info.filePath };
    updateTrackProgress(info.itemId, 100, true);
  } else if (info.phase === 'error') updateTrackProgress(info.itemId, 0);
});
window.bpm.onAuthChanged(async () => { state.connected = (await window.bpm.status()).connected; renderAuth(); if (state.connected) { toast(tr('signInSuccess')); await loadGenres(); } });
window.bpm.onOrganizeProgress(info => { $('organizeBtn').textContent = `${tr('organize')} ${info.processed}/${info.total}`; });
$('loginBtn').onclick = async () => { if (state.connected) { if (confirm(tr('signOutConfirm'))) { await window.bpm.logout(); state.connected = false; renderAuth(); } } else { await window.bpm.login(); toast(tr('signInWindow')); } };
$('refreshBtn').onclick = async () => { state.connected = (await window.bpm.status()).connected; renderAuth(); if (state.connected) await loadGenres(); };
$('destinationBtn').onclick = async () => { state.settings = await window.bpm.chooseDestination(); $('destinationPath').textContent = state.settings.destination; $('destinationPathSummary').textContent = state.settings.destination; };
$('downloadMode').onchange = async event => { state.settings = await window.bpm.updateSettings({ downloadMode: event.target.value }); };
$('languageSelect').onchange = async event => { state.settings = await window.bpm.updateSettings({ language: event.target.value }); applyLanguage(); };
$('settingsBtn').onclick = $('openSettingsBtn').onclick = () => { $('settingsPanel').hidden = false; };
$('settingsClose').onclick = () => { $('settingsPanel').hidden = true; };
$('settingsPanel').onclick = event => { if (event.target === $('settingsPanel')) $('settingsPanel').hidden = true; };
const organizerText = {
  fr: { already: 'Les fichiers sont déjà classés directement par genre.', confirm: (count, destination) => `${count} fichier(s) seront déplacés directement dans :\n${destination}/Genre\n\nAucun morceau ne sera retéléchargé. Les playlists seront regroupées dans « Serato Playlists » et les anciens dossiers vides seront supprimés. Continuer?`, done: result => `${result.moved} fichier(s) classé(s) et ${result.foldersRemoved} ancien(s) dossier(s) supprimé(s).` },
  en: { already: 'Files are already organized directly by genre.', confirm: (count, destination) => `${count} file(s) will be moved directly to:\n${destination}/Genre\n\nNo music will be downloaded again. Playlists will be grouped under “Serato Playlists” and empty legacy folders will be removed. Continue?`, done: result => `${result.moved} file(s) organized and ${result.foldersRemoved} old folder(s) removed.` },
  es: { already: 'Los archivos ya están organizados directamente por género.', confirm: (count, destination) => `Se moverán ${count} archivo(s) directamente a:\n${destination}/Genre\n\nNo se volverá a descargar música. Las listas se agruparán en “Serato Playlists” y se eliminarán las carpetas antiguas vacías. ¿Continuar?`, done: result => `${result.moved} archivo(s) organizados y ${result.foldersRemoved} carpeta(s) antigua(s) eliminadas.` }
};
$('organizeBtn').onclick = async () => { const button = $('organizeBtn'); const copy = organizerText[activeLanguage()] || organizerText.en; button.disabled = true; button.textContent = tr('analysis'); try { const preview = await window.bpm.organizePreview(); if (!preview.movable) { toast(copy.already); return; } if (!confirm(copy.confirm(preview.movable, preview.destination))) return; const result = await window.bpm.organizeByGenre(); state.records = result.records; state.recordsRevision += 1; state.eligibleCache = null; toast(copy.done(result)); renderTracks(); } catch (error) { toast(error.message, true); } finally { button.disabled = false; button.textContent = tr('organize'); } };
$('search').oninput = () => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => { state.renderLimit = 100; renderTracks(); }, 100);
};
$('categoryDownloadBtn').onclick = downloadWholeGenre;
$('monitorClose').onclick = () => { $('downloadMonitor').classList.toggle('collapsed'); $('monitorClose').textContent = $('downloadMonitor').classList.contains('collapsed') ? '⌃' : '⌄'; };
$('clearFinishedBtn').onclick = () => { state.queue = state.queue.filter(job => job.status !== 'error'); renderDownloadCenter(); };
initialize();
