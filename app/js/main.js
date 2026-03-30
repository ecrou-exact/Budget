'use strict';
/* ============================================================
   BUDGE v3 — main.js
   • Bootstrap 5 modals
   • SortableJS drag & drop (layout lock/unlock)
   • Période ouverte bloque la création d'une nouvelle
   • Filtres catégories corrigés
   • Récurrences propagées
   ============================================================ */

// ---- Constants ----
const STORAGE_KEY     = 'budge_v3';
const LAYOUT_KEY      = 'budge_v3_layout';
const CATEGORIES      = ['Alimentation','Transport','Loisirs','Santé','Abonnements','Utilities','Autres'];
const CAT_FA          = { Alimentation:'fa-apple-whole', Transport:'fa-car', Loisirs:'fa-gamepad', Santé:'fa-heart-pulse', Abonnements:'fa-mobile-screen', Utilities:'fa-bolt', Autres:'fa-box' };
const CAT_EMOJI       = { Alimentation:'🍎', Transport:'🚗', Loisirs:'🎮', Santé:'🏥', Abonnements:'📱', Utilities:'💡', Autres:'📦' };
const SUBCATEGORIES   = {
  'Alimentation': ['Courses','Restaurant','Snacks','Livraison','Repas au travail'],
  'Transport':    ['Essence','Transports en commun','Parking','Réparations', 'Trains', 'Péage'],
  'Loisirs':      ['Cinéma','Jeux','Sorties','Sport', 'Vacances', 'Voyages'],
  'Santé':        ['Pharmacie','Médecin','Dentiste','Optique', 'Psychologue', 'Autres soins','Coiffure', 'Visites medicales'],
  'Abonnements':  ['Streaming','Salle de sport','Internet','Téléphone', 'Logiciels', 'Magazines','Abonnement TV','Locations'],
  'Utilities':    ['Électricité','Eau','Gaz','Chauffage'],
  'Autres':       ['Vêtements','Maison','Divers', 'Impôts', 'Cadeaux', 'Dons', 'Autres']
};
const CHART_COLORS = ['rgba(99,102,241,.85)','rgba(236,72,153,.85)','rgba(245,158,11,.85)','rgba(16,185,129,.85)','rgba(139,92,246,.85)','rgba(59,130,246,.85)','rgba(239,68,68,.85)'];

// ---- State ----
let appData = {
  periods:      [],   // {id, name, startDate, endDate|null}
  items:        [],   // {id, periodId, type, name, amount, date, category?, subcategory?, isFixed, isPending, status, recurringId?, _fromRecurring?}
  recurring:    [],   // {id, type, name, amount, category?, subcategory?, startPeriodId, endPeriodId|null}
  inputHistory: { income:[], expense:[] }
};
let currentPeriodId   = null;
let visibleCategories = new Set(CATEGORIES);   // ALL visible by default
let charts            = {};
let editingContext    = null;
let stopRecurringId   = null;
let layoutLocked      = true;    // locked by default
let sortableInstances = [];

// Bootstrap modal refs (created lazily)
const BSModals = {};
function getBSModal(id) {
  if (!BSModals[id]) BSModals[id] = new bootstrap.Modal(document.getElementById(id));
  return BSModals[id];
}

// ---- Storage ----
function save()  { localStorage.setItem(STORAGE_KEY, JSON.stringify(appData)); }
function load()  {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) appData = JSON.parse(raw);
  } catch(e) { console.error('Load error:', e); }
  appData.periods      = appData.periods      || [];
  appData.items        = appData.items        || [];
  appData.recurring    = appData.recurring    || [];
  appData.inputHistory = appData.inputHistory || { income:[], expense:[] };
  visibleCategories    = new Set(CATEGORIES);  // always reset to all visible on load
}

// ---- Helpers ----
function genId()        { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function getPeriod(id)  { return appData.periods.find(p => p.id === id) || null; }
function sortedPeriods(){ return [...appData.periods].sort((a,b) => new Date(a.startDate)-new Date(b.startDate)); }
function getPeriodItems(pid)    { return appData.items.filter(i => i.periodId === pid); }
function getPeriodIncome(pid)   { return getPeriodItems(pid).filter(i => i.type === 'income'); }
function getPeriodExpenses(pid) { return getPeriodItems(pid).filter(i => i.type === 'expense'); }
function sumAmount(arr) { return arr.reduce((s,i) => s + (parseFloat(i.amount)||0), 0); }
function escHtml(s)     { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function formatDateFR(d) {
  if (!d) return '—';
  return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function shortPeriodDates(p) {
  if (!p) return '';
  return formatDateFR(p.startDate) + ' → ' + (p.endDate ? formatDateFR(p.endDate) : 'En cours');
}
function formatAmount(n) {
  const abs = Math.abs(n);
  const str = abs.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
  return (n < 0 ? '−' : '') + str + ' €';
}

// ---- Period: is there an open (no end date) period? ----
function getOpenPeriod() {
  return appData.periods.find(p => !p.endDate) || null;
}
function hasOpenPeriod() { return !!getOpenPeriod(); }

// ---- Recurring propagation ----
function propagateRecurringToPeriod(periodId) {
  const sorted = sortedPeriods();
  const thisIdx = sorted.findIndex(p => p.id === periodId);
  appData.recurring.forEach(rec => {
    const startIdx = sorted.findIndex(p => p.id === rec.startPeriodId);
    if (thisIdx < startIdx) return;
    if (rec.endPeriodId) {
      const endIdx = sorted.findIndex(p => p.id === rec.endPeriodId);
      if (thisIdx > endIdx) return;
    }
    if (appData.items.find(i => i.periodId === periodId && i.recurringId === rec.id)) return;
    const period = getPeriod(periodId);
    const item = {
      id: genId(), periodId, type: rec.type,
      name: rec.name, amount: rec.amount,
      date: period ? period.startDate : new Date().toISOString().split('T')[0],
      isFixed: rec.type === 'expense', isPending: false, status: 'completed',
      recurringId: rec.id, _fromRecurring: true
    };
    if (rec.type === 'expense') { item.category = rec.category||'Autres'; item.subcategory = rec.subcategory||''; }
    appData.items.push(item);
  });
  save();
}

// ============================================================
// PERIOD MANAGEMENT
// ============================================================

function openNewPeriodModal() {
  const openP = getOpenPeriod();
  // If editing period (not the open one), skip the block
  const isEditing = !!window._editingPeriodId;

  // Reset form
  if (!isEditing) {
    document.getElementById('periodName').value  = '';
    document.getElementById('periodStart').value = new Date().toISOString().split('T')[0];
    document.getElementById('periodEnd').value   = '';
    document.getElementById('periodModalTitle').innerHTML = '<i class="fa-solid fa-calendar-plus me-2"></i>Nouvelle Période Salariale';
    document.getElementById('periodSaveBtn').textContent  = 'Créer la Période';
  }

  const blockedAlert = document.getElementById('periodBlockedAlert');
  const formFields   = document.getElementById('periodFormFields');
  const saveBtn      = document.getElementById('periodSaveBtn');

  // Block if there's an open period (and we're not editing)
  if (!isEditing && openP && openP.id !== window._editingPeriodId) {
    blockedAlert.style.display = 'block';
    formFields.style.display   = 'none';
    saveBtn.style.display      = 'none';
  } else {
    blockedAlert.style.display = 'none';
    formFields.style.display   = 'block';
    saveBtn.style.display      = 'block';
  }

  getBSModal('selectPeriodModal').hide();
  getBSModal('periodModal').show();
}

function closeCurrentPeriodFirst() {
  const openP = getOpenPeriod();
  if (!openP) return;
  // Prefill the edit form for the open period
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

  // Edit mode
  if (window._editingPeriodId) {
    const p = getPeriod(window._editingPeriodId);
    if (p) { p.name = name; p.startDate = start; p.endDate = end; save(); }
    window._editingPeriodId = null;
    getBSModal('periodModal').hide();
    renderPeriodSelector();
    updateAllUI();
    if (document.getElementById('annual').classList.contains('active')) updateAnnualView();
    showToast('Période modifiée ✓','success');
    return;
  }

  // Create mode — double-check no open period
  if (hasOpenPeriod()) {
    showToast('Clôturez d\'abord la période en cours.','danger'); return;
  }

  const period = { id: genId(), name, startDate: start, endDate: end };
  appData.periods.push(period);
  save();
  propagateRecurringToPeriod(period.id);
  currentPeriodId = period.id;
  getBSModal('periodModal').hide();
  renderPeriodSelector();
  updateAllUI();
  if (document.getElementById('annual').classList.contains('active')) updateAnnualView();
  showToast(`Période "${name}" créée !`,'success');
}

function openPeriodModal() {
  const periods = sortedPeriods();
  const container = document.getElementById('periodList');
  if (periods.length === 0) {
    container.innerHTML = '<p class="text-muted text-center py-3">Aucune période créée</p>';
  } else {
    container.innerHTML = periods.map(p => {
      const inc = sumAmount(getPeriodIncome(p.id));
      const exp = sumAmount(getPeriodExpenses(p.id));
      const bal = inc - exp;
      const active = p.id === currentPeriodId;
      return `
      <div class="bgt-period-list-item ${active?'selected':''}" onclick="selectPeriod('${p.id}')">
        <div>
          <div class="bgt-period-list-name">${escHtml(p.name)} ${active?'<i class="fa-solid fa-check text-primary ms-1"></i>':''}</div>
          <div class="bgt-period-list-dates">${shortPeriodDates(p)}</div>
        </div>
        <div class="bgt-period-list-bal" style="color:${bal>=0?'var(--bgt-success)':'var(--bgt-danger)'}">
          ${bal>=0?'+':''}${formatAmount(bal)}
        </div>
      </div>`;
    }).join('');
  }
  getBSModal('selectPeriodModal').show();
}

function hidePeriodListAndNew() {
  getBSModal('selectPeriodModal').hide();
  setTimeout(() => openNewPeriodModal(), 350);
}

function selectPeriod(id) {
  currentPeriodId = id;
  getBSModal('selectPeriodModal').hide();
  renderPeriodSelector();
  updateAllUI();
}

function navigatePeriod(dir) {
  const sorted = sortedPeriods();
  if (!sorted.length) return;
  const idx = sorted.findIndex(p => p.id === currentPeriodId);
  const ni  = idx + dir;
  if (ni < 0 || ni >= sorted.length) return;
  currentPeriodId = sorted[ni].id;
  renderPeriodSelector();
  updateAllUI();
}

function renderPeriodSelector() {
  const p     = getPeriod(currentPeriodId);
  const label = document.getElementById('periodLabel');
  const dates = document.getElementById('periodDates');
  if (p) { label.textContent = p.name; dates.textContent = shortPeriodDates(p); }
  else   { label.textContent = 'Sélectionner'; dates.textContent = ''; }
  const sorted = sortedPeriods();
  const idx = sorted.findIndex(x => x.id === currentPeriodId);
  document.getElementById('prevPeriodBtn').disabled = idx <= 0;
  document.getElementById('nextPeriodBtn').disabled = idx >= sorted.length-1 || idx < 0;
}

function editPeriod(id) {
  const p = getPeriod(id);
  if (!p) return;
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
  appData.items   = appData.items.filter(i => i.periodId !== id);
  appData.periods = appData.periods.filter(p => p.id !== id);
  if (currentPeriodId === id) {
    const s = sortedPeriods();
    currentPeriodId = s.length ? s[s.length-1].id : null;
  }
  save();
  renderPeriodSelector();
  updateAllUI();
  if (document.getElementById('annual').classList.contains('active')) updateAnnualView();
  showToast('Période supprimée','info');
}

// ============================================================
// TABS
// ============================================================
document.querySelectorAll('#mainTabs .nav-link').forEach(btn => {
  btn.addEventListener('click', function() {
    const tab = this.dataset.tab;
    document.querySelectorAll('#mainTabs .nav-link').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById(tab).classList.add('active');
    setTimeout(() => {
      if (tab === 'analytics') updateAnalyticsCharts();
      else if (tab === 'annual') updateAnnualView();
      else if (tab === 'report') generateReport();
      Object.values(charts).forEach(c => c?.resize?.());
    }, 60);
  });
});

// ============================================================
// DRAG & DROP (SortableJS)
// ============================================================
function initSortable() {
  sortableInstances.forEach(s => s.destroy());
  sortableInstances = [];

  const containers = ['dashboardWidgets','sidebarWidgets'];
  containers.forEach(cid => {
    const el = document.getElementById(cid);
    if (!el) return;
    const s = Sortable.create(el, {
      group: 'widgets',
      handle: '.bgt-drag-handle',
      animation: 180,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      disabled: layoutLocked,
      onEnd: saveLayout
    });
    sortableInstances.push(s);
  });
}

function toggleLayoutLock() {
  layoutLocked = !layoutLocked;
  sortableInstances.forEach(s => s.option('disabled', layoutLocked));
  document.body.classList.toggle('layout-locked', layoutLocked);
  const btn  = document.getElementById('layoutLockBtn');
  const icon = document.getElementById('layoutLockIcon');
  if (layoutLocked) {
    btn.classList.remove('unlocked');
    icon.className = 'fa-solid fa-lock';
    showToast('Layout verrouillé','info');
  } else {
    btn.classList.add('unlocked');
    icon.className = 'fa-solid fa-unlock';
    showToast('Drag & drop activé — déplacez vos widgets !','success');
  }
}

function saveLayout() {
  const layout = {};
  ['dashboardWidgets','sidebarWidgets'].forEach(cid => {
    const el = document.getElementById(cid);
    if (!el) return;
    layout[cid] = [...el.children].map(c => c.id);
  });
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

function restoreLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return;
    const layout = JSON.parse(raw);
    Object.entries(layout).forEach(([cid, ids]) => {
      const container = document.getElementById(cid);
      if (!container) return;
      ids.forEach(wid => {
        const el = document.getElementById(wid);
        if (el && el.parentElement !== container) container.appendChild(el);
      });
    });
  } catch(e) { /* ignore */ }
}

// ============================================================
// CATEGORY FILTER (fixed)
// ============================================================
function renderCategoryFilter() {
  const grid = document.getElementById('filterGrid');
  grid.innerHTML = CATEGORIES.map(cat => `
    <span class="bgt-filter-chip ${visibleCategories.has(cat)?'active':''}"
          data-cat="${cat}" onclick="toggleCat('${cat}',this)">
      <i class="fa-solid ${CAT_FA[cat]||'fa-tag'} fa-xs"></i> ${cat}
    </span>
  `).join('');
}

function toggleCat(cat, el) {
  if (visibleCategories.has(cat)) {
    visibleCategories.delete(cat);
    el.classList.remove('active');
  } else {
    visibleCategories.add(cat);
    el.classList.add('active');
  }
  // Refresh dependent sections
  renderVariableExpenses();
  renderCategoryBreakdown();
  updateExpenseChart();
}

function setAllFilters(val) {
  if (val) CATEGORIES.forEach(c => visibleCategories.add(c));
  else     visibleCategories.clear();
  renderCategoryFilter();
  renderVariableExpenses();
  renderCategoryBreakdown();
  updateExpenseChart();
}

// ============================================================
// SUBCATEGORY
// ============================================================
function updateSubcategories(catId, subId, currentVal) {
  const catEl = document.getElementById(catId);
  const subEl = document.getElementById(subId);
  if (!catEl || !subEl) return;
  const subs = SUBCATEGORIES[catEl.value] || [];
  subEl.innerHTML = '<option value="">-- Sous-catégorie --</option>' +
    subs.map(s => `<option value="${s}" ${s===currentVal?'selected':''}>${s}</option>`).join('');
}

// ============================================================
// TOGGLE RECURRENCE
// ============================================================
function toggleIncomeRecurrence() {
  document.getElementById('incomeRecurrenceOptions').style.display =
    document.getElementById('incomeRecurring').checked ? 'block' : 'none';
}
function toggleExpenseRecurrence() {
  document.getElementById('expenseRecurrenceOptions').style.display =
    document.getElementById('expenseFixed').checked ? 'block' : 'none';
}

// ============================================================
// AUTOCOMPLETE SUGGESTIONS
// ============================================================
function showSuggestions(input, type) {
  const listEl = document.getElementById(type==='income' ? 'incomeSuggestions' : 'expenseSuggestions');
  const val = input.value.toLowerCase().trim();
  if (!val) { listEl.classList.remove('active'); return; }
  const hist = appData.inputHistory[type] || [];
  const matches = hist.filter(h => h.toLowerCase().includes(val));
  if (!matches.length) { listEl.classList.remove('active'); return; }
  listEl.innerHTML = matches.slice(0,6).map(s =>
    `<div class="bgt-suggestion-item" onclick="selectSuggestion('${escHtml(s)}','${type}')">${escHtml(s)}</div>`
  ).join('');
  listEl.classList.add('active');
}
function selectSuggestion(val, type) {
  document.getElementById(type==='income' ? 'incomeName' : 'expenseName').value = val;
  document.getElementById(type==='income' ? 'incomeSuggestions' : 'expenseSuggestions').classList.remove('active');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.position-relative'))
    document.querySelectorAll('.bgt-suggestions').forEach(l => l.classList.remove('active'));
});

// ============================================================
// ADD INCOME
// ============================================================
function addIncome() {
  if (!currentPeriodId) { showToast('Créez ou sélectionnez une période.','danger'); openNewPeriodModal(); return; }
  const name      = document.getElementById('incomeName').value.trim();
  const amount    = parseFloat(document.getElementById('incomeAmount').value);
  const date      = document.getElementById('incomeDate').value;
  const recurring = document.getElementById('incomeRecurring').checked;
  const endDate   = document.getElementById('incomeEndDate').value || null;

  if (!name||!amount||amount<=0||!date) { showToast('Remplissez tous les champs requis.','danger'); return; }

  if (!appData.inputHistory.income.includes(name)) { appData.inputHistory.income.push(name); }

  const item = { id:genId(), periodId:currentPeriodId, type:'income', name, amount, date, isFixed:recurring, isPending:false, status:'completed' };

  if (recurring) {
    const rec = { id:genId(), type:'income', name, amount, startPeriodId:currentPeriodId, endPeriodId:null };
    data.recurring.push(rec);  // kept as alias
    item.recurringId = rec.id; item._fromRecurring = true;
  }
  appData.items.push(item);
  save();

  // Reset
  ['incomeName','incomeAmount','incomeDate','incomeEndDate'].forEach(id => document.getElementById(id).value='');
  document.getElementById('incomeRecurring').checked = false;
  document.getElementById('incomeRecurrenceOptions').style.display = 'none';

  updateAllUI();
  showToast('Revenu ajouté ✓','success');
}

// ============================================================
// ADD EXPENSE
// ============================================================
function addExpense() {
  if (!currentPeriodId) { showToast('Créez ou sélectionnez une période.','danger'); openNewPeriodModal(); return; }
  const name      = document.getElementById('expenseName').value.trim();
  const amount    = parseFloat(document.getElementById('expenseAmount').value);
  const category  = document.getElementById('expenseCategory').value;
  const subcat    = document.getElementById('expenseSubcategory').value;
  const date      = document.getElementById('expenseDate').value;
  const isFixed   = document.getElementById('expenseFixed').checked;
  const isPending = document.getElementById('expensePending').checked;
  const endDate   = document.getElementById('expenseEndDate').value || null;

  if (!name||!amount||amount<=0||!date) { showToast('Remplissez tous les champs requis.','danger'); return; }
  if (!appData.inputHistory.expense.includes(name)) { appData.inputHistory.expense.push(name); }

  const item = { id:genId(), periodId:currentPeriodId, type:'expense', name, amount, category, subcategory:subcat, date, isFixed, isPending, status:isPending?'pending':'completed' };

  if (isFixed) {
    const rec = { id:genId(), type:'expense', name, amount, category, subcategory:subcat, startPeriodId:currentPeriodId, endPeriodId:null };
    if (endDate) {
      const sp = appData.periods.find(p => p.startDate >= endDate);
      if (sp) rec.endPeriodId = sp.id;
    }
    appData.recurring.push(rec);
    item.recurringId = rec.id; item._fromRecurring = true;
  }
  appData.items.push(item);
  save();

  ['expenseName','expenseAmount','expenseDate','expenseEndDate'].forEach(id => document.getElementById(id).value='');
  document.getElementById('expenseFixed').checked   = false;
  document.getElementById('expensePending').checked = false;
  document.getElementById('expenseRecurrenceOptions').style.display = 'none';

  updateAllUI();
  showToast('Dépense ajoutée ✓','success');
}

// ============================================================
// DELETE ITEM
// ============================================================
function deleteItem(id) {
  const item = appData.items.find(i => i.id === id);
  if (!item) return;
  if (item.recurringId && !confirm('Supprimer uniquement pour cette période ?')) return;
  appData.items = appData.items.filter(i => i.id !== id);
  save(); updateAllUI();
  showToast('Supprimé','info');
}

// ============================================================
// STOP RECURRING
// ============================================================
function stopRecurringItem(recId) {
  stopRecurringId = recId;
  const rec = appData.recurring.find(r => r.id === recId);
  if (!rec) return;
  const sorted = sortedPeriods();
  const si = sorted.findIndex(p => p.id === rec.startPeriodId);
  const future = sorted.slice(si+1);
  const sel = document.getElementById('stopFromPeriod');
  if (future.length === 0) {
    sel.innerHTML = '<option value="">Aucune période future</option>';
  } else {
    sel.innerHTML = future.map(p => `<option value="${p.id}">${escHtml(p.name)} (${formatDateFR(p.startDate)})</option>`).join('');
  }
  getBSModal('stopRecurringModal').show();
}

function confirmStopRecurring() {
  const fromId = document.getElementById('stopFromPeriod').value;
  if (!fromId || !stopRecurringId) { getBSModal('stopRecurringModal').hide(); return; }
  const rec = appData.recurring.find(r => r.id === stopRecurringId);
  if (rec) {
    const sorted = sortedPeriods();
    const fi = sorted.findIndex(p => p.id === fromId);
    rec.endPeriodId = fi > 0 ? sorted[fi-1].id : null;
    const futureIds = sorted.slice(fi).map(p => p.id);
    appData.items = appData.items.filter(i => !(i.recurringId===stopRecurringId && futureIds.includes(i.periodId)));
  }
  save();
  getBSModal('stopRecurringModal').hide();
  updateAllUI();
  showToast('Récurrence arrêtée ✓','success');
}

// ============================================================
// EDIT ITEM
// ============================================================
function editItem(id) {
  const item = appData.items.find(i => i.id === id);
  if (!item) return;
  editingContext = id;

  document.getElementById('editModalTitle').innerHTML = item.type==='income'
    ? '<i class="fa-solid fa-pen me-2"></i>Modifier le Revenu'
    : '<i class="fa-solid fa-pen me-2"></i>Modifier la Dépense';

  let html = `
    <div class="mb-3">
      <label class="bgt-label">Libellé</label>
      <input type="text" id="ei_name" class="form-control bgt-input" value="${escHtml(item.name)}"/>
    </div>
    <div class="mb-3">
      <label class="bgt-label">Montant (€)</label>
      <input type="number" id="ei_amount" class="form-control bgt-input" value="${item.amount}" step="0.01" min="0"/>
    </div>
    <div class="mb-3">
      <label class="bgt-label">Date</label>
      <input type="date" id="ei_date" class="form-control bgt-input" value="${item.date}"/>
    </div>`;

  if (item.type==='expense') {
    html += `
    <div class="row g-2 mb-3">
      <div class="col-6">
        <label class="bgt-label">Catégorie</label>
        <select id="ei_category" class="form-select bgt-input" onchange="updateSubcategories('ei_category','ei_subcategory')">
          ${CATEGORIES.map(c=>`<option value="${c}" ${c===item.category?'selected':''}>${CAT_EMOJI[c]||''} ${c}</option>`).join('')}
        </select>
      </div>
      <div class="col-6">
        <label class="bgt-label">Sous-catégorie</label>
        <select id="ei_subcategory" class="form-select bgt-input">
          ${(SUBCATEGORIES[item.category]||[]).map(s=>`<option value="${s}" ${s===item.subcategory?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-check form-switch mb-3">
      <input class="form-check-input" type="checkbox" id="ei_status" ${item.status==='completed'?'checked':''}/>
      <label class="form-check-label" for="ei_status">Payée</label>
    </div>`;
  }

  if (item.recurringId) {
    html += `
    <div class="bgt-recurrence-box mb-3">
      <p class="text-muted small mb-2"><i class="fa-solid fa-rotate me-1"></i>Élément récurrent</p>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-sm bgt-btn-secondary" onclick="setRecurringScope('this')">Cette occurrence seulement</button>
        <button class="btn btn-sm bgt-btn-warning" onclick="setRecurringScope('all')">Toutes les occurrences futures</button>
      </div>
    </div>`;
  }

  html += `
    <div class="d-flex gap-2 justify-content-end">
      <button class="btn bgt-btn-secondary" data-bs-dismiss="modal">Annuler</button>
      <button class="btn bgt-btn-primary" onclick="saveEdit()"><i class="fa-solid fa-check me-1"></i>Sauvegarder</button>
    </div>`;

  document.getElementById('editFormContent').innerHTML = html;
  getBSModal('editModal').show();
}

let recurringEditScope = 'this';
function setRecurringScope(scope) { recurringEditScope = scope; showToast(scope==='all'?'Toutes les occurrences futures seront modifiées':'Seulement cette occurrence','info'); }

function saveEdit() {
  const id   = editingContext;
  const item = appData.items.find(i => i.id === id);
  if (!item) { getBSModal('editModal').hide(); return; }

  item.name   = document.getElementById('ei_name')?.value.trim()              || item.name;
  item.amount = parseFloat(document.getElementById('ei_amount')?.value)       || item.amount;
  item.date   = document.getElementById('ei_date')?.value                     || item.date;

  if (item.type==='expense') {
    item.category    = document.getElementById('ei_category')?.value    || item.category;
    item.subcategory = document.getElementById('ei_subcategory')?.value || item.subcategory;
    item.status      = document.getElementById('ei_status')?.checked ? 'completed' : 'pending';
    item.isPending   = item.status==='pending';
  }

  if (item.recurringId && recurringEditScope==='all') {
    const rec = appData.recurring.find(r => r.id===item.recurringId);
    if (rec) { rec.name=item.name; rec.amount=item.amount; if(item.type==='expense'){rec.category=item.category;rec.subcategory=item.subcategory;} }
    const sorted = sortedPeriods();
    const pi = sorted.findIndex(p => p.id===item.periodId);
    appData.items.forEach(i => {
      if (i.recurringId===item.recurringId && i.id!==id) {
        const ii = sorted.findIndex(p => p.id===i.periodId);
        if (ii >= pi) { i.name=item.name; i.amount=item.amount; if(i.type==='expense'){i.category=item.category;i.subcategory=item.subcategory;} }
      }
    });
  }

  recurringEditScope = 'this';
  save();
  getBSModal('editModal').hide();
  updateAllUI();
  showToast('Modifié ✓','success');
}

// ============================================================
// RENDER INCOME
// ============================================================
function renderIncome() {
  const list  = document.getElementById('incomeList');
  const empty = document.getElementById('incomeEmpty');
  const count = document.getElementById('incomeCount');
  const items = currentPeriodId ? getPeriodIncome(currentPeriodId) : [];
  count.textContent = items.length;
  if (!items.length) { list.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display = 'none';
  list.innerHTML = items.map(i => `
    <div class="bgt-item-row">
      <div class="bgt-item-info">
        <div class="bgt-item-name">${escHtml(i.name)}</div>
        <div class="bgt-item-meta">
          ${i.recurringId ? '<span class="badge badge-recurring"><i class="fa-solid fa-rotate fa-xs me-1"></i>Récurrent</span>' : ''}
          <span class="text-muted">${formatDateFR(i.date)}</span>
        </div>
      </div>
      <div class="bgt-item-amount income-amt">${formatAmount(i.amount)}</div>
      <div class="bgt-item-actions">
        <button class="bgt-btn-icon" onclick="editItem('${i.id}')" title="Modifier"><i class="fa-solid fa-pen fa-xs"></i></button>
        ${i.recurringId?`<button class="bgt-btn-icon stop" onclick="stopRecurringItem('${i.recurringId}')" title="Arrêter récurrence"><i class="fa-solid fa-ban fa-xs"></i></button>`:''}
        <button class="bgt-btn-icon danger" onclick="deleteItem('${i.id}')" title="Supprimer"><i class="fa-solid fa-xmark fa-xs"></i></button>
      </div>
    </div>`).join('');
}

// ============================================================
// RENDER FIXED EXPENSES
// ============================================================
function renderFixedExpenses() {
  const list  = document.getElementById('fixedExpensesList');
  const empty = document.getElementById('fixedEmpty');
  const count = document.getElementById('fixedCount');
  const items = currentPeriodId ? getPeriodExpenses(currentPeriodId).filter(e=>e.isFixed) : [];
  count.textContent = items.length;
  if (!items.length) { list.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display = 'none';
  list.innerHTML = items.map(e => `
    <div class="bgt-item-row">
      <div class="bgt-item-info">
        <div class="bgt-item-name">${escHtml(e.name)}</div>
        <div class="bgt-item-meta">
          <span class="badge ${e.status==='pending'?'badge-pending':'badge-completed'}">${e.status==='pending'?'À venir':'Payée'}</span>
          <span class="text-muted">${CAT_EMOJI[e.category]||''} ${e.category}</span>
          ${e.recurringId?'<span class="badge badge-recurring"><i class="fa-solid fa-rotate fa-xs"></i></span>':''}
        </div>
      </div>
      <div class="bgt-item-amount">${formatAmount(e.amount)}</div>
      <div class="bgt-item-actions">
        <button class="bgt-btn-icon" onclick="editItem('${e.id}')" title="Modifier"><i class="fa-solid fa-pen fa-xs"></i></button>
        ${e.recurringId?`<button class="bgt-btn-icon stop" onclick="stopRecurringItem('${e.recurringId}')" title="Arrêter"><i class="fa-solid fa-ban fa-xs"></i></button>`:''}
        <button class="bgt-btn-icon danger" onclick="deleteItem('${e.id}')" title="Supprimer"><i class="fa-solid fa-xmark fa-xs"></i></button>
      </div>
    </div>`).join('');
}

// ============================================================
// RENDER VARIABLE EXPENSES (filter corrigé)
// ============================================================
function renderVariableExpenses() {
  const list  = document.getElementById('variableExpensesList');
  const empty = document.getElementById('variableEmpty');
  const count = document.getElementById('variableCount');
  // Filter: not fixed AND category is in visibleCategories
  const items = currentPeriodId
    ? getPeriodExpenses(currentPeriodId).filter(e => !e.isFixed && visibleCategories.has(e.category))
    : [];
  count.textContent = items.length;
  if (!items.length) { list.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display = 'none';
  list.innerHTML = items.map(e => `
    <div class="bgt-item-row">
      <div class="bgt-item-info">
        <div class="bgt-item-name">${escHtml(e.name)}</div>
        <div class="bgt-item-meta">
          <span class="badge ${e.status==='pending'?'badge-pending':'badge-completed'}">${e.status==='pending'?'À venir':'Payée'}</span>
          <span class="text-muted">${CAT_EMOJI[e.category]||''} ${e.category}${e.subcategory?' › '+e.subcategory:''}</span>
          <span class="text-muted">${formatDateFR(e.date)}</span>
        </div>
      </div>
      <div class="bgt-item-amount">${formatAmount(e.amount)}</div>
      <div class="bgt-item-actions">
        <button class="bgt-btn-icon" onclick="editItem('${e.id}')" title="Modifier"><i class="fa-solid fa-pen fa-xs"></i></button>
        <button class="bgt-btn-icon danger" onclick="deleteItem('${e.id}')" title="Supprimer"><i class="fa-solid fa-xmark fa-xs"></i></button>
      </div>
    </div>`).join('');
}

// ============================================================
// CATEGORY BREAKDOWN
// ============================================================
function renderCategoryBreakdown() {
  const container = document.getElementById('categoryBreakdown');
  if (!currentPeriodId) { container.innerHTML=''; return; }
  const expenses = getPeriodExpenses(currentPeriodId).filter(e => visibleCategories.has(e.category));
  const totals = {};
  expenses.forEach(e => totals[e.category] = (totals[e.category]||0) + e.amount);
  const total = Object.values(totals).reduce((a,b)=>a+b,0);
  if (!total) { container.innerHTML='<p class="text-muted small mb-0">Aucune dépense</p>'; return; }
  container.innerHTML = Object.entries(totals).sort((a,b)=>b[1]-a[1]).map(([cat,amt]) => {
    const pct = (amt/total*100).toFixed(1);
    return `<div class="bgt-cat-row">
      <div class="bgt-cat-name">${CAT_EMOJI[cat]||''} ${cat}</div>
      <div class="bgt-cat-bar"><div class="bgt-cat-fill" style="width:${pct}%"></div></div>
      <div class="bgt-cat-amt">${formatAmount(amt)}</div>
    </div>`;
  }).join('');
}

// ============================================================
// STATS
// ============================================================
function calculateStats(pid) {
  if (!pid) return { totalIncome:0, totalExpenses:0, balance:0, ratio:'0.0' };
  const inc = sumAmount(getPeriodIncome(pid));
  const exp = sumAmount(getPeriodExpenses(pid));
  return { totalIncome:inc, totalExpenses:exp, balance:inc-exp, ratio: inc>0?(exp/inc*100).toFixed(1):'0.0' };
}

function updateStats() {
  const s = calculateStats(currentPeriodId);
  document.getElementById('totalIncome').textContent   = formatAmount(s.totalIncome);
  document.getElementById('totalExpenses').textContent = formatAmount(s.totalExpenses);
  const balEl = document.getElementById('balance');
  balEl.textContent = formatAmount(s.balance);
  balEl.style.color = s.balance >= 0 ? 'var(--bgt-success)' : 'var(--bgt-danger)';
  document.getElementById('ratio').textContent = s.ratio + '%';
}

// ============================================================
// NO-PERIOD STATE
// ============================================================
function checkNoPeriodState() {
  let overlay = document.getElementById('noPeriodOverlay');
  const grid  = document.querySelector('#dashboard .row');
  if (!currentPeriodId || !appData.periods.length) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'noPeriodOverlay';
      overlay.className = 'bgt-no-period';
      overlay.innerHTML = `
        <div class="bgt-no-period-icon"><i class="fa-solid fa-calendar-xmark"></i></div>
        <div class="bgt-no-period-title">Aucune période sélectionnée</div>
        <p class="bgt-no-period-sub">Les périodes correspondent à vos cycles de salaire.<br>
          Créez votre première période avec la date de réception de votre salaire.</p>
        <button class="btn bgt-btn-primary px-4 py-2" onclick="openNewPeriodModal()">
          <i class="fa-solid fa-plus me-2"></i>Créer ma première période
        </button>`;
      document.getElementById('dashboard').appendChild(overlay);
    }
    if (grid) grid.style.display = 'none';
  } else {
    if (overlay) overlay.remove();
    if (grid) grid.style.display = '';
  }
}

// ============================================================
// MAIN UPDATE
// ============================================================
function updateAllUI() {
  checkNoPeriodState();
  if (!currentPeriodId) return;
  updateStats();
  renderIncome();
  renderFixedExpenses();
  renderCategoryFilter();
  renderVariableExpenses();
  renderCategoryBreakdown();
  updateExpenseChart();
  updateComparisonChart();
  // Default dates
  const period = getPeriod(currentPeriodId);
  if (period) {
    const today = new Date().toISOString().split('T')[0];
    const def   = (period.endDate && today > period.endDate) ? period.startDate : today;
    ['incomeDate','expenseDate'].forEach(id => { const el=document.getElementById(id); if(el&&!el.value) el.value=def; });
  }
}

// ============================================================
// CHARTS
// ============================================================
const chartOpts = () => ({
  responsive:true, maintainAspectRatio:false,
  plugins:{ legend:{ labels:{ color:'#8d96a0', font:{ family:"'DM Sans',sans-serif", size:11 } } } }
});
const axisOpts = () => ({
  ticks:{ color:'#656d76', font:{ family:"'DM Mono',monospace", size:10 } },
  grid:{ color:'rgba(255,255,255,0.04)' }
});
function dc(key) { if(charts[key]){ charts[key].destroy(); delete charts[key]; } }

function updateExpenseChart() {
  if (!currentPeriodId) return;
  const totals = {};
  getPeriodExpenses(currentPeriodId).filter(e=>visibleCategories.has(e.category)).forEach(e => totals[e.category]=(totals[e.category]||0)+e.amount);
  dc('expense');
  if (!Object.keys(totals).length) return;
  charts.expense = new Chart(document.getElementById('expenseChart').getContext('2d'), {
    type:'doughnut',
    data:{ labels:Object.keys(totals), datasets:[{ data:Object.values(totals), backgroundColor:CHART_COLORS, borderColor:'#161b22', borderWidth:2 }] },
    options:{ ...chartOpts(), cutout:'65%', plugins:{ ...chartOpts().plugins, legend:{...chartOpts().plugins.legend,position:'bottom'} } }
  });
}

function updateComparisonChart() {
  const s = calculateStats(currentPeriodId);
  dc('comparison');
  charts.comparison = new Chart(document.getElementById('comparisonChart').getContext('2d'), {
    type:'bar',
    data:{ labels:['Revenus','Dépenses','Solde'], datasets:[{ data:[s.totalIncome,s.totalExpenses,s.balance],
      backgroundColor:['rgba(16,185,129,.7)','rgba(239,68,68,.7)',s.balance>=0?'rgba(6,182,212,.7)':'rgba(239,68,68,.5)'],
      borderColor:['#10b981','#ef4444',s.balance>=0?'#06b6d4':'#ef4444'], borderWidth:2, borderRadius:6 }] },
    options:{ ...chartOpts(), plugins:{legend:{display:false}}, scales:{y:{...axisOpts(),beginAtZero:true},x:axisOpts()} }
  });
}

function updateAnalyticsCharts() {
  const periods = sortedPeriods();
  if (!periods.length) return;
  // Trend
  dc('trend');
  charts.trend = new Chart(document.getElementById('trendChart').getContext('2d'), {
    type:'line',
    data:{ labels:periods.map(p=>p.name), datasets:[
      { label:'Revenus',  data:periods.map(p=>sumAmount(getPeriodIncome(p.id))),   borderColor:'#10b981',backgroundColor:'rgba(16,185,129,.1)',tension:.4,fill:true,pointRadius:4 },
      { label:'Dépenses', data:periods.map(p=>sumAmount(getPeriodExpenses(p.id))), borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,.1)', tension:.4,fill:true,pointRadius:4 }
    ]},
    options:{ ...chartOpts(), scales:{y:{...axisOpts(),beginAtZero:true},x:axisOpts()} }
  });
  // Stacked
  dc('stacked');
  const catData = {};
  CATEGORIES.forEach(c => catData[c] = new Array(periods.length).fill(0));
  periods.forEach((p,idx) => getPeriodExpenses(p.id).forEach(e => { if(catData[e.category]) catData[e.category][idx]+=e.amount; }));
  charts.stacked = new Chart(document.getElementById('categoryStackedChart').getContext('2d'), {
    type:'bar',
    data:{ labels:periods.map(p=>p.name), datasets:Object.entries(catData).filter(([,d])=>d.some(v=>v>0)).map(([cat,d],i)=>({ label:cat,data:d,backgroundColor:CHART_COLORS[i%CHART_COLORS.length] })) },
    options:{ ...chartOpts(), scales:{x:{...axisOpts(),stacked:true},y:{...axisOpts(),stacked:true,beginAtZero:true}} }
  });
  // Analytics table
  const stats = {};
  periods.forEach(p => getPeriodExpenses(p.id).forEach(e => {
    if (!stats[e.category]) stats[e.category]={total:0,count:0};
    stats[e.category].total+=e.amount; stats[e.category].count++;
  }));
  const n = periods.length||1;
  document.getElementById('analyticsTable').innerHTML = Object.entries(stats).sort((a,b)=>b[1].total-a[1].total)
    .map(([cat,s])=>`<tr><td><strong>${CAT_EMOJI[cat]||''} ${cat}</strong></td><td>${formatAmount(s.total)}</td><td>${formatAmount(s.total/n)}</td></tr>`).join('')
    || '<tr><td colspan="3" class="text-center text-muted">Aucune donnée</td></tr>';
  // Savings
  dc('savings');
  const savings = periods.map(p=>sumAmount(getPeriodIncome(p.id))-sumAmount(getPeriodExpenses(p.id)));
  charts.savings = new Chart(document.getElementById('savingsChart').getContext('2d'), {
    type:'bar',
    data:{ labels:periods.map(p=>p.name), datasets:[{ label:'Épargne',data:savings,
      backgroundColor:savings.map(v=>v>=0?'rgba(16,185,129,.7)':'rgba(239,68,68,.7)'),
      borderColor:savings.map(v=>v>=0?'#10b981':'#ef4444'),borderWidth:2,borderRadius:6 }] },
    options:{ ...chartOpts(), plugins:{legend:{display:false}}, scales:{y:{...axisOpts(),beginAtZero:false},x:axisOpts()} }
  });
}

// ============================================================
// ANNUAL VIEW
// ============================================================
function updateAnnualView() {
  renderPeriodsGrid();
  // Annual line chart
  dc('annual');
  const periods = sortedPeriods();
  if (!periods.length) return;
  charts.annual = new Chart(document.getElementById('annualChart').getContext('2d'), {
    type:'line',
    data:{ labels:periods.map(p=>p.name), datasets:[
      { label:'Revenus',  data:periods.map(p=>sumAmount(getPeriodIncome(p.id))),   borderColor:'#10b981',backgroundColor:'rgba(16,185,129,.05)',tension:.4,fill:true },
      { label:'Dépenses', data:periods.map(p=>sumAmount(getPeriodExpenses(p.id))), borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,.05)', tension:.4,fill:true }
    ]},
    options:{ ...chartOpts(), scales:{y:{...axisOpts(),beginAtZero:true},x:axisOpts()} }
  });
  // Summary
  let ti=0,te=0;
  periods.forEach(p=>{ti+=sumAmount(getPeriodIncome(p.id));te+=sumAmount(getPeriodExpenses(p.id));});
  const n=periods.length||1;
  document.getElementById('annualSummary').innerHTML=`
    <tr><td><strong>Nombre de périodes</strong></td><td class="text-end fw-bold">${periods.length}</td></tr>
    <tr><td><strong>Revenus Totaux</strong></td><td class="text-end fw-bold" style="color:var(--bgt-success)">${formatAmount(ti)}</td></tr>
    <tr><td><strong>Dépenses Totales</strong></td><td class="text-end fw-bold" style="color:var(--bgt-danger)">${formatAmount(te)}</td></tr>
    <tr><td><strong>Épargne Totale</strong></td><td class="text-end fw-bold" style="color:${ti-te>=0?'var(--bgt-success)':'var(--bgt-danger)'}">${formatAmount(ti-te)}</td></tr>
    <tr><td><strong>Moy. Revenus / Période</strong></td><td class="text-end">${formatAmount(ti/n)}</td></tr>
    <tr><td><strong>Moy. Dépenses / Période</strong></td><td class="text-end">${formatAmount(te/n)}</td></tr>`;
}

function renderPeriodsGrid() {
  const container = document.getElementById('periodsGrid');
  const periods   = sortedPeriods();
  if (!periods.length) {
    container.innerHTML=`<div class="col-12"><div class="bgt-no-period" style="min-height:220px">
      <div class="bgt-no-period-icon"><i class="fa-solid fa-calendar-xmark"></i></div>
      <p class="bgt-no-period-sub">Aucune période créée</p>
      <button class="btn bgt-btn-primary" onclick="openNewPeriodModal()"><i class="fa-solid fa-plus me-1"></i>Créer une période</button>
    </div></div>`; return;
  }
  container.innerHTML = periods.map(p => {
    const inc = sumAmount(getPeriodIncome(p.id));
    const exp = sumAmount(getPeriodExpenses(p.id));
    const bal = inc - exp;
    const isA = p.id === currentPeriodId;
    const openTag = !p.endDate ? '<span class="badge badge-pending ms-1">En cours</span>' : '';
    return `<div class="col-sm-6 col-md-4 col-lg-3">
      <div class="bgt-period-card ${isA?'active-period':''}">
        <div class="bgt-period-card-name">${escHtml(p.name)} ${openTag} ${isA?'<i class="fa-solid fa-circle-dot text-primary fa-xs"></i>':''}</div>
        <div class="bgt-period-card-dates">${shortPeriodDates(p)}</div>
        <div class="bgt-period-stat"><span class="text-muted">Revenus</span><span style="color:var(--bgt-success);font-family:var(--bgt-mono)">${formatAmount(inc)}</span></div>
        <div class="bgt-period-stat"><span class="text-muted">Dépenses</span><span style="color:var(--bgt-danger);font-family:var(--bgt-mono)">${formatAmount(exp)}</span></div>
        <div class="bgt-period-balance" style="color:${bal>=0?'var(--bgt-success)':'var(--bgt-danger)'}">
          ${bal>=0?'+':''}${formatAmount(bal)}
        </div>
        <div class="bgt-period-actions">
          <button class="bgt-period-btn" onclick="selectPeriod('${p.id}')"><i class="fa-solid fa-eye fa-xs me-1"></i>Voir</button>
          <button class="bgt-period-btn" onclick="editPeriod('${p.id}')"><i class="fa-solid fa-pen fa-xs me-1"></i>Modifier</button>
          <button class="bgt-period-btn" style="color:var(--bgt-danger)" onclick="deletePeriod('${p.id}')"><i class="fa-solid fa-trash fa-xs me-1"></i>Suppr.</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// REPORT
// ============================================================
function generateReport() {
  if (!currentPeriodId) { document.getElementById('reportContent').innerHTML='<p class="text-muted">Sélectionnez une période.</p>'; return; }
  const period   = getPeriod(currentPeriodId);
  const income   = getPeriodIncome(currentPeriodId);
  const expenses = getPeriodExpenses(currentPeriodId);
  const s        = calculateStats(currentPeriodId);
  const catTotals = {};
  expenses.forEach(e => catTotals[e.category]=(catTotals[e.category]||0)+e.amount);
  const sortedCats = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]);

  document.getElementById('reportContent').innerHTML = `
    <h4 class="fw-bold mb-1">${escHtml(period.name)}</h4>
    <p class="text-muted small mb-4">${shortPeriodDates(period)}</p>
    <div class="bgt-report-kpi-grid">
      <div class="bgt-report-kpi" style="background:rgba(16,185,129,.08);border-color:var(--bgt-success)">
        <div class="bgt-report-kpi-label">Revenus</div>
        <div class="bgt-report-kpi-val text-success">${formatAmount(s.totalIncome)}</div>
      </div>
      <div class="bgt-report-kpi" style="background:rgba(239,68,68,.08);border-color:var(--bgt-danger)">
        <div class="bgt-report-kpi-label">Dépenses</div>
        <div class="bgt-report-kpi-val text-danger">${formatAmount(s.totalExpenses)}</div>
      </div>
      <div class="bgt-report-kpi" style="background:rgba(6,182,212,.08);border-color:var(--bgt-info)">
        <div class="bgt-report-kpi-label">Solde</div>
        <div class="bgt-report-kpi-val" style="color:${s.balance>=0?'var(--bgt-success)':'var(--bgt-danger)'}">${formatAmount(s.balance)}</div>
      </div>
    </div>
    <h6 class="bgt-report-h2">Revenus</h6>
    <table class="table bgt-table">
      <thead><tr><th>Libellé</th><th>Montant</th><th>Date</th><th>Type</th></tr></thead>
      <tbody>${income.map(i=>`<tr><td><strong>${escHtml(i.name)}</strong></td><td class="text-success">${formatAmount(i.amount)}</td><td>${formatDateFR(i.date)}</td><td>${i.recurringId?'🔄 Récurrent':'Ponctuel'}</td></tr>`).join('')||'<tr><td colspan="4" class="text-center text-muted">Aucun revenu</td></tr>'}</tbody>
    </table>
    <h6 class="bgt-report-h2">Dépenses par Catégorie</h6>
    <table class="table bgt-table">
      <thead><tr><th>Catégorie</th><th>Total</th><th>%</th></tr></thead>
      <tbody>${sortedCats.map(([cat,amt])=>`<tr><td><strong>${CAT_EMOJI[cat]||''} ${cat}</strong></td><td>${formatAmount(amt)}</td><td>${s.totalExpenses>0?(amt/s.totalExpenses*100).toFixed(1):0}%</td></tr>`).join('')||'<tr><td colspan="3" class="text-center text-muted">Aucune dépense</td></tr>'}</tbody>
    </table>
    <h6 class="bgt-report-h2">Toutes les Dépenses</h6>
    <table class="table bgt-table">
      <thead><tr><th>Libellé</th><th>Montant</th><th>Catégorie</th><th>Date</th><th>Statut</th></tr></thead>
      <tbody>${expenses.map(e=>`<tr><td><strong>${escHtml(e.name)}</strong></td><td>${formatAmount(e.amount)}</td><td>${CAT_EMOJI[e.category]||''} ${e.category}${e.subcategory?' › '+e.subcategory:''}</td><td>${formatDateFR(e.date)}</td><td>${e.status==='completed'?'<span class="text-success">✓ Payée</span>':'<span class="text-warning">⏳ À venir</span>'}</td></tr>`).join('')||'<tr><td colspan="5" class="text-center text-muted">Aucune dépense</td></tr>'}</tbody>
    </table>`;
}

function generatePDFReport() {
  generateReport();
  const el = document.getElementById('reportContent');
  if (typeof html2pdf==='undefined') { showToast('html2pdf non disponible','danger'); return; }
  html2pdf().set({ margin:10, filename:`rapport-${currentPeriodId||'export'}.pdf`, image:{type:'jpeg',quality:.98}, html2canvas:{scale:2}, jsPDF:{orientation:'portrait',unit:'mm',format:'a4'} }).from(el).save();
}

// ============================================================
// EXPORT / IMPORT
// ============================================================
function exportPeriodData() {
  if (!currentPeriodId) { showToast('Sélectionnez une période.','danger'); return; }
  const period = getPeriod(currentPeriodId);
  const blob = new Blob([JSON.stringify({ period, income:getPeriodIncome(currentPeriodId), expenses:getPeriodExpenses(currentPeriodId), exported:new Date().toISOString() },null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `budget-${period.name.replace(/\s+/g,'-')}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  showToast('Export terminé ✓','success');
}
function openImportModal() { getBSModal('importModal').show(); }
function previewImportData(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      document.getElementById('importPreview').innerHTML=`<div class="alert bgt-alert-info mt-2">Aperçu : <strong>${d.period?.name||'?'}</strong> — ${d.income?.length||0} revenus, ${d.expenses?.length||0} dépenses</div>`;
    } catch { document.getElementById('importPreview').innerHTML='<p class="text-danger mt-2">Fichier invalide</p>'; }
  };
  r.readAsText(file);
}
function confirmImport() {
  const file = document.getElementById('importFile').files[0];
  if (!file) { showToast('Sélectionnez un fichier.','danger'); return; }
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if (d.period && !appData.periods.find(p=>p.id===d.period.id)) appData.periods.push(d.period);
      if (d.period) currentPeriodId = d.period.id;
      (d.income||[]).forEach(i => { if(!appData.items.find(x=>x.id===i.id)) appData.items.push({...i,periodId:d.period?.id||currentPeriodId}); });
      (d.expenses||[]).forEach(e => { if(!appData.items.find(x=>x.id===e.id)) appData.items.push({...e,periodId:d.period?.id||currentPeriodId}); });
      save(); getBSModal('importModal').hide(); renderPeriodSelector(); updateAllUI();
      showToast('Import réussi ✓','success');
    } catch { showToast('Erreur d\'importation','danger'); }
  };
  r.readAsText(file);
}
function handleFileUpload(e) {
  const file = e.target.files[0]; if (!file||!currentPeriodId) { showToast('Créez une période d\'abord.','danger'); return; }
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d = file.name.endsWith('.json') ? JSON.parse(ev.target.result) : parseCSV(ev.target.result);
      (d.income||[]).forEach(i => appData.items.push({...i,id:genId(),periodId:currentPeriodId,type:'income'}));
      (d.expenses||[]).forEach(e => appData.items.push({...e,id:genId(),periodId:currentPeriodId,type:'expense',status:e.status||'completed'}));
      save(); updateAllUI(); showToast('Fichier importé ✓','success');
    } catch { showToast('Fichier invalide','danger'); }
  };
  r.readAsText(file);
}
function parseCSV(content) {
  const d = {income:[],expenses:[]};
  content.split('\n').forEach(line => {
    if (!line.trim()) return;
    const [name,amount,date,category] = line.split('|').map(s=>s.trim());
    if (!name||!amount) return;
    if (!category||category.toLowerCase()==='revenu') d.income.push({name,amount:parseFloat(amount),date});
    else d.expenses.push({name,amount:parseFloat(amount),date,category,isFixed:false,status:'completed'});
  });
  return d;
}

// ============================================================
// TOAST (Bootstrap)
// ============================================================
function showToast(msg, type='info') {
  const toastEl = document.getElementById('liveToast');
  const body    = document.getElementById('toastBody');
  toastEl.className = `toast align-items-center border-0 text-white bg-${type==='danger'?'danger':type==='success'?'success':type==='warning'?'warning':'info'}`;
  body.textContent = msg;
  bootstrap.Toast.getOrCreateInstance(toastEl,{delay:3000}).show();
}

// ============================================================
// PERIOD MODAL close handler — reset editing state
// ============================================================
document.getElementById('periodModal').addEventListener('hidden.bs.modal', () => {
  window._editingPeriodId = null;
  document.getElementById('periodModalTitle').innerHTML = '<i class="fa-solid fa-calendar-plus me-2"></i>Nouvelle Période Salariale';
  document.getElementById('periodSaveBtn').innerHTML    = '<i class="fa-solid fa-check me-1"></i>Créer la Période';
});

// ============================================================
// INIT
// ============================================================
// Alias for backward compatibility (addIncome references data.recurring)
const data = appData;

document.addEventListener('DOMContentLoaded', () => {
  load();

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('incomeDate').value  = today;
  document.getElementById('expenseDate').value = today;

  // Set most recent period
  const sorted = sortedPeriods();
  if (sorted.length && !currentPeriodId) currentPeriodId = sorted[sorted.length-1].id;
  if (currentPeriodId) propagateRecurringToPeriod(currentPeriodId);

  // Layout
  document.body.classList.add('layout-locked');
  restoreLayout();
  initSortable();

  renderPeriodSelector();
  updateSubcategories('expenseCategory','expenseSubcategory');
  updateAllUI();

  // Nav buttons
  document.getElementById('prevPeriodBtn').addEventListener('click', () => navigatePeriod(-1));
  document.getElementById('nextPeriodBtn').addEventListener('click', () => navigatePeriod(1));
});