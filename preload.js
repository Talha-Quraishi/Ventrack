const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  isFirstLoad: () => ipcRenderer.invoke('is-first-load'),
  saveBackup: (data) => ipcRenderer.invoke('save-backup', data),
  loadBackup: () => ipcRenderer.invoke('load-backup'),
  
  // NEW: Fetch version from Main Process
  getAppVersion: () => ipcRenderer.invoke('get-version'),
  
  // NEW: Auto-backups features
  listBackups: () => ipcRenderer.invoke('list-backups'),
  restoreBackup: (filename) => ipcRenderer.invoke('restore-backup', filename),
  
  // NEW: Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // NEW: Auto-Updates APIs
  onUpdateStatus: (callback) => {
    const subscription = (event, status, data) => callback(status, data);
    ipcRenderer.on('update-status', subscription);
    return () => ipcRenderer.removeListener('update-status', subscription);
  },
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  restartAndUpdate: () => ipcRenderer.send('restart-and-update')
});