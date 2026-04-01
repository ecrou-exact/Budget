'use strict';
/* ============================================================
   BUDGE v4.4 — history.js
   Sauvegarde à 3 niveaux selon l'environnement :

   NIVEAU 1 — Electron (app de bureau)
     window.electronFS disponible → écriture réelle sur disque
     Structure : <userData>/Budge/backups/AAAA/budge_AAAA_Periode.json
     Dossier AAAA créé automatiquement selon l'année de début de période
     Suppression du fichier quand une période est supprimée

   NIVEAU 2 — Chrome/Edge (File System Access API)
     window.showDirectoryPicker disponible → dossier choisi par l'utilisateur
     Même convention de nommage

   NIVEAU 3 — Firefox et autres
     Téléchargement forcé via <a download>
     Backup d'urgence dans localStorage si fermeture sans action
   ============================================================ */

const IS_ELECTRON    = typeof window !== 'undefined' && !!window.electronFS;
const FS_API_SUPPORT = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
const IDB_HANDLE_KEY = 'budge_save_dir_handle';

// ============================================================
// UTILITAIRES COMMUNS
// ============================================================

// Génère le slug de fichier à partir d'une période (ou de la période courante)
function buildPeriodSlug(periodId) {
  const pid  = periodId || currentPeriodId;
  const name = pid ? (getPeriod(pid)?.name || 'Global') : 'Global';
  return name.replace(/[^a-zA-Z0-9\u00C0-\u024F\-_]/g, '_').replace(/_+/g, '_');
}

// Année de DÉBUT de la période (pour classer dans le bon dossier)
function getPeriodYear(periodId) {
  const pid = periodId || currentPeriodId;
  if (!pid) return new Date().getFullYear();
  const p = getPeriod(pid);
  return p?.startDate ? new Date(p.startDate + 'T00:00:00').getFullYear() : new Date().getFullYear();
}

function buildFileName(year, slug) {
  return 'budge_' + year + '_' + slug + '.json';
}

function buildPayload(extraMeta) {
  return JSON.stringify({
    _budgeVersion: '4.4',
    _savedAt:      new Date().toISOString(),
    ...(extraMeta || {}),
    ...appData
  }, null, 2);
}

// ============================================================
// NIVEAU 1 — ELECTRON
// ============================================================
async function electronSave(periodId) {
  if (!IS_ELECTRON) return false;
  const year    = getPeriodYear(periodId);
  const slug    = buildPeriodSlug(periodId);
  const payload = buildPayload({ _fileName: buildFileName(year, slug) });
  const res     = await window.electronFS.save(year, slug, payload);
  if (res.ok) {
    addToSaveLog(res.fileName, 'electron', year, res.filePath);
    return res;
  }
  console.error('[Budge] Electron save error:', res.error);
  return false;
}

async function electronDeleteBackup(periodId, year) {
  if (!IS_ELECTRON) return;
  const slug = buildPeriodSlug(periodId);
  await window.electronFS.delete(year || getPeriodYear(periodId), slug);
}

// ============================================================
// NIVEAU 2 — FILE SYSTEM ACCESS API (Chrome/Edge)
// ============================================================
async function getSaveDirHandle() {
  if (!FS_API_SUPPORT) return null;
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

async function saveDirHandle(handle) {
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
    const p = await handle.queryPermission({ mode: 'readwrite' });
    if (p === 'granted') return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch { return false; }
}

async function fsSave(handle, year, slug, payload) {
  if (!handle) return false;
  const ok = await verifyPermission(handle);
  if (!ok) return false;
  try {
    // Créer/accéder au sous-dossier année si l'API le supporte
    let dir = handle;
    try { dir = await handle.getDirectoryHandle(String(year), { create: true }); } catch {}
    const fileName  = buildFileName(year, slug);
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable   = await fileHandle.createWritable();
    await writable.write(payload);
    await writable.close();
    return fileName;
  } catch(e) {
    console.error('[Budge] FS write error:', e);
    return false;
  }
}

// ============================================================
// NIVEAU 3 — TÉLÉCHARGEMENT (Firefox)
// ============================================================
function downloadFile(payload, fileName) {
  try {
    const blob = new Blob([payload], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    return true;
  } catch(e) { return false; }
}

// ============================================================
// API PUBLIQUE — utilisée par init.js et le bouton "Sauvegarder"
// ============================================================

// Sauvegarde silencieuse à la fermeture
async function saveToDisk(periodId) {
  const pid  = periodId || currentPeriodId;
  const year = getPeriodYear(pid);
  const slug = buildPeriodSlug(pid);

  // Niveau 1 : Electron
  if (IS_ELECTRON) {
    await electronSave(pid);
    return;
  }

  const payload = buildPayload({ _fileName: buildFileName(year, slug) });

  // Niveau 2 : File System API
  if (FS_API_SUPPORT) {
    const handle = await getSaveDirHandle();
    if (handle) {
      const fileName = await fsSave(handle, year, slug, payload);
      if (fileName) { addToSaveLog(fileName, 'fs', year); return; }
    }
  }

  // Niveau 3 : stocker dans localStorage, proposer au prochain démarrage
  const fileName = buildFileName(year, slug);
  localStorage.setItem('budge_unsaved_backup',      payload);
  localStorage.setItem('budge_unsaved_backup_name', fileName);
}

// Sauvegarde manuelle (bouton "Sauvegarder maintenant")
async function saveNowToDisk() {
  const year = getPeriodYear();
  const slug = buildPeriodSlug();

  // Niveau 1 : Electron
  if (IS_ELECTRON) {
    const res = await electronSave();
    if (res && res.ok) {
      showToast('Sauvegardé → ' + res.fileName + ' ✓', 'success');
      renderHistory();
    }
    return;
  }

  const payload  = buildPayload({ _fileName: buildFileName(year, slug) });

  // Niveau 2 : File System API
  if (FS_API_SUPPORT) {
    let handle = await getSaveDirHandle();
    if (!handle) handle = await chooseSaveFolder();
    if (handle) {
      const fileName = await fsSave(handle, year, slug, payload);
      if (fileName) {
        addToSaveLog(fileName, 'fs', year);
        showToast('Sauvegardé → ' + fileName + ' ✓', 'success');
        renderHistory(); return;
      }
    }
  }

  // Niveau 3 : téléchargement
  const fileName = buildFileName(year, slug);
  if (downloadFile(payload, fileName)) {
    addToSaveLog(fileName, 'download', year);
    showToast('Fichier téléchargé → ' + fileName, 'success');
    renderHistory();
  } else {
    showToast('Erreur lors de la sauvegarde.', 'danger');
  }
}

// Choisir le dossier (File System API uniquement)
async function chooseSaveFolder() {
  if (IS_ELECTRON) {
    showToast('En mode app de bureau, le dossier est géré automatiquement.', 'info');
    return null;
  }
  if (!FS_API_SUPPORT) {
    showToast('Firefox : sauvegarde par téléchargement automatique.', 'info');
    updateSaveFolderUI(null);
    return null;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'budge-save' });
    await saveDirHandle(handle);
    updateSaveFolderUI(handle);
    showToast('Dossier défini ✓', 'success');
    return handle;
  } catch(e) {
    if (e.name !== 'AbortError') showToast('Erreur : ' + e.message, 'danger');
    return null;
  }
}

// Suppression du backup quand une période est supprimée
async function deleteBackupForPeriod(period) {
  if (!period) return;
  const year = period.startDate
    ? new Date(period.startDate + 'T00:00:00').getFullYear()
    : new Date().getFullYear();
  const slug = period.name.replace(/[^a-zA-Z0-9\u00C0-\u024F\-_]/g, '_').replace(/_+/g, '_');

  if (IS_ELECTRON) {
    await electronDeleteBackup(period.id, year);
    // Retirer du log
    const log = getSaveLog().filter(e => e.fileName !== buildFileName(year, slug));
    localStorage.setItem('budge_save_log', JSON.stringify(log));
    renderHistory();
    return;
  }
  // Pas possible côté browser de supprimer des fichiers — on retire juste du log
  const log = getSaveLog().filter(e => e.fileName !== buildFileName(year, slug));
  localStorage.setItem('budge_save_log', JSON.stringify(log));
  renderHistory();
}

// ============================================================
// LOG LOCAL
// ============================================================
function getSaveLog() {
  try { return JSON.parse(localStorage.getItem('budge_save_log') || '[]'); } catch { return []; }
}
function addToSaveLog(fileName, method, year, filePath) {
  const log = getSaveLog().filter(e => e.fileName !== fileName);
  log.unshift({ fileName, savedAt: new Date().toISOString(), method: method || 'fs', year, filePath: filePath || null });
  if (log.length > 100) log.splice(100);
  localStorage.setItem('budge_save_log', JSON.stringify(log));
}

// ============================================================
// UI
// ============================================================
async function updateSaveFolderUI(handle) {
  const el   = document.getElementById('saveFolderName');
  const hint = document.getElementById('saveFolderHint');
  if (!el) return;

  if (IS_ELECTRON) {
    const res = await window.electronFS.getPath();
    el.innerHTML = '📁 <span style="font-family:var(--bgt-mono);font-size:.78rem">' + (res.path || 'app/backups') + '</span>';
    el.style.color = 'var(--bgt-success)';
    if (hint) hint.style.display = 'none';
    return;
  }

  if (!FS_API_SUPPORT) {
    el.innerHTML = '<span style="color:var(--bgt-warning)">⚠️ Firefox — sauvegarde par téléchargement</span>';
    if (hint) hint.style.display = 'block';
    return;
  }

  if (handle) {
    const ok = await verifyPermission(handle).catch(() => false);
    el.textContent = ok ? '📁 ' + handle.name : '⚠️ Permission requise';
    el.style.color = ok ? 'var(--bgt-success)' : 'var(--bgt-warning)';
  } else {
    el.textContent = 'Non configuré';
    el.style.color = 'var(--bgt-text3)';
  }
  if (hint) hint.style.display = 'none';
}

async function renderHistory() {
  const listEl = document.getElementById('historyList');
  const treeEl = document.getElementById('historyTree');
  if (!listEl) return;

  // Backup en attente (Firefox, fermeture sans action)
  const unsavedName    = localStorage.getItem('budge_unsaved_backup_name');
  const unsavedPayload = localStorage.getItem('budge_unsaved_backup');
  const notif = document.getElementById('unsavedBackupNotif');
  if (notif) {
    if (unsavedName && unsavedPayload) {
      notif.style.display = 'block';
      notif.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-2" style="color:var(--bgt-warning)"></i>'
        + 'Sauvegarde en attente depuis la dernière session : <strong>' + escHtml(unsavedName) + '</strong> '
        + '<button class="btn btn-sm bgt-btn-primary ms-2" onclick="downloadPendingBackup()">Télécharger maintenant</button>';
    } else {
      notif.style.display = 'none';
    }
  }

  // Mettre à jour l'affichage du chemin
  const handle = FS_API_SUPPORT ? await getSaveDirHandle() : null;
  updateSaveFolderUI(handle);

  // En mode Electron, récupérer la liste réelle depuis le disque
  let log = getSaveLog();
  if (IS_ELECTRON) {
    const res = await window.electronFS.list();
    if (res.ok && res.files.length) {
      // Fusionner la liste disque avec le log local
      res.files.forEach(f => {
        if (!log.find(e => e.fileName === f.fileName)) {
          log.unshift({ fileName: f.fileName, savedAt: f.savedAt, method: 'electron', year: f.year, filePath: f.filePath });
        }
      });
      localStorage.setItem('budge_save_log', JSON.stringify(log.slice(0,100)));
    }
  }

  if (!log.length) {
    listEl.innerHTML = '<div class="bgt-no-period" style="min-height:140px">'
      + '<div class="bgt-no-period-icon"><i class="fa-solid fa-floppy-disk"></i></div>'
      + '<p class="bgt-no-period-sub">Aucune sauvegarde effectuée.<br>Cliquez <strong>Sauvegarder maintenant</strong>.</p>'
      + '</div>';
    if (treeEl) treeEl.innerHTML = '';
    return;
  }

  const methodIcon  = { electron: 'fa-hdd', fs: 'fa-folder', download: 'fa-download' };
  const methodColor = { electron: '#34d399', fs: '#34d399', download: '#60a5fa' };
  const methodLabel = { electron: 'disque', fs: 'dossier', download: 'téléchargé' };

  listEl.innerHTML = log.slice(0, 100).map(entry => {
    const dt  = new Date(entry.savedAt);
    const ds  = dt.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'})
              + ' ' + dt.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});
    const ic  = methodIcon[entry.method]  || 'fa-floppy-disk';
    const cl  = methodColor[entry.method] || '#34d399';
    const lb  = methodLabel[entry.method] || '';
    return '<div class="bgt-history-entry">'
      + '<div class="bgt-history-icon" style="background:' + cl + '18">'
      + '<i class="fa-solid ' + ic + ' fa-xs" style="color:' + cl + '"></i></div>'
      + '<div class="bgt-history-meta" style="flex:1;min-width:0">'
      + '<div class="bgt-history-title" style="word-break:break-all">' + escHtml(entry.fileName)
      + ' <span style="font-size:.6rem;color:' + cl + '">(' + lb + ')</span></div>'
      + '<div class="bgt-history-date">' + ds
      + (entry.filePath ? ' <span style="font-size:.6rem;color:var(--bgt-text3)">' + escHtml(entry.filePath) + '</span>' : '')
      + '</div></div>'
      + (IS_ELECTRON ? '<button class="bgt-btn-icon ms-1" onclick="window.electronFS.openFolder()" title="Ouvrir dossier"><i class="fa-solid fa-folder-open fa-xs"></i></button>' : '')
      + '</div>';
  }).join('');

  // Arborescence
  if (treeEl) {
    const byYear = {};
    log.forEach(e => {
      const y = e.year || e.fileName.match(/budge_(\d{4})_/)?.[1] || new Date(e.savedAt).getFullYear();
      if (!byYear[y]) byYear[y] = [];
      byYear[y].push(e);
    });
    treeEl.innerHTML = Object.entries(byYear).sort((a,b) => b[0]-a[0]).map(([yr, entries]) =>
      '<div class="bgt-history-folder"><i class="fa-solid fa-folder-open me-1" style="color:var(--bgt-warning)"></i><strong>' + yr + '/</strong></div>'
      + entries.map(e =>
          '<div class="bgt-history-folder ms-3" style="font-size:.68rem">'
          + '<i class="fa-regular fa-file-code me-1"></i>' + escHtml(e.fileName) + '</div>'
        ).join('')
    ).join('') || '<p class="text-muted small">Vide</p>';
  }
}

function downloadPendingBackup() {
  const name    = localStorage.getItem('budge_unsaved_backup_name');
  const payload = localStorage.getItem('budge_unsaved_backup');
  if (!name || !payload) return;
  const year = name.match(/budge_(\d{4})_/)?.[1] || new Date().getFullYear();
  downloadFile(payload, name);
  addToSaveLog(name, 'download', parseInt(year));
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
