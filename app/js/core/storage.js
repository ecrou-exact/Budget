'use strict';
/* ============================================================
   BUDGE v4.3 — storage.js
   Sauvegarde des données :
   • save()  → localStorage uniquement (données de travail)
   • load()  → lecture localStorage
   • La sauvegarde sur DISQUE est gérée dans history.js (saveToDisk)
   ============================================================ */

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const p = JSON.parse(raw); Object.assign(appData, p); }
  } catch(e) { console.error('Load error:', e); }
  appData.periods      = appData.periods      || [];
  appData.items        = appData.items        || [];
  appData.recurring    = appData.recurring    || [];
  appData.projects     = appData.projects     || [];
  appData.inputHistory = appData.inputHistory || { income:[], expense:[] };
  visibleCategories    = new Set(CATEGORIES);
}
