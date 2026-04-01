'use strict';
/* ============================================================
   BUDGE v4.2 — charts.js
   Tous les graphiques Chart.js (dashboard + analytics + annuel)
   ============================================================ */

// ---- Options partagées ----
const chartOpts = () => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: {
    color: currentMode === 'light' ? '#4a5568' : '#8d96a0',
    font: { family:"'DM Sans',sans-serif", size:11 }
  }}}
});
const axisOpts = () => ({
  ticks: { color: currentMode==='light'?'#718096':'#656d76', font:{family:"'DM Mono',monospace",size:10} },
  grid:  { color: currentMode==='light'?'rgba(0,0,0,0.06)':'rgba(255,255,255,0.04)' }
});

function dc(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }

// ============================================================
// DASHBOARD CHARTS
// ============================================================
function updateExpenseChart() {
  if (!currentPeriodId) return;
  const totals = {};
  getPeriodExpenses(currentPeriodId)
    .filter(e => visibleCategories.has(e.category))
    .forEach(e => totals[e.category] = (totals[e.category]||0) + e.amount);
  dc('expense');
  if (!Object.keys(totals).length) return;
  charts.expense = new Chart(document.getElementById('expenseChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(totals),
      datasets: [{ data:Object.values(totals), backgroundColor:CHART_COLORS,
        borderColor: currentMode==='light'?'#fff':'#161b22', borderWidth:2 }]
    },
    options: { ...chartOpts(), cutout:'65%', plugins:{...chartOpts().plugins, legend:{...chartOpts().plugins.legend, position:'bottom'}} }
  });
}

function updateComparisonChart() {
  const s = calculateStats(currentPeriodId); dc('comparison');
  charts.comparison = new Chart(document.getElementById('comparisonChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Revenus','Dépenses','Solde'],
      datasets: [{ data:[s.totalIncome, s.totalExpenses, s.balance],
        backgroundColor: ['rgba(16,185,129,.7)','rgba(239,68,68,.7)', s.balance>=0?'rgba(6,182,212,.7)':'rgba(239,68,68,.5)'],
        borderColor:     ['#10b981','#ef4444', s.balance>=0?'#06b6d4':'#ef4444'],
        borderWidth:2, borderRadius:6 }]
    },
    options: { ...chartOpts(), plugins:{legend:{display:false}}, scales:{y:{...axisOpts(),beginAtZero:true}, x:axisOpts()} }
  });
}

// ============================================================
// ANALYTICS CHARTS
// ============================================================
function updateAnalyticsCharts() {
  const periods = sortedPeriods(); if (!periods.length) return;

  // Tendance revenus / dépenses
  dc('trend');
  charts.trend = new Chart(document.getElementById('trendChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: periods.map(p => p.name),
      datasets: [
        { label:'Revenus',  data:periods.map(p=>sumAmount(getPeriodIncome(p.id))),   borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.1)',  tension:.4, fill:true, pointRadius:4 },
        { label:'Dépenses', data:periods.map(p=>sumAmount(getPeriodExpenses(p.id))), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.1)',    tension:.4, fill:true, pointRadius:4 }
      ]
    },
    options: { ...chartOpts(), scales:{y:{...axisOpts(),beginAtZero:true}, x:axisOpts()} }
  });

  // Dépenses empilées par catégorie
  dc('stacked');
  const catData = {};
  CATEGORIES.forEach(c => catData[c] = new Array(periods.length).fill(0));
  periods.forEach((p,idx) => getPeriodExpenses(p.id).forEach(e => { if (catData[e.category]) catData[e.category][idx] += e.amount; }));
  charts.stacked = new Chart(document.getElementById('categoryStackedChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: periods.map(p => p.name),
      datasets: Object.entries(catData)
        .filter(([,d]) => d.some(v => v > 0))
        .map(([cat,d], i) => ({ label:cat, data:d, backgroundColor:CHART_COLORS[i%CHART_COLORS.length] }))
    },
    options: { ...chartOpts(), scales:{x:{...axisOpts(),stacked:true}, y:{...axisOpts(),stacked:true,beginAtZero:true}} }
  });

  // Tableau de stats par catégorie
  const stats = {};
  periods.forEach(p => getPeriodExpenses(p.id).forEach(e => {
    if (!stats[e.category]) stats[e.category] = {total:0, count:0};
    stats[e.category].total  += e.amount;
    stats[e.category].count  += 1;
  }));
  const n = periods.length || 1;
  document.getElementById('analyticsTable').innerHTML =
    Object.entries(stats).sort((a,b) => b[1].total - a[1].total)
      .map(([cat,s]) =>
        `<tr><td><strong>${CAT_EMOJI[cat]||''} ${cat}</strong></td><td>${formatAmount(s.total)}</td><td>${formatAmount(s.total/n)}</td></tr>`
      ).join('')
    || '<tr><td colspan="3" class="text-center text-muted">Aucune donnée</td></tr>';

  // Épargne par période
  dc('savings');
  const savings = periods.map(p => sumAmount(getPeriodIncome(p.id)) - sumAmount(getPeriodExpenses(p.id)));
  charts.savings = new Chart(document.getElementById('savingsChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: periods.map(p => p.name),
      datasets: [{ label:'Épargne', data:savings,
        backgroundColor: savings.map(v => v>=0 ? 'rgba(16,185,129,.7)' : 'rgba(239,68,68,.7)'),
        borderColor:     savings.map(v => v>=0 ? '#10b981'              : '#ef4444'),
        borderWidth:2, borderRadius:6 }]
    },
    options: { ...chartOpts(), plugins:{legend:{display:false}}, scales:{y:{...axisOpts(),beginAtZero:false}, x:axisOpts()} }
  });
}

// ============================================================
// ANNUAL CHART
// ============================================================
function updateAnnualView() {
  renderPeriodsGrid(); dc('annual');
  const periods = sortedPeriods(); if (!periods.length) return;
  charts.annual = new Chart(document.getElementById('annualChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: periods.map(p => p.name),
      datasets: [
        { label:'Revenus',  data:periods.map(p=>sumAmount(getPeriodIncome(p.id))),   borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.05)', tension:.4, fill:true },
        { label:'Dépenses', data:periods.map(p=>sumAmount(getPeriodExpenses(p.id))), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.05)',    tension:.4, fill:true }
      ]
    },
    options: { ...chartOpts(), scales:{y:{...axisOpts(),beginAtZero:true}, x:axisOpts()} }
  });
  let ti=0, te=0;
  periods.forEach(p => { ti += sumAmount(getPeriodIncome(p.id)); te += sumAmount(getPeriodExpenses(p.id)); });
  const n = periods.length || 1;
  document.getElementById('annualSummary').innerHTML = `
    <tr><td><strong>Nombre de périodes</strong></td><td class="text-end fw-bold">${periods.length}</td></tr>
    <tr><td><strong>Revenus Totaux</strong></td><td class="text-end fw-bold" style="color:var(--bgt-success)">${formatAmount(ti)}</td></tr>
    <tr><td><strong>Dépenses Totales</strong></td><td class="text-end fw-bold" style="color:var(--bgt-danger)">${formatAmount(te)}</td></tr>
    <tr><td><strong>Épargne Totale</strong></td><td class="text-end fw-bold" style="color:${ti-te>=0?'var(--bgt-success)':'var(--bgt-danger)'}">
      ${formatAmount(ti-te)}</td></tr>
    <tr><td><strong>Moy. Revenus / Période</strong></td><td class="text-end">${formatAmount(ti/n)}</td></tr>
    <tr><td><strong>Moy. Dépenses / Période</strong></td><td class="text-end">${formatAmount(te/n)}</td></tr>`;
}
