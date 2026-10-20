const { contextBridge, ipcRenderer } = require('electron');

// Intentionally isolated from the real app profile, account and download files.
contextBridge.exposeInMainWorld('bpm', {
  getVersion: async () => '1.1.2',
  getSettings: async () => ({ language: 'en', destination: '/tmp/mock-library', downloadMode: 'balanced' }),
  getDownloaded: async () => ({ '999999': { filePath: '/tmp/mock-library/already-downloaded.mp3' } }),
  status: async () => ({ connected: false }),
  updateSettings: async patch => ({ language: 'en', destination: '/tmp/mock-library', ...patch }),
  chooseDestination: async () => ({ language: 'en', destination: '/tmp/mock-library' }),
  api: (route, query) => ipcRenderer.invoke('performance:api', { route, query }),
  detectDownloaded: async () => ({ matches: {} }),
  download: payload => ipcRenderer.invoke('performance:download', payload),
  onProgress: callback => ipcRenderer.on('performance:progress', (_, info) => callback(info)),
  onAuthChanged: () => {},
  onOrganizeProgress: () => {}
});
