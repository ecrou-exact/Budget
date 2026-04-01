'use strict';
/* ============================================================
   BUDGE v4.2 — render.js
   Rendu des listes (revenus, dépenses fixes/variables),
   stats, breakdown catégories, état "pas de période"
   ============================================================ */

// ============================================================
// RENDER INCOME — avec badge type coloré
// ============================================================
function renderIncome() {
  const list  = document.getElementById('incomeList');
  const empty = document.getElementById('incomeEmpty');
  const count = document.getElementById('incomeCount');
  const items = currentPeriodId ? getPeriodIncome(currentPeriodId) : [];
  count.textContent = items.length;
  if (!items.length) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';

  const typeIcons = {
    Salaire:'fa-briefcase', Prime:'fa-star', Bonus:'fa-gift', Freelance:'fa-laptop',
    Remboursement:'fa-rotate-left', Allocation:'fa-building-columns', 'Loyer perçu':'fa-house',
    Dividende:'fa-chart-line', Vente:'fa-tag', 'Autre revenu':'fa-coins'
  };
  const typeColors = {
    Salaire:'#10b981', Prime:'#f59e0b', Bonus:'#8b5cf6', Freelance:'#06b6d4',
    Remboursement:'#6366f1', Allocation:'#ec4899', 'Loyer perçu':'#14b8a6',
    Dividende:'#f97316', Vente:'#ef4444', 'Autre revenu':'#818cf8'
  };

  list.innerHTML = items.map(i => {
    const icon  = typeIcons [i.incomeType||'Salaire'] || 'fa-coins';
    const color = typeColors[i.incomeType||'Salaire'] || '#10b981';
    return `<div class="bgt-item-row">
      <div style="width:28px;height:28px;border-radius:50%;background:${color}22;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="fa-solid ${icon} fa-xs" style="color:${color}"></i></div>
      <div class="bgt-item-info">
        <div class="bgt-item-name">${escHtml(i.name)}</div>
        <div class="bgt-item-meta">
          ${i.incomeType ? `<span class="badge" style="background:${color}22;color:${color};border-radius:4px">${i.incomeType}</span>` : ''}
          ${i.recurringId ? '<span class="badge badge-recurring"><i class="fa-solid fa-rotate fa-xs me-1"></i>Récurrent</span>' : ''}
          <span class="text-muted">${formatDateFR(i.date)}</span>
        </div>
      </div>
      <div class="bgt-item-amount income-amt">${formatAmount(i.amount)}</div>
      <div class="bgt-item-actions">
        <button class="bgt-btn-icon" onclick="editItem('${i.id}')" title="Modifier"><i class="fa-solid fa-pen fa-xs"></i></button>
        ${i.recurringId ? `<button class="bgt-btn-icon stop" onclick="stopRecurringItem('${i.recurringId}')" title="Arrêter"><i class="fa-solid fa-ban fa-xs"></i></button>` : ''}
        <button class="bgt-btn-icon danger" onclick="deleteItem('${i.id}')" title="Supprimer"><i class="fa-solid fa-xmark fa-xs"></i></button>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// RENDER FIXED & VARIABLE EXPENSES
// ============================================================
function renderFixedExpenses() {
  const list  = document.getElementById('fixedExpensesList');
  const empty = document.getElementById('fixedEmpty');
  const count = document.getElementById('fixedCount');
  const items = currentPeriodId ? getPeriodExpenses(currentPeriodId).filter(e => e.isFixed) : [];
  count.textContent = items.length;
  if (!items.length) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  list.innerHTML = items.map(e => `
    <div class="bgt-item-row">
      <div class="bgt-item-info">
        <div class="bgt-item-name">${escHtml(e.name)}</div>
        <div class="bgt-item-meta">
          <span class="badge ${e.status==='pending'?'badge-pending':'badge-completed'}">${e.status==='pending'?'À venir':'Payée'}</span>
          <span class="text-muted">${CAT_EMOJI[e.category]||''} ${e.category}</span>
          ${e.recurringId ? '<span class="badge badge-recurring"><i class="fa-solid fa-rotate fa-xs"></i></span>' : ''}
        </div>
      </div>
      <div class="bgt-item-amount">${formatAmount(e.amount)}</div>
      <div class="bgt-item-actions">
        <button class="bgt-btn-icon" onclick="editItem('${e.id}')" title="Modifier"><i class="fa-solid fa-pen fa-xs"></i></button>
        ${e.recurringId ? `<button class="bgt-btn-icon stop" onclick="stopRecurringItem('${e.recurringId}')" title="Arrêter"><i class="fa-solid fa-ban fa-xs"></i></button>` : ''}
        <button class="bgt-btn-icon danger" onclick="deleteItem('${e.id}')" title="Supprimer"><i class="fa-solid fa-xmark fa-xs"></i></button>
      </div>
    </div>`).join('');
}

function renderVariableExpenses() {
  const list  = document.getElementById('variableExpensesList');
  const empty = document.getElementById('variableEmpty');
  const count = document.getElementById('variableCount');
  const items = currentPeriodId
    ? getPeriodExpenses(currentPeriodId).filter(e => !e.isFixed && visibleCategories.has(e.category))
    : [];
  count.textContent = items.length;
  if (!items.length) { list.innerHTML = ''; empty.style.display = 'flex'; return; }
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
// CATEGORY BREAKDOWN & STATS
// ============================================================
function renderCategoryBreakdown() {
  const container = document.getElementById('categoryBreakdown');
  if (!currentPeriodId) { container.innerHTML = ''; return; }
  const expenses = getPeriodExpenses(currentPeriodId).filter(e => visibleCategories.has(e.category));
  const totals   = {};
  expenses.forEach(e => totals[e.category] = (totals[e.category]||0) + e.amount);
  const total = Object.values(totals).reduce((a,b) => a+b, 0);
  if (!total) { container.innerHTML = '<p class="text-muted small mb-0">Aucune dépense</p>'; return; }
  container.innerHTML = Object.entries(totals).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => {
    const pct = (amt / total * 100).toFixed(1);
    return `<div class="bgt-cat-row">
      <div class="bgt-cat-name">${CAT_EMOJI[cat]||''} ${cat}</div>
      <div class="bgt-cat-bar"><div class="bgt-cat-fill" style="width:${pct}%"></div></div>
      <div class="bgt-cat-amt">${formatAmount(amt)}</div>
    </div>`;
  }).join('');
}

function calculateStats(pid) {
  if (!pid) return { totalIncome:0, totalExpenses:0, balance:0, ratio:'0.0' };
  const inc = sumAmount(getPeriodIncome(pid));
  const exp = sumAmount(getPeriodExpenses(pid));
  return { totalIncome:inc, totalExpenses:exp, balance:inc-exp, ratio:inc>0?(exp/inc*100).toFixed(1):'0.0' };
}

function updateStats() {
  const s = calculateStats(currentPeriodId);
  document.getElementById('totalIncome').textContent   = formatAmount(s.totalIncome);
  document.getElementById('totalExpenses').textContent = formatAmount(s.totalExpenses);
  const balEl = document.getElementById('balance');
  balEl.textContent   = formatAmount(s.balance);
  balEl.style.color   = s.balance >= 0 ? 'var(--bgt-success)' : 'var(--bgt-danger)';
  document.getElementById('ratio').textContent = s.ratio + '%';
}

// ============================================================
// NO PERIOD OVERLAY
// ============================================================
function checkNoPeriodState() {
  let overlay = document.getElementById('noPeriodOverlay');
  const grid  = document.querySelector('#dashboard .row');
  if (!currentPeriodId || !appData.periods.length) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id        = 'noPeriodOverlay';
      overlay.className = 'bgt-no-period';
      overlay.innerHTML = `
        <div class="bgt-no-period-icon"><i class="fa-solid fa-calendar-xmark"></i></div>
        <div class="bgt-no-period-title">Aucune période sélectionnée</div>
        <p class="bgt-no-period-sub">Les périodes correspondent à vos cycles de salaire.<br>Créez votre première période avec la date de réception de votre salaire.</p>
        <button class="btn bgt-btn-primary px-4 py-2" onclick="openNewPeriodModal()"><i class="fa-solid fa-plus me-2"></i>Créer ma première période</button>`;
      document.getElementById('dashboard').appendChild(overlay);
    }
    if (grid) grid.style.display = 'none';
  } else {
    if (overlay) overlay.remove();
    if (grid)    grid.style.display = '';
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
  renderProjectsWidget();
  updateExpenseChart();
  updateComparisonChart();
  const period = getPeriod(currentPeriodId);
  if (period) {
    const today = new Date().toISOString().split('T')[0];
    const def   = (period.endDate && today > period.endDate) ? period.startDate : today;
    ['incomeDate','expenseDate'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = def;
    });
  }
}
