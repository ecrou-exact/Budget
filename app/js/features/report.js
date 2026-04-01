'use strict';
/* ============================================================
   BUDGE v4.2 — report.js
   Génération du rapport de période (HTML + PDF)
   ============================================================ */

function generateReport() {
  if (!currentPeriodId) {
    document.getElementById('reportContent').innerHTML = '<p class="text-muted">Sélectionnez une période.</p>';
    return;
  }
  const period   = getPeriod(currentPeriodId);
  const income   = getPeriodIncome(currentPeriodId);
  const expenses = getPeriodExpenses(currentPeriodId);
  const s        = calculateStats(currentPeriodId);
  const catTotals = {};
  expenses.forEach(e => catTotals[e.category] = (catTotals[e.category]||0) + e.amount);
  const sortedCats = Object.entries(catTotals).sort((a,b) => b[1]-a[1]);

  document.getElementById('reportContent').innerHTML = `
    <h4 class="fw-bold mb-1">${escHtml(period.name)}</h4>
    <p class="text-muted small mb-4">${shortPeriodDates(period)}</p>
    <div class="bgt-report-kpi-grid">
      <div class="bgt-report-kpi" style="background:rgba(16,185,129,.08);border-color:var(--bgt-success)">
        <div class="bgt-report-kpi-label">Revenus</div><div class="bgt-report-kpi-val text-success">${formatAmount(s.totalIncome)}</div></div>
      <div class="bgt-report-kpi" style="background:rgba(239,68,68,.08);border-color:var(--bgt-danger)">
        <div class="bgt-report-kpi-label">Dépenses</div><div class="bgt-report-kpi-val text-danger">${formatAmount(s.totalExpenses)}</div></div>
      <div class="bgt-report-kpi" style="background:rgba(6,182,212,.08);border-color:var(--bgt-info)">
        <div class="bgt-report-kpi-label">Solde</div>
        <div class="bgt-report-kpi-val" style="color:${s.balance>=0?'var(--bgt-success)':'var(--bgt-danger)'}">${formatAmount(s.balance)}</div></div>
    </div>

    <h6 class="bgt-report-h2">Revenus</h6>
    <table class="table bgt-table">
      <thead><tr><th>Libellé</th><th>Type</th><th>Montant</th><th>Date</th></tr></thead>
      <tbody>${income.map(i =>
        `<tr><td><strong>${escHtml(i.name)}</strong></td><td>${i.incomeType||'Salaire'}</td>
        <td class="text-success">${formatAmount(i.amount)}</td><td>${formatDateFR(i.date)}</td></tr>`
      ).join('') || '<tr><td colspan="4" class="text-center text-muted">Aucun revenu</td></tr>'}</tbody>
    </table>

    <h6 class="bgt-report-h2">Dépenses par Catégorie</h6>
    <table class="table bgt-table">
      <thead><tr><th>Catégorie</th><th>Total</th><th>%</th></tr></thead>
      <tbody>${sortedCats.map(([cat,amt]) =>
        `<tr><td><strong>${CAT_EMOJI[cat]||''} ${cat}</strong></td><td>${formatAmount(amt)}</td>
        <td>${s.totalExpenses>0?(amt/s.totalExpenses*100).toFixed(1):0}%</td></tr>`
      ).join('') || '<tr><td colspan="3" class="text-center text-muted">Aucune dépense</td></tr>'}</tbody>
    </table>

    <h6 class="bgt-report-h2">Toutes les Dépenses</h6>
    <table class="table bgt-table">
      <thead><tr><th>Libellé</th><th>Montant</th><th>Catégorie</th><th>Date</th><th>Statut</th></tr></thead>
      <tbody>${expenses.map(e =>
        `<tr><td><strong>${escHtml(e.name)}</strong></td><td>${formatAmount(e.amount)}</td>
        <td>${CAT_EMOJI[e.category]||''} ${e.category}${e.subcategory?' › '+e.subcategory:''}</td>
        <td>${formatDateFR(e.date)}</td>
        <td>${e.status==='completed'?'<span class="text-success">✓ Payée</span>':'<span class="text-warning">⏳ À venir</span>'}</td></tr>`
      ).join('') || '<tr><td colspan="5" class="text-center text-muted">Aucune dépense</td></tr>'}</tbody>
    </table>`;
}
