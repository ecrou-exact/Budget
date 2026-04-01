'use strict';
/* ============================================================
   BUDGE v4.4 — electron/preload.js
   Pont sécurisé (contextBridge) entre le process Electron et
   le code JS de l'app (renderer).
   Expose window.electronFS avec les 5 méthodes de backup.
   ============================================================ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronFS', {
  // Sauvegarde un fichier backup
  // year       : number  (ex: 2025)
  // periodSlug : string  (ex: "Mars_2025")
  // payload    : string  (JSON stringify)
  save: (year, periodSlug, payload) =>
    ipcRenderer.invoke('backup:save', { year, periodSlug, payload }),

  // Supprime le fichier backup d'une période
  delete: (year, periodSlug) =>
    ipcRenderer.invoke('backup:delete', { year, periodSlug }),

  // Liste tous les fichiers backup existants
  list: () =>
    ipcRenderer.invoke('backup:list'),

  // Retourne le chemin du dossier backup
  getPath: () =>
    ipcRenderer.invoke('backup:getPath'),

  // Ouvre le dossier backup dans l'explorateur
  openFolder: () =>
    ipcRenderer.invoke('backup:openFolder'),
});
