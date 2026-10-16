const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bpm', {
  status: () => ipcRenderer.invoke('auth:status'),
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: patch => ipcRenderer.invoke('settings:update', patch),
  chooseDestination: () => ipcRenderer.invoke('settings:destination'),
  getDownloaded: () => ipcRenderer.invoke('downloads:list'),
  detectDownloaded: (items, refresh = false) => ipcRenderer.invoke('downloads:detect', { items, refresh }),
  organizePreview: () => ipcRenderer.invoke('library:organize-preview'),
  organizeByGenre: () => ipcRenderer.invoke('library:organize'),
  api: (path, query) => ipcRenderer.invoke('api:get', { path, query }),
  download: payload => ipcRenderer.invoke('downloads:start', payload),
  reveal: path => ipcRenderer.invoke('file:reveal', path),
  onAuthChanged: callback => {
    const listener = () => callback();
    ipcRenderer.on('auth:changed', listener);
    return () => ipcRenderer.removeListener('auth:changed', listener);
  },
  onProgress: callback => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on('downloads:progress', listener);
    return () => ipcRenderer.removeListener('downloads:progress', listener);
  },
  onOrganizeProgress: callback => {
    const listener = (_, value) => callback(value);
    ipcRenderer.on('library:organize-progress', listener);
    return () => ipcRenderer.removeListener('library:organize-progress', listener);
  }
});
