'use strict';
/* ============================================================
   BUDGE v4.2 — periods.js
   Gestion des périodes salariales (CRUD + navigation)
   ============================================================ */

function openNewPeriodModal() {
  const openP = getOpenPeriod();
  const isEditing = !!window._editingPeriodId;
  if (!isEditing) {
    document.getElementById('periodName').value  = '';
    document.getElementById('periodStart').value = new Date().toISOString().split('T')[0];
    document.getElementById('periodEnd').value   = '';
    document.getElementById('periodModalTitle').innerHTML = '<i class="fa-solid fa-calendar-plus me-2"></i>Nouvelle Période Salariale';
    document.getElementById('periodSaveBtn').textContent  = 'Créer la Période';
  }
  const blocked = document.getElementById('periodBlockedAlert');
  const fields  = document.getElementById('periodFormFields');
  const btn     = document.getElementById('periodSaveBtn');
  if (!isEditing && openP && openP.id !== window._editingPeriodId) {
    blocked.style.display = 'block'; fields.style.display = 'none'; btn.style.display = 'none';
  } else {
    blocked.style.display = 'none'; fields.style.display = 'block'; btn.style.display = 'block';
  }
  getBSModal('selectPeriodModal').hide();
  getBSModal('periodModal').show();
}

function closeCurrentPeriodFirst() {
  const openP = getOpenPeriod(); if (!openP) return;
  window._editingPeriodId = openP.id;
  document.getElementById('periodName').value  = openP.name;
  document.getElementById('periodStart').value = openP.startDate;
  document.getElementById('periodEnd').value   = openP.endDate || '';
  document.getElementById('periodModalTitle').innerHTML = '<i class="fa-solid fa-pen me-2"></i>Clôturer la Période';
  document.getElementById('periodSaveBtn').innerHTML    = '<i class="fa-solid fa-lock me-1"></i>Clôturer';
  document.getElementById('periodBlockedAlert').style.display = 'none';
  document.getElementById('periodFormFields').style.display   = 'block';
  document.getElementById('periodSaveBtn').style.display      = 'block';
}

function createPeriod() {
  const name  = document.getElementById('periodName').value.trim();
  const start = document.getElementById('periodStart').value;
  const end   = document.getElementById('periodEnd').value || null;
  if (!name || !start) { showToast('Renseignez le libellé et la date de début.','danger'); return; }
  if (end && end <= start) { showToast('La date de fin doit être après la date de début.','danger'); return; }
  if (window._editingPeriodId) {
    const p = getPeriod(window._editingPeriodId);
    if (p) { p.name = name; p.startDate = start; p.endDate = end; save(); }
    window._editingPeriodId = null;
    getBSModal('periodModal').hide();
    renderPeriodSelector(); updateAllUI();
    if (document.getElementById('annual').classList.contains('active')) updateAnnualView();
    showToast('Période modifiée ✓','success'); return;
  }
  if (hasOpenPeriod()) { showToast('Clôturez d\'abord la période en cours.','danger'); return; }
  const period = { id:genId(), name, startDate:start, endDate:end };
  appData.periods.push(period); save();
  propagateRecurringToPeriod(period.id);
  currentPeriodId = period.id;
  getBSModal('periodModal').hide();
  renderPeriodSelector(); updateAllUI();
  if (document.getElementById('annual').classList.contains('active')) updateAnnualView();
  showToast(`Période "${name}" créée !`,'success');
}

function openPeriodModal() {
  const periods = sortedPeriods();
  document.getElementById('periodList').innerHTML = !periods.length
    ? '<p class="text-muted text-center py-3">Aucune période créée</p>'
    : periods.map(p => {
        const bal = sumAmount(getPeriodIncome(p.id)) - sumAmount(getPeriodExpenses(p.id));
        const active = p.id === currentPeriodId;
        return `<div class="bgt-period-list-item ${active?'selected':''}" onclick="selectPeriod('${p.id}')">
          <div>
            <div class="bgt-period-list-name">${escHtml(p.name)} ${active?'<i class="fa-solid fa-check text-primary ms-1"></i>':''}</div>
            <div class="bgt-period-list-dates">${shortPeriodDates(p)}</div>
          </div>
          <div class="bgt-period-list-bal" style="color:${bal>=0?'var(--bgt-success)':'var(--bgt-danger)'}">
            ${bal>=0?'+':''}${formatAmount(bal)}</div>
        </div>`;
      }).join('');
  getBSModal('selectPeriodModal').show();
}

function hidePeriodListAndNew() { getBSModal('selectPeriodModal').hide(); setTimeout(() => openNewPeriodModal(), 350); }

function selectPeriod(id) {
  currentPeriodId = id;
  getBSModal('selectPeriodModal').hide();
  renderPeriodSelector();
  goToTab('dashboard');
  updateAllUI();
}

function navigatePeriod(dir) {
  const sorted = sortedPeriods(); if (!sorted.length) return;
  const ni = sorted.findIndex(p => p.id === currentPeriodId) + dir;
  if (ni < 0 || ni >= sorted.length) return;
  currentPeriodId = sorted[ni].id;
  renderPeriodSelector(); updateAllUI();
}

function renderPeriodSelector() {
  const p = getPeriod(currentPeriodId);
  document.getElementById('periodLabel').textContent = p ? p.name : 'Sélectionner';
  document.getElementById('periodDates').textContent = p ? shortPeriodDates(p) : '';
  const sorted = sortedPeriods();
  const idx = sorted.findIndex(x => x.id === currentPeriodId);
  document.getElementById('prevPeriodBtn').disabled = idx <= 0;
  document.getElementById('nextPeriodBtn').disabled = idx >= sorted.length - 1 || idx < 0;
}

function editPeriod(id) {
  const p = getPeriod(id); if (!p) return;
  window._editingPeriodId = id;
  document.getElementById('periodName').value  = p.name;
  document.getElementById('periodStart').value = p.startDate;
  document.getElementById('periodEnd').value   = p.endDate || '';
  document.getElementById('periodModalTitle').innerHTML = '<i class="fa-solid fa-pen me-2"></i>Modifier la Période';
  document.getElementById('periodSaveBtn').innerHTML    = '<i class="fa-solid fa-check me-1"></i>Sauvegarder';
  document.getElementById('periodBlockedAlert').style.display = 'none';
  document.getElementById('periodFormFields').style.display   = 'block';
  document.getElementById('periodSaveBtn').style.display      = 'block';
  getBSModal('periodModal').show();
}

function deletePeriod(id) {
  if (!confirm('Supprimer cette période et toutes ses données ?')) return;
  // Récupérer la période avant suppression pour supprimer son backup
  const periodToDelete = getPeriod(id);
  appData.items   = appData.items.filter(i => i.periodId !== id);
  appData.projects.forEach(proj => {
    if (proj.allocations) delete proj.allocations[id];
    if (proj.paused)      delete proj.paused[id];
  });
  appData.periods = appData.periods.filter(p => p.id !== id);
  if (currentPeriodId === id) {
    const s = sortedPeriods();
    currentPeriodId = s.length ? s[s.length-1].id : null;
  }
  save(); renderPeriodSelector(); updateAllUI();
  if (document.getElementById('annual').classList.contains('active')) updateAnnualView();
  // Supprimer le fichier backup associé
  if (periodToDelete) deleteBackupForPeriod(periodToDelete);
  showToast('Période supprimée','info');
}

// Réinitialisation de la modale période à sa fermeture
document.getElementById('periodModal').addEventListener('hidden.bs.modal', () => {
  window._editingPeriodId = null;
  document.getElementById('periodModalTitle').innerHTML = '<i class="fa-solid fa-calendar-plus me-2"></i>Nouvelle Période Salariale';
  document.getElementById('periodSaveBtn').innerHTML    = '<i class="fa-solid fa-check me-1"></i>Créer la Période';
});
