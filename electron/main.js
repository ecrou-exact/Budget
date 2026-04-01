'use strict';
/* ============================================================
   BUDGE v4.5 — electron/main.js
   • Sauvegarde TOUJOURS dans app/backups/AAAA/
   • --no-sandbox automatique sur Linux
   • Windows : pas besoin de --no-sandbox
   ============================================================ */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
// Sur Linux, le sandbox SUID nécessite des droits root — on le désactive
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}


const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ============================================================
// DOSSIER BACKUP — toujours dans app/backups/
// ============================================================
function getBackupRoot() {
  // Dossier app/ = dossier parent de electron/
  const base = path.join(__dirname, '..', 'app', 'backups');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function getYearDir(root, year) {
  const dir = path.join(root, String(year));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ============================================================
// FENÊTRE PRINCIPALE
// ============================================================
let mainWindow;

function createWindow() {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '..', 'app/images', 'icon.ico')
    : path.join(__dirname, '..', 'app/images', 'icon.png');

  mainWindow = new BrowserWindow({
    width:   1280,
    height:  820,
    minWidth:  900,
    minHeight: 600,
    title: 'Budge — Gestion Financière',
    icon: iconPath,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'app', 'index.html'));

  // Supprimer le menu natif (optionnel — gardez-le si vous voulez les raccourcis)
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();
  if (process.platform === 'linux') autoCreateDesktopEntry();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Crée automatiquement le lanceur .desktop sur Linux (une seule fois)
function autoCreateDesktopEntry() {
  try {
    const homeDir    = require('os').homedir();
    const appDir     = path.join(__dirname, '..');
    const iconPath   = path.join(appDir, 'app', 'icon.png');
    const scriptPath = path.join(appDir, 'start.sh');
    const desktopDir = path.join(homeDir, '.local', 'share', 'applications');
    const desktopFile = path.join(desktopDir, 'budge.desktop');

    fs.mkdirSync(desktopDir, { recursive: true });

    const content = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Budge',
      'Comment=Gestion budgétaire personnelle',
      'Exec=' + scriptPath,
      'Icon=' + iconPath,
      'Terminal=false',
      'Categories=Finance;Office;',
      'StartupWMClass=budge',
      'StartupNotify=true',
    ].join('\n');

    fs.writeFileSync(desktopFile, content, 'utf8');
    fs.chmodSync(desktopFile, 0o755);
    // Raccourci Bureau si le dossier existe
    const bureauDirs = ['Bureau', 'Desktop', 'Escritorio'];
    for (const dir of bureauDirs) {
      const desktopPath = path.join(homeDir, dir);
      if (fs.existsSync(desktopPath)) {
        const shortcut = path.join(desktopPath, 'budge.desktop');
        if (!fs.existsSync(shortcut)) {
          fs.copyFileSync(desktopFile, shortcut);
          fs.chmodSync(shortcut, 0o755);
        }
        break;
      }
    }
  } catch(e) {
    console.log('[Budge] autoCreateDesktopEntry:', e.message);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ============================================================
// IPC — Opérations fichier
// ============================================================

// Sauvegarde : crée app/backups/AAAA/budge_AAAA_Periode.json
ipcMain.handle('backup:save', async (_event, { year, periodSlug, payload }) => {
  try {
    const root     = getBackupRoot();
    const yearDir  = getYearDir(root, year);
    const fileName = 'budge_' + year + '_' + periodSlug + '.json';
    const filePath = path.join(yearDir, fileName);
    fs.writeFileSync(filePath, payload, 'utf8');
    return { ok: true, filePath, fileName };
  } catch(e) {
    console.error('[Budge] backup:save error:', e.message);
    return { ok: false, error: e.message };
  }
});

// Suppression du fichier quand on supprime une période
ipcMain.handle('backup:delete', async (_event, { year, periodSlug }) => {
  try {
    const root     = getBackupRoot();
    const fileName = 'budge_' + year + '_' + periodSlug + '.json';
    const filePath = path.join(root, String(year), fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      // Supprimer le dossier année s'il est vide
      const yearDir = path.join(root, String(year));
      try {
        if (fs.readdirSync(yearDir).length === 0) fs.rmdirSync(yearDir);
      } catch {}
    }
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
});

// Liste tous les backups existants (depuis le disque réel)
ipcMain.handle('backup:list', async () => {
  try {
    const root   = getBackupRoot();
    const result = [];
    if (!fs.existsSync(root)) return { ok: true, files: [] };
    const years = fs.readdirSync(root)
      .filter(d => /^\d{4}$/.test(d) && fs.statSync(path.join(root, d)).isDirectory());
    for (const year of years.sort().reverse()) {
      const yearDir = path.join(root, year);
      const files   = fs.readdirSync(yearDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const stat = fs.statSync(path.join(yearDir, f));
          return {
            year:     parseInt(year),
            fileName: f,
            savedAt:  stat.mtime.toISOString(),
            filePath: path.join(yearDir, f)
          };
        })
        .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
      result.push(...files);
    }
    return { ok: true, files: result };
  } catch(e) {
    return { ok: false, error: e.message, files: [] };
  }
});

// Chemin racine du dossier backup
ipcMain.handle('backup:getPath', async () => {
  try {
    return { ok: true, path: getBackupRoot() };
  } catch(e) {
    return { ok: false, error: e.message };
  }
});

// Ouvrir le dossier backup dans l'explorateur
ipcMain.handle('backup:openFolder', async () => {
  try {
    await shell.openPath(getBackupRoot());
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
});