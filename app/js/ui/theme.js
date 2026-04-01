'use strict';
/* ============================================================
   BUDGE v4.2 — theme.js
   Gestion du thème / mode (dark, light, zen)
   FIXES v4.2 :
   • Le mode-menu est câblé via addEventListener après DOMContentLoaded
     pour éviter que le ::before zen intercepte les clics inline
   ============================================================ */

function loadMode() {
  currentMode = localStorage.getItem(MODE_KEY) || 'dark';
  applyMode(currentMode, false);
}

function applyMode(mode, doSave = true) {
  currentMode = mode;
  document.body.classList.remove('mode-light','mode-zen');
  if (mode === 'light') {
    document.body.classList.add('mode-light');
    document.documentElement.setAttribute('data-bs-theme','light');
  } else if (mode === 'zen') {
    document.body.classList.add('mode-zen');
    document.documentElement.setAttribute('data-bs-theme','dark');
  } else {
    document.documentElement.setAttribute('data-bs-theme','dark');
  }
  const labels = { dark:'Sombre', light:'Clair', zen:'Détente' };
  const el = document.getElementById('modeLabel');
  if (el) el.textContent = labels[mode] || 'Sombre';
  document.querySelectorAll('.bgt-mode-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.mode === mode);
  });
  if (doSave) localStorage.setItem(MODE_KEY, mode);
  setTimeout(() => { Object.values(charts).forEach(c => c?.resize?.()); }, 80);
}

function closeModeMenu() {
  document.getElementById('modeMenu').classList.remove('show');
}
