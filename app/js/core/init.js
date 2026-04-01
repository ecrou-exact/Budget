'use strict';
/* ============================================================
   BUDGE v4.3 — init.js
   • Sauvegarde sur disque uniquement à la fermeture (beforeunload / visibilitychange)
   • Plus de snapshots auto dans localStorage
   ============================================================ */

// Sauvegarde disque à la fermeture de l'app
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveToDisk();
});
window.addEventListener('beforeunload', () => {
  save(); // localStorage toujours à jour
  saveToDisk(); // tentative disque (async, best-effort)
});

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Chargement des données et du thème
  load();
  loadMode();

  // 2. Dates par défaut
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('incomeDate').value  = today;
  document.getElementById('expenseDate').value = today;

  // 3. Sélection automatique de la dernière période
  const sorted = sortedPeriods();
  if (sorted.length && !currentPeriodId) currentPeriodId = sorted[sorted.length-1].id;
  if (currentPeriodId) propagateRecurringToPeriod(currentPeriodId);

  // 4. Layout
  document.body.classList.add('layout-locked');
  restoreLayout();
  initSortable();

  // 5. Rendu initial
  renderPeriodSelector();
  updateSubcategories('expenseCategory','expenseSubcategory');
  updateAllUI();

  // 6. Navigation périodes
  document.getElementById('prevPeriodBtn').addEventListener('click', () => navigatePeriod(-1));
  document.getElementById('nextPeriodBtn').addEventListener('click', () => navigatePeriod(1));

  // 7. Mode switcher (FIX v4.2)
  const switchBtn = document.getElementById('modeSwitchBtn');
  const modeMenu  = document.getElementById('modeMenu');
  switchBtn.addEventListener('click', e => { e.stopPropagation(); modeMenu.classList.toggle('show'); });
  modeMenu.querySelectorAll('.bgt-mode-option').forEach(opt => {
    opt.addEventListener('click', e => { e.stopPropagation(); applyMode(opt.dataset.mode); modeMenu.classList.remove('show'); });
  });
  document.addEventListener('click', () => { modeMenu.classList.remove('show'); }, true);

  // 8. Init UI de l'onglet historique (dossier sauvegarde)
  const handle = await getSaveDirHandle();
  updateSaveFolderUI(handle);
});
