'use strict';
/* ============================================================
   BUDGE v4.4 — history.js
   Sauvegarde universelle Chrome + Firefox :
   • MÉTHODE 1 (Chrome/Edge) : File System Access API
     → dossier choisi une fois, handle persisté en IndexedDB
     → sauvegarde silencieuse à la fermeture
   • MÉTHODE 2 (Firefox + tous navigateurs) : téléchargement forcé
     → déclenche un <a download> à la fermeture / manuellement
     → fichier nommé budge_AAAA_NomPeriode.json
   Les deux méthodes écrasent logiquement le même nom de fichier.
   ============================================================ */

const IDB_HANDLE_KEY = 'budge_save_dir_handle';
const FS_API_SUPPORTED = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// ============================================================
// INDEXEDDB — persister le handle dossier (Chrome seulement)
// ============================================================
async function getSaveDirHandle() {
  if (!FS_API_SUPPORTED) return null;
  return new Promise(resolve => {
    const req = indexedDB.open('budge_idb', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => {
      try {
        const tx  = e.target.result.transaction('handles', 'readonly');
        const get = tx.objectStore('handles').get(IDB_HANDLE_KEY);
        get.onsuccess = () => resolve(get.result || null);
        get.onerror   = () => resolve(null);
      } catch { resolve(null); }
    };
    req.onerror = () => resolve(null);
  });
}

async function saveSaveDirHandle(handle) {
  return new Promise(resolve => {
    const req = indexedDB.open('budge_idb', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => {
      try {
        const tx = e.target.result.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, IDB_HANDLE_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror    = () => resolve(false);
      } catch { resolve(false); }
    };
    req.onerror = () => resolve(false);
  });
}

async function verifyPermission(handle) {
  if (!handle) return false;
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch { return false; }
}

// ============================================================
// NOM DU FICHIER
// ============================================================
function buildSaveFileName() {
  const year = new Date().getFullYear();
  const pName = currentPeriodId
    ? (getPeriod(currentPeriodId)?.name || 'Global').replace(/[^a-zA-Z0-9\-_\u00C0-\u024F]/g, '_')
    : 'Global';
  return 'budge_' + year + '_' + pName + '.json';
}

function buildSavePayload() {
  return JSON.stringify({
    _budgeVersion: '4.4',
    _savedAt:      new Date().toISOString(),
    _fileName:     buildSaveFileName(),
    ...appData
  }, null, 2);
}

// ============================================================
// MÉTHODE 1 — File System Access API (Chrome/Edge)
// ============================================================
async function chooseSaveFolder() {
  if (!FS_API_SUPPORTED) {
    showToast('File System API non disponible → utilisation du téléchargement automatique (Firefox)', 'info');
    updateSaveFolderUI(null);
    return null;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'budge-save' });
    await saveSaveDirHandle(handle);
    updateSaveFolderUI(handle);
    showToast('Dossier de sauvegarde défini ✓', 'success');
    return handle;
  } catch(e) {
    if (e.name !== 'AbortError') showToast('Erreur : ' + e.message, 'danger');
    return null;
  }
}

async function writeToDirHandle(handle, payload, fileName) {
  const ok = await verifyPermission(handle);
  if (!ok) return false;
  try {
    const fh  = await handle.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    await writable.write(payload);
    await writable.close();
    return true;
  } catch(e) {
    console.error('[Budge] FS write error:', e);
    return false;
  }
}

// ============================================================
// MÉTHODE 2 — Téléchargement forcé (Firefox + tous navigateurs)
// ============================================================
function downloadSaveFile(payload, fileName) {
  try {
    const blob = new Blob([payload], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch(e) {
    console.error('[Budge] Download error:', e);
    return false;
  }
}

// ============================================================
// SAUVEGARDE UNIFIÉE
// ============================================================

// Appelée à la fermeture (silent best-effort)
async function saveToDisk() {
  const fileName = buildSaveFileName();
  const payload  = buildSavePayload();

  if (FS_API_SUPPORTED) {
    const handle = await getSaveDirHandle();
    if (handle) {
      const ok = await writeToDirHandle(handle, payload, fileName);
      if (ok) { addToSaveLog(fileName, 'fs'); return; }
    }
  }
  // Fallback : téléchargement (Firefox ou pas de dossier configuré)
  // On ne télécharge pas automatiquement à la fermeture sur Firefox car
  // beforeunload bloque les téléchargements. On sauvegarde en localStorage
  // comme fallback final et on signale au prochain démarrage.
  localStorage.setItem('budge_unsaved_backup', payload);
  localStorage.setItem('budge_unsaved_backup_name', fileName);
}

// Sauvegarde manuelle — toujours propose le téléchargement si pas de dossier FS
async function saveNowToDisk() {
  const fileName = buildSaveFileName();
  const payload  = buildSavePayload();
  let saved = false;

  if (FS_API_SUPPORTED) {
    let handle = await getSaveDirHandle();
    if (!handle) handle = await chooseSaveFolder();
    if (handle) {
      saved = await writeToDirHandle(handle, payload, fileName);
      if (saved) {
        addToSaveLog(fileName, 'fs');
        showToast('Sauvegardé → ' + fileName + ' ✓', 'success');
        renderHistory();
        return;
      }
    }
  }

  // Firefox ou échec FS → téléchargement
  saved = downloadSaveFile(payload, fileName);
  if (saved) {
    addToSaveLog(fileName, 'download');
    showToast('Fichier téléchargé → ' + fileName + ' ✓', 'success');
    renderHistory();
  } else {
    showToast('Erreur lors de la sauvegarde.', 'danger');
  }
}

// ============================================================
// LOG LOCAL
// ============================================================
function getSaveLog() {
  try { return JSON.parse(localStorage.getItem('budge_save_log') || '[]'); } catch { return []; }
}
function addToSaveLog(fileName, method) {
  const log = getSaveLog().filter(e => e.fileName !== fileName);
  log.unshift({ fileName, savedAt: new Date().toISOString(), method: method || 'fs' });
  if (log.length > 50) log.splice(50);
  localStorage.setItem('budge_save_log', JSON.stringify(log));
}

// ============================================================
// UI
// ============================================================
async function updateSaveFolderUI(handle) {
  const el = document.getElementById('saveFolderName');
  if (!el) return;

  if (!FS_API_SUPPORTED) {
    el.innerHTML = '<span style="color:var(--bgt-warning)">⚠️ Firefox : sauvegarde par téléchargement</span>';
    const hint = document.getElementById('saveFolderHint');
    if (hint) hint.style.display = 'block';
    return;
  }

  if (handle) {
    const ok = await verifyPermission(handle).catch(() => false);
    el.textContent = ok ? '📁 ' + handle.name : '⚠️ Permission requise (cliquez "Choisir le dossier")';
    el.style.color = ok ? 'var(--bgt-success)' : 'var(--bgt-warning)';
  } else {
    el.textContent = 'Non configuré — cliquez "Choisir le dossier"';
    el.style.color = 'var(--bgt-text3)';
  }
}

async function renderHistory() {
  const listEl = document.getElementById('historyList');
  const treeEl = document.getElementById('historyTree');
  if (!listEl) return;

  // Vérifier s'il y a une sauvegarde non envoyée (Firefox fermeture)
  const unsavedName    = localStorage.getItem('budge_unsaved_backup_name');
  const unsavedPayload = localStorage.getItem('budge_unsaved_backup');
  if (unsavedName && unsavedPayload) {
    const notif = document.getElementById('unsavedBackupNotif');
    if (notif) {
      notif.style.display = 'block';
      notif.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-2" style="color:var(--bgt-warning)"></i>'
        + 'Sauvegarde en attente depuis la dernière session : <strong>' + escHtml(unsavedName) + '</strong> '
        + '<button class="btn btn-sm bgt-btn-primary ms-2" onclick="downloadPendingBackup()">Télécharger maintenant</button>';
    }
  }

  const handle = await getSaveDirHandle();
  updateSaveFolderUI(handle);

  const log = getSaveLog();
  if (!log.length) {
    listEl.innerHTML = '<div class="bgt-no-period" style="min-height:140px">'
      + '<div class="bgt-no-period-icon"><i class="fa-solid fa-floppy-disk"></i></div>'
      + '<p class="bgt-no-period-sub">Aucune sauvegarde effectuée.<br>Cliquez <strong>Sauvegarder maintenant</strong>.</p>'
      + '</div>';
    if (treeEl) treeEl.innerHTML = '';
    return;
  }

  const methodIcon = { fs: 'fa-folder', download: 'fa-download' };
  const methodColor = { fs: '#34d399', download: '#60a5fa' };

  listEl.innerHTML = log.map(entry => {
    const dt  = new Date(entry.savedAt);
    const ds  = dt.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'})
              + ' ' + dt.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
    const ic  = methodIcon[entry.method] || 'fa-floppy-disk';
    const cl  = methodColor[entry.method] || '#34d399';
    const badge = entry.method === 'download' ? ' <span style="font-size:.6rem;color:#60a5fa">(téléchargé)</span>' : '';
    return '<div class="bgt-history-entry">'
      + '<div class="bgt-history-icon" style="background:rgba(16,185,129,.15)">'
      + '<i class="fa-solid ' + ic + ' fa-xs" style="color:' + cl + '"></i></div>'
      + '<div class="bgt-history-meta">'
      + '<div class="bgt-history-title">' + escHtml(entry.fileName) + badge + '</div>'
      + '<div class="bgt-history-date">' + ds + '</div>'
      + '</div></div>';
  }).join('');

  if (treeEl) {
    const byYear = {};
    log.forEach(e => {
      const y = e.fileName.match(/budge_(\d{4})_/)?.[1] || new Date(e.savedAt).getFullYear();
      if (!byYear[y]) byYear[y] = [];
      byYear[y].push(e);
    });
    treeEl.innerHTML = Object.entries(byYear).sort((a,b) => b[0]-a[0]).map(([yr, entries]) =>
      '<div class="bgt-history-folder"><i class="fa-solid fa-folder-open me-1" style="color:var(--bgt-warning)"></i><strong>' + yr + '/</strong></div>'
      + entries.map(e => '<div class="bgt-history-folder ms-3" style="font-size:.68rem"><i class="fa-regular fa-file me-1"></i>' + escHtml(e.fileName) + '</div>').join('')
    ).join('') || '<p class="text-muted small">Vide</p>';
  }
}

function downloadPendingBackup() {
  const name    = localStorage.getItem('budge_unsaved_backup_name');
  const payload = localStorage.getItem('budge_unsaved_backup');
  if (!name || !payload) return;
  downloadSaveFile(payload, name);
  addToSaveLog(name, 'download');
  localStorage.removeItem('budge_unsaved_backup');
  localStorage.removeItem('budge_unsaved_backup_name');
  const notif = document.getElementById('unsavedBackupNotif');
  if (notif) notif.style.display = 'none';
  showToast('Sauvegarde téléchargée ✓', 'success');
  renderHistory();
}

function clearHistory() {
  if (!confirm('Vider le log des sauvegardes ? (les fichiers sur disque ne sont pas supprimés)')) return;
  localStorage.removeItem('budge_save_log');
  renderHistory();
  showToast('Log vidé', 'info');
}