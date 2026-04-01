'use strict';
/* ============================================================
   BUDGE v4.2 — transactions.js
   Ajout, édition et suppression de revenus/dépenses
   ============================================================ */

// ============================================================
// RECURRING PROPAGATION
// ============================================================
function propagateRecurringToPeriod(periodId) {
  const sorted  = sortedPeriods();
  const thisIdx = sorted.findIndex(p => p.id === periodId);
  appData.recurring.forEach(rec => {
    const startIdx = sorted.findIndex(p => p.id === rec.startPeriodId);
    if (thisIdx < startIdx) return;
    if (rec.endPeriodId) {
      const ei = sorted.findIndex(p => p.id === rec.endPeriodId);
      if (thisIdx > ei) return;
    }
    if (appData.items.find(i => i.periodId === periodId && i.recurringId === rec.id)) return;
    const period = getPeriod(periodId);
    const item = {
      id: genId(), periodId, type: rec.type, name: rec.name, amount: rec.amount,
      date: period ? period.startDate : new Date().toISOString().split('T')[0],
      isFixed: rec.type === 'expense', isPending: false, status: 'completed',
      recurringId: rec.id, _fromRecurring: true, incomeType: rec.incomeType || null
    };
    if (rec.type === 'expense') { item.category = rec.category||'Autres'; item.subcategory = rec.subcategory||''; }
    appData.items.push(item);
  });
  // Auto-épargne projets (délégué à projects.js)
  propagateProjectsToPeriod(periodId);
  save();
}

// ============================================================
// ADD INCOME — avec type (Salaire, Prime, Bonus…)
// ============================================================
function addIncome() {
  if (!currentPeriodId) { showToast('Créez ou sélectionnez une période.','danger'); openNewPeriodModal(); return; }
  const name      = document.getElementById('incomeName').value.trim();
  const amount    = parseFloat(document.getElementById('incomeAmount').value);
  const date      = document.getElementById('incomeDate').value;
  const recurring = document.getElementById('incomeRecurring').checked;
  const incomeType = document.getElementById('incomeType')?.value || 'Salaire';
  if (!name || !amount || amount <= 0 || !date) { showToast('Remplissez tous les champs requis.','danger'); return; }
  if (!appData.inputHistory.income.includes(name)) appData.inputHistory.income.push(name);
  const item = { id:genId(), periodId:currentPeriodId, type:'income', name, amount, date, incomeType, isFixed:recurring, isPending:false, status:'completed' };
  if (recurring) {
    const rec = { id:genId(), type:'income', name, amount, incomeType, startPeriodId:currentPeriodId, endPeriodId:null };
    appData.recurring.push(rec); item.recurringId = rec.id; item._fromRecurring = true;
  }
  appData.items.push(item); save();
  ['incomeName','incomeAmount','incomeDate'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('incomeRecurring').checked = false;
  document.getElementById('incomeRecurrenceOptions').style.display = 'none';
  updateAllUI(); showToast('Revenu ajouté ✓','success');
}

// ============================================================
// ADD EXPENSE
// ============================================================
function addExpense() {
  if (!currentPeriodId) { showToast('Créez ou sélectionnez une période.','danger'); openNewPeriodModal(); return; }
  const name     = document.getElementById('expenseName').value.trim();
  const amount   = parseFloat(document.getElementById('expenseAmount').value);
  const category = document.getElementById('expenseCategory').value;
  const subcat   = document.getElementById('expenseSubcategory').value;
  const date     = document.getElementById('expenseDate').value;
  const isFixed  = document.getElementById('expenseFixed').checked;
  const isPending = document.getElementById('expensePending').checked;
  const endDate  = document.getElementById('expenseEndDate').value || null;
  if (!name || !amount || amount <= 0 || !date) { showToast('Remplissez tous les champs requis.','danger'); return; }
  if (!appData.inputHistory.expense.includes(name)) appData.inputHistory.expense.push(name);
  const item = { id:genId(), periodId:currentPeriodId, type:'expense', name, amount, category, subcategory:subcat, date, isFixed, isPending, status:isPending?'pending':'completed' };
  if (isFixed) {
    const rec = { id:genId(), type:'expense', name, amount, category, subcategory:subcat, startPeriodId:currentPeriodId, endPeriodId:null };
    if (endDate) { const sp = appData.periods.find(p => p.startDate >= endDate); if (sp) rec.endPeriodId = sp.id; }
    appData.recurring.push(rec); item.recurringId = rec.id; item._fromRecurring = true;
  }
  appData.items.push(item); save();
  ['expenseName','expenseAmount','expenseDate','expenseEndDate'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('expenseFixed').checked   = false;
  document.getElementById('expensePending').checked = false;
  document.getElementById('expenseRecurrenceOptions').style.display = 'none';
  updateAllUI(); showToast('Dépense ajoutée ✓','success');
}

// ============================================================
// DELETE
// ============================================================
function deleteItem(id) {
  const item = appData.items.find(i => i.id === id); if (!item) return;
  if (item.recurringId && !confirm('Supprimer uniquement pour cette période ?')) return;
  appData.items = appData.items.filter(i => i.id !== id);
  save(); updateAllUI(); showToast('Supprimé','info');
}

// ============================================================
// STOP RECURRING — FIX: inclut startPeriodId dans les candidats
// ============================================================
function stopRecurringItem(recId) {
  console.log('stopRecurringItem called with recId:', recId);
  stopRecurringId = recId;
  const rec = appData.recurring.find(r => r.id === recId); if (!rec) return;
  const sorted = sortedPeriods();
  const si = sorted.findIndex(p => p.id === rec.startPeriodId);
  const candidates = sorted.slice(si < 0 ? 0 : si);
  const sel = document.getElementById('stopFromPeriod');
  sel.innerHTML = !candidates.length
    ? '<option value="">Aucune période disponible</option>'
    : candidates.map(p =>
        `<option value="${p.id}" ${p.id===currentPeriodId?'selected':''}>${escHtml(p.name)} (${formatDateFR(p.startDate)})</option>`
      ).join('');
  getBSModal('stopRecurringModal').show();
}

function confirmStopRecurring() {
  const fromId = document.getElementById('stopFromPeriod').value;
  if (!fromId || !stopRecurringId) { getBSModal('stopRecurringModal').hide(); return; }
  const rec = appData.recurring.find(r => r.id === stopRecurringId);
  if (rec) {
    const sorted = sortedPeriods();
    const fi = sorted.findIndex(p => p.id === fromId);
    // On enregistre juste la période d'arrêt — aucune suppression d'items existants
    rec.endPeriodId = fi > 0 ? sorted[fi-1].id : null;
    // Les items déjà générés pour les périodes passées restent intacts
  }
  save(); getBSModal('stopRecurringModal').hide(); updateAllUI();
  showToast('Récurrence arrêtée ✓','success');
}

// Vérifie si un récurrent est encore actif
function isRecurringActive(recId) {
  const rec = appData.recurring.find(r => r.id === recId);
  if (!rec) return false;
  if (!rec.endPeriodId) return true;
  const sorted = sortedPeriods();
  const ei = sorted.findIndex(p => p.id === rec.endPeriodId);
  const ci = sorted.findIndex(p => p.id === currentPeriodId);
  return ci <= ei;
}

// ============================================================
// EDIT ITEM
// ============================================================
let recurringEditScope = 'this';

function editItem(id) {
  const item = appData.items.find(i => i.id === id); if (!item) return;
  editingContext = id;
  document.getElementById('editModalTitle').innerHTML = item.type === 'income'
    ? '<i class="fa-solid fa-pen me-2"></i>Modifier le Revenu'
    : '<i class="fa-solid fa-pen me-2"></i>Modifier la Dépense';
  let html = `
    <div class="mb-3"><label class="bgt-label">Libellé</label>
      <input type="text" id="ei_name" class="form-control bgt-input" value="${escHtml(item.name)}"/></div>
    <div class="mb-3"><label class="bgt-label">Montant (€)</label>
      <input type="number" id="ei_amount" class="form-control bgt-input" value="${item.amount}" step="0.01" min="0"/></div>
    <div class="mb-3"><label class="bgt-label">Date</label>
      <input type="date" id="ei_date" class="form-control bgt-input" value="${item.date}"/></div>`;
  if (item.type === 'income') {
    html += `<div class="mb-3"><label class="bgt-label">Type de revenu</label>
      <select id="ei_incomeType" class="form-select bgt-input">
        ${INCOME_TYPES.map(t => `<option value="${t}" ${t===(item.incomeType||'Salaire')?'selected':''}>${t}</option>`).join('')}
      </select></div>`;
  }
  if (item.type === 'expense') {
    html += `<div class="row g-2 mb-3">
      <div class="col-6"><label class="bgt-label">Catégorie</label>
        <select id="ei_category" class="form-select bgt-input" onchange="updateSubcategories('ei_category','ei_subcategory')">
          ${CATEGORIES.map(c => `<option value="${c}" ${c===item.category?'selected':''}>${CAT_EMOJI[c]||''} ${c}</option>`).join('')}
        </select></div>
      <div class="col-6"><label class="bgt-label">Sous-catégorie</label>
        <select id="ei_subcategory" class="form-select bgt-input">
          ${(SUBCATEGORIES[item.category]||[]).map(s => `<option value="${s}" ${s===item.subcategory?'selected':''}>${s}</option>`).join('')}
        </select></div></div>
    <div class="form-check form-switch mb-3">
      <input class="form-check-input" type="checkbox" id="ei_status" ${item.status==='completed'?'checked':''}/>
      <label class="form-check-label" for="ei_status">Payée</label></div>`;
  }
  if (item.recurringId) {
    html += `<div class="bgt-recurrence-box mb-3">
      <p class="text-muted small mb-2"><i class="fa-solid fa-rotate me-1"></i>Élément récurrent</p>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-sm bgt-btn-secondary" onclick="setRecurringScope('this')">Cette occurrence</button>
        <button class="btn btn-sm bgt-btn-warning" onclick="setRecurringScope('all')">Toutes les futures</button>
      </div></div>`;
  }
  html += `<div class="d-flex gap-2 justify-content-end">
    <button class="btn bgt-btn-secondary" data-bs-dismiss="modal">Annuler</button>
    <button class="btn bgt-btn-primary" onclick="saveEdit()"><i class="fa-solid fa-check me-1"></i>Sauvegarder</button>
  </div>`;
  document.getElementById('editFormContent').innerHTML = html;
  getBSModal('editModal').show();
}

function setRecurringScope(scope) {
  recurringEditScope = scope;
  showToast(scope === 'all' ? 'Toutes les occurrences futures seront modifiées' : 'Seulement cette occurrence','info');
}

function saveEdit() {
  const id   = editingContext;
  const item = appData.items.find(i => i.id === id);
  if (!item) { getBSModal('editModal').hide(); return; }
  item.name   = document.getElementById('ei_name')?.value.trim()         || item.name;
  item.amount = parseFloat(document.getElementById('ei_amount')?.value)  || item.amount;
  item.date   = document.getElementById('ei_date')?.value                || item.date;
  if (item.type === 'income') item.incomeType = document.getElementById('ei_incomeType')?.value || item.incomeType;
  if (item.type === 'expense') {
    item.category    = document.getElementById('ei_category')?.value    || item.category;
    item.subcategory = document.getElementById('ei_subcategory')?.value || item.subcategory;
    item.status      = document.getElementById('ei_status')?.checked ? 'completed' : 'pending';
    item.isPending   = item.status === 'pending';
  }
  if (item.recurringId && recurringEditScope === 'all') {
    const rec = appData.recurring.find(r => r.id === item.recurringId);
    if (rec) {
      rec.name = item.name; rec.amount = item.amount;
      if (item.type === 'expense') { rec.category = item.category; rec.subcategory = item.subcategory; }
    }
    const sorted = sortedPeriods();
    const pi = sorted.findIndex(p => p.id === item.periodId);
    appData.items.forEach(i => {
      if (i.recurringId === item.recurringId && i.id !== id) {
        const ii = sorted.findIndex(p => p.id === i.periodId);
        if (ii >= pi) {
          i.name = item.name; i.amount = item.amount;
          if (i.type === 'expense') { i.category = item.category; i.subcategory = item.subcategory; }
        }
      }
    });
  }
  recurringEditScope = 'this';
  save(); getBSModal('editModal').hide(); updateAllUI(); showToast('Modifié ✓','success');
}
