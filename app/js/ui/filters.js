'use strict';
/* ============================================================
   BUDGE v4.2 — filters.js
   Filtre par catégorie + autocomplète des champs de saisie
   ============================================================ */

// ---- Filtre catégories ----
function renderCategoryFilter() {
  document.getElementById('filterGrid').innerHTML = CATEGORIES.map(cat =>
    `<span class="bgt-filter-chip ${visibleCategories.has(cat)?'active':''}" onclick="toggleCat('${cat}',this)">
      <i class="fa-solid ${CAT_FA[cat]||'fa-tag'} fa-xs"></i> ${cat}
    </span>`
  ).join('');
}

function toggleCat(cat, el) {
  if (visibleCategories.has(cat)) { visibleCategories.delete(cat); el.classList.remove('active'); }
  else { visibleCategories.add(cat); el.classList.add('active'); }
  renderVariableExpenses(); renderCategoryBreakdown(); updateExpenseChart();
}

function setAllFilters(val) {
  if (val) CATEGORIES.forEach(c => visibleCategories.add(c));
  else visibleCategories.clear();
  renderCategoryFilter(); renderVariableExpenses(); renderCategoryBreakdown(); updateExpenseChart();
}

// ---- Sous-catégories ----
function updateSubcategories(catId, subId, currentVal) {
  const catEl = document.getElementById(catId);
  const subEl = document.getElementById(subId);
  if (!catEl || !subEl) return;
  const subs = SUBCATEGORIES[catEl.value] || [];
  subEl.innerHTML = '<option value="">-- Sous-catégorie --</option>'
    + subs.map(s => `<option value="${s}" ${s===currentVal?'selected':''}>${s}</option>`).join('');
}

function toggleIncomeRecurrence() {
  document.getElementById('incomeRecurrenceOptions').style.display =
    document.getElementById('incomeRecurring').checked ? 'block' : 'none';
}

function toggleExpenseRecurrence() {
  document.getElementById('expenseRecurrenceOptions').style.display =
    document.getElementById('expenseFixed').checked ? 'block' : 'none';
}

// ---- Autocomplete ----
function showSuggestions(input, type) {
  const listEl = document.getElementById(type==='income' ? 'incomeSuggestions' : 'expenseSuggestions');
  const val = input.value.toLowerCase().trim();
  if (!val) { listEl.classList.remove('active'); return; }
  const matches = (appData.inputHistory[type] || []).filter(h => h.toLowerCase().includes(val));
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
