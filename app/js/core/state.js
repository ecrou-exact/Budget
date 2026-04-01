'use strict';
/* ============================================================
   BUDGE v4.2 — state.js
   État global de l'application
   ============================================================ */

let appData = { periods:[], items:[], recurring:[], projects:[], inputHistory:{income:[],expense:[]} };
let currentPeriodId   = null;
let visibleCategories = new Set(CATEGORIES);
let charts            = {};
let editingContext    = null;
let stopRecurringId   = null;
let layoutLocked      = true;
let sortableInstances = [];
let editingProjectId  = null;
let selectedProjColor = '#4f46e5';
let selectedProjIcon  = 'fa-folder';
let currentMode       = 'dark';

// Cache des modales Bootstrap
const BSModals = {};
function getBSModal(id) {
  if (!BSModals[id]) BSModals[id] = new bootstrap.Modal(document.getElementById(id));
  return BSModals[id];
}

// Alias de rétrocompatibilité
const data = appData;
