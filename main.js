const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// --- DATA PATH & MIGRATION ---
const basePath = app.isPackaged 
  ? app.getPath('userData') 
  : __dirname; 

const DATA_FILE_PATH = path.join(basePath, 'vendor-tracker-data.json');
const BACKUPS_DIR = path.join(basePath, 'backups');

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    try {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    } catch (err) {
      console.error('Failed to create backups directory:', err);
    }
  }
}

function runAutoBackup(dataStr) {
  try {
    ensureBackupsDir();
    const date = new Date();
    const YYYY = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const DD = String(date.getDate()).padStart(2, '0');
    const filename = `backup_${YYYY}-${MM}-${DD}.json`;
    const filepath = path.join(BACKUPS_DIR, filename);

    fs.writeFileSync(filepath, dataStr);
    console.log('Successfully created daily backup at', filepath);
    
    rotateBackups();
  } catch (err) {
    console.error('Failed to run automatic backup:', err);
  }
}

function rotateBackups() {
  try {
    ensureBackupsDir();
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(BACKUPS_DIR, f);
        return {
          name: f,
          path: filePath,
          time: fs.statSync(filePath).mtime.getTime()
        };
      });

    files.sort((a, b) => b.time - a.time);

    if (files.length > 7) {
      for (let i = 7; i < files.length; i++) {
        fs.unlinkSync(files[i].path);
        console.log('Removed old backup file:', files[i].path);
      }
    }
  } catch (err) {
    console.error('Failed to rotate backups:', err);
  }
}


if (app.isPackaged) {
  const oldPath = path.join(path.dirname(app.getPath('exe')), 'vendor-tracker-data.json');
  if (!fs.existsSync(DATA_FILE_PATH) && fs.existsSync(oldPath)) {
    try {
      if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
      }
      fs.copyFileSync(oldPath, DATA_FILE_PATH);
      console.log('Successfully migrated data file from', oldPath, 'to', DATA_FILE_PATH);
    } catch (err) {
      console.error('Failed to migrate data file:', err);
    }
  }
}

let mainWindow;

// --- AUTO-UPDATE CONFIGURATION ---
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function sendUpdateStatus(status, data = null) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', status, data);
  }
}

// Auto-updater event mapping
autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus('checking');
});

autoUpdater.on('update-available', (info) => {
  sendUpdateStatus('available', info);
});

autoUpdater.on('update-not-available', (info) => {
  sendUpdateStatus('not-available', info);
});

autoUpdater.on('error', (err) => {
  sendUpdateStatus('error', err == null ? 'unknown error' : (err.stack || err.message || err).toString());
});

autoUpdater.on('download-progress', (progressObj) => {
  sendUpdateStatus('download-progress', {
    percent: progressObj.percent,
    bytesPerSecond: progressObj.bytesPerSecond,
    transferred: progressObj.transferred,
    total: progressObj.total
  });
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatus('downloaded', info);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    icon: path.join(__dirname, 'ventrack_logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true 
    }
  });

  mainWindow.maximize();
  mainWindow.loadFile(path.join(__dirname, 'vendor_tracker_native.html'));
  mainWindow.removeMenu();
}

app.whenReady().then(() => {

  // --- HANDLERS ---

  // 1. Get App Version from package.json
  ipcMain.handle('get-version', () => {
    return app.getVersion();
  });

  // 2. Load Data
  ipcMain.handle('load-data', () => {
    try {
      if (fs.existsSync(DATA_FILE_PATH)) {
        const data = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
        return JSON.parse(data);
      }
      return { orders: [], vendors: [], factories: [], materials: [], theme: 'light' };
    } catch (err) {
      console.error('Failed to load data:', err);
      return { error: err.message };
    }
  });

  // 3. Save Data
  ipcMain.handle('save-data', (event, dataStr) => {
    try {
      fs.writeFileSync(DATA_FILE_PATH, dataStr);
      runAutoBackup(dataStr);
      return { success: true };
    } catch (err) {
      console.error('Failed to save data:', err);
      // Return the explicit error so HTML can show it
      return { success: false, error: err.message };
    }
  });

  // 3b. List automatic backups
  ipcMain.handle('list-backups', () => {
    try {
      ensureBackupsDir();
      const files = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
        .map(f => {
          const stats = fs.statSync(path.join(BACKUPS_DIR, f));
          return {
            filename: f,
            date: f.replace('backup_', '').replace('.json', ''), 
            size: stats.size,
            mtime: stats.mtime.toISOString()
          };
        });
      
      files.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
      return { success: true, backups: files };
    } catch (err) {
      console.error('Failed to list backups:', err);
      return { success: false, error: err.message, backups: [] };
    }
  });

  // 3c. Restore backup file
  ipcMain.handle('restore-backup', (event, filename) => {
    try {
      if (!filename.startsWith('backup_') || !filename.endsWith('.json') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid backup filename');
      }
      ensureBackupsDir();
      const backupPath = path.join(BACKUPS_DIR, filename);
      if (!fs.existsSync(backupPath)) {
        throw new Error('Backup file does not exist');
      }
      fs.copyFileSync(backupPath, DATA_FILE_PATH);
      console.log('Restored database from backup:', backupPath);
      return { success: true };
    } catch (err) {
      console.error('Failed to restore backup:', err);
      return { success: false, error: err.message };
    }
  });


  // 4. Check First Load
  ipcMain.handle('is-first-load', () => {
    return !fs.existsSync(DATA_FILE_PATH);
  });

  // 5. Manual Backup
  ipcMain.handle('save-backup', async (event, dataStr) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Data Backup',
      defaultPath: 'vendor-tracker-backup.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { success: false, canceled: true };
    try {
      fs.writeFileSync(filePath, dataStr);
      return { success: true, canceled: false, path: filePath };
    } catch (err) {
      return { success: false, canceled: false, error: err.message };
    }
  });

  // 6. Manual Restore
  ipcMain.handle('load-backup', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Restore Data from Backup',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths || filePaths.length === 0) return { success: false, canceled: true };
    try {
      const data = fs.readFileSync(filePaths[0], 'utf-8');
      return { success: true, canceled: false, data: data }; 
    } catch (err) {
      return { success: false, canceled: false, error: err.message };
    }
  });

  // 7. Window controls
  ipcMain.on('window-minimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });

  ipcMain.on('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });

  // --- AUTO-UPDATES IPC LISTENERS ---
  ipcMain.on('check-for-updates', () => {
    autoUpdater.checkForUpdates().catch(err => {
      sendUpdateStatus('error', `Check failed: ${err.message}`);
    });
  });

  ipcMain.on('restart-and-update', () => {
    autoUpdater.quitAndInstall();
  });

  createWindow();

  // Trigger update check on startup (packaged only, to avoid dev environment errors)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.error('Failed to check for updates on startup:', err);
      });
    }, 5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});