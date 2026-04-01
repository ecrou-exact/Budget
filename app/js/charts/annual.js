'use strict';
/* ============================================================
   BUDGE v4.2 — annual.js
   Grille des périodes (vue annuelle / toutes périodes)
   ============================================================ */

function renderPeriodsGrid() {
  const container = document.getElementById('periodsGrid');
  const periods   = sortedPeriods();
  if (!periods.length) {
    container.innerHTML = `<div class="col-12"><div class="bgt-no-period" style="min-height:220px">
      <div class="bgt-no-period-icon"><i class="fa-solid fa-calendar-xmark"></i></div>
      <p class="bgt-no-period-sub">Aucune période créée</p>
      <button class="btn bgt-btn-primary" onclick="openNewPeriodModal()"><i class="fa-solid fa-plus me-1"></i>Créer une période</button>
    </div></div>`;
    return;
  }
  container.innerHTML = periods.map(p => {
    const inc  = sumAmount(getPeriodIncome(p.id));
    const exp  = sumAmount(getPeriodExpenses(p.id));
    const bal  = inc - exp;
    const isA  = p.id === currentPeriodId;
    const openTag = !p.endDate ? '<span class="badge badge-pending ms-1">En cours</span>' : '';
    return `<div class="col-sm-6 col-md-4 col-lg-3">
      <div class="bgt-period-card ${isA?'active-period':''}">
        <div class="bgt-period-card-name">${escHtml(p.name)} ${openTag} ${isA?'<i class="fa-solid fa-circle-dot text-primary fa-xs"></i>':''}</div>
        <div class="bgt-period-card-dates">${shortPeriodDates(p)}</div>
        <div class="bgt-period-stat"><span class="text-muted">Revenus</span><span style="color:var(--bgt-success);font-family:var(--bgt-mono)">${formatAmount(inc)}</span></div>
        <div class="bgt-period-stat"><span class="text-muted">Dépenses</span><span style="color:var(--bgt-danger);font-family:var(--bgt-mono)">${formatAmount(exp)}</span></div>
        <div class="bgt-period-balance" style="color:${bal>=0?'var(--bgt-success)':'var(--bgt-danger)'}">
          ${bal>=0?'+':''}${formatAmount(bal)}</div>
        <div class="bgt-period-actions">
          <button class="bgt-period-btn" onclick="selectPeriod('${p.id}')"><i class="fa-solid fa-eye fa-xs me-1"></i>Voir</button>
          <button class="bgt-period-btn" onclick="editPeriod('${p.id}')"><i class="fa-solid fa-pen fa-xs me-1"></i>Modifier</button>
          <button class="bgt-period-btn" style="color:var(--bgt-danger)" onclick="deletePeriod('${p.id}')"><i class="fa-solid fa-trash fa-xs me-1"></i>Suppr.</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
