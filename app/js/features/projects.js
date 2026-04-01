'use strict';
/* ============================================================
   BUDGE v4.4 — projects.js
   • Logique upsert dépenses projet (inchangée)
   • viewProject : modal enrichie avec graphiques Chart.js
     - Anneau progression budget
     - Barres allocations par période
     - Ligne cumul épargne vs objectif
   ============================================================ */

function getProjectAllocTotal(proj) {
  return Object.values(proj.allocations || {}).reduce((a, b) => a + (parseFloat(b) || 0), 0);
}

function getProjectExpenseForPeriod(projId, periodId) {
  return appData.items.find(i =>
    i.projectId === projId && i.periodId === periodId && i.type === 'expense'
  ) || null;
}

function upsertProjectExpense(proj, periodId, amount) {
  appData.items = appData.items.filter(i =>
    !(i.projectId === proj.id && i.periodId === periodId && i.type === 'expense')
  );
  if (!amount || amount <= 0) return;
  const period = getPeriod(periodId);
  appData.items.push({
    id: genId(), periodId, type: 'expense',
    category: 'Autres', subcategory: 'Épargne projet',
    name: '🗂 Projet : ' + proj.name, amount,
    date: period ? period.startDate : new Date().toISOString().split('T')[0],
    isFixed: false, isPending: false, status: 'completed',
    projectId: proj.id, _isProjectExpense: true
  });
}

function propagateProjectsToPeriod(periodId) {
  (appData.projects || []).forEach(proj => {
    if (!proj.autoSave || !proj.autoSave.amount) return;
    if (proj.paused && proj.paused[periodId]) return;
    if (getProjectExpenseForPeriod(proj.id, periodId)) return;
    const amount = parseFloat(proj.allocations?.[periodId]) || proj.autoSave.amount;
    if (!proj.allocations) proj.allocations = {};
    proj.allocations[periodId] = amount;
    upsertProjectExpense(proj, periodId, amount);
  });
}

// ============================================================
// PAUSE / REPRISE
// ============================================================
function toggleProjectPause(projId) {
  if (!currentPeriodId) return;
  const proj = appData.projects.find(p => p.id === projId); if (!proj) return;
  if (!proj.paused) proj.paused = {};
  const wasPaused = !!proj.paused[currentPeriodId];
  proj.paused[currentPeriodId] = !wasPaused;
  if (!wasPaused) {
    delete (proj.allocations || {})[currentPeriodId];
    upsertProjectExpense(proj, currentPeriodId, 0);
    showToast(proj.name + ' : pausé ce mois ✓', 'info');
  } else {
    const amount = proj.autoSave?.amount || 0;
    if (amount > 0) {
      if (!proj.allocations) proj.allocations = {};
      proj.allocations[currentPeriodId] = amount;
      upsertProjectExpense(proj, currentPeriodId, amount);
    }
    showToast(proj.name + ' : réactivé ✓', 'success');
  }
  save(); renderProjectsWidget(); renderProjects(); updateAllUI();
}

// ============================================================
// WIDGET DASHBOARD
// ============================================================
function renderProjectsWidget() {
  const container = document.getElementById('projectsWidgetList'); if (!container) return;
  const projects = appData.projects || [];
  const count = document.getElementById('projectsCount');
  if (count) count.textContent = projects.length;
  if (!projects.length || !currentPeriodId) {
    container.innerHTML = '<div class="bgt-empty" style="padding:1.5rem 1rem">'
      + '<i class="fa-solid fa-folder-plus fa-xl mb-2" style="color:var(--bgt-text3)"></i><br>'
      + '<span style="font-size:.8rem;color:var(--bgt-text3)">Aucun projet — '
      + '<button class="btn btn-link btn-sm p-0" style="font-size:.8rem" onclick="goToTab(\'projects\')">en créer un →</button></span></div>';
    return;
  }
  container.innerHTML = projects.map(proj => {
    const allocTotal = getProjectAllocTotal(proj), budget = proj.budget || 0;
    const thisAlloc  = parseFloat(proj.allocations?.[currentPeriodId]) || 0;
    const isPaused   = proj.paused?.[currentPeriodId] || false;
    const pct        = budget > 0 ? Math.min(100, allocTotal / budget * 100) : 0;
    return '<div class="bgt-proj-widget-row">'
      + '<div class="bgt-proj-widget-icon" style="background:' + (proj.color || 'var(--bgt-primary)') + '22' + (isPaused ? ';opacity:.45' : '') + '">'
      + '<i class="fa-solid ' + (isPaused ? 'fa-pause' : (proj.icon || 'fa-folder')) + ' fa-xs" style="color:' + (proj.color || 'var(--bgt-primary)') + '"></i></div>'
      + '<div class="bgt-proj-widget-info">'
      + '<div class="bgt-proj-widget-name">' + escHtml(proj.name) + (isPaused ? ' <span style="font-size:.65rem;color:var(--bgt-warning)">(pausé)</span>' : '') + '</div>'
      + (budget > 0 ? '<div class="bgt-proj-widget-bar"><div style="width:' + pct + '%;background:' + (proj.color || 'var(--bgt-primary)') + '"></div></div>' : '')
      + '<div class="bgt-proj-widget-meta">' + formatAmount(allocTotal) + (budget > 0 ? ' / ' + formatAmount(budget) : '') + '</div>'
      + '</div>'
      + '<div class="bgt-proj-widget-deposit"><div class="d-flex align-items-center gap-1">'
      + '<input type="number" class="form-control bgt-input" id="qd_' + proj.id + '" placeholder="€" step="0.01" min="0" value="' + (thisAlloc || '') + '" style="width:72px;font-size:.75rem;padding:.25rem .4rem;height:auto"/>'
      + '<button class="bgt-btn-icon" onclick="widgetSetDeposit(\'' + proj.id + '\')" title="Confirmer"><i class="fa-solid fa-check fa-xs"></i></button>'
      + '<button class="bgt-btn-icon' + (isPaused ? '' : ' stop') + '" onclick="toggleProjectPause(\'' + proj.id + '\')" title="' + (isPaused ? 'Réactiver' : 'Pause') + '"><i class="fa-solid ' + (isPaused ? 'fa-play' : 'fa-pause') + ' fa-xs"></i></button>'
      + '</div></div></div>';
  }).join('');
}

function widgetSetDeposit(projId) {
  if (!currentPeriodId) { showToast('Sélectionnez une période.', 'danger'); return; }
  const proj = appData.projects.find(p => p.id === projId); if (!proj) return;
  const val  = parseFloat(document.getElementById('qd_' + projId)?.value) || 0;
  if (!proj.allocations) proj.allocations = {};
  if (val > 0) { proj.allocations[currentPeriodId] = val; if (proj.paused) proj.paused[currentPeriodId] = false; }
  else delete proj.allocations[currentPeriodId];
  upsertProjectExpense(proj, currentPeriodId, val);
  save(); renderProjectsWidget(); updateAllUI();
  showToast(val > 0 ? proj.name + ' : ' + formatAmount(val) + ' alloué ✓' : proj.name + ' : allocation supprimée', 'success');
}

// ============================================================
// MODAL CRÉATION / ÉDITION
// ============================================================
function openProjectModal(id) {
  editingProjectId = id || null;
  selectedProjColor = '#4f46e5'; selectedProjIcon = 'fa-folder';
  const proj = id ? appData.projects.find(p => p.id === id) : null;
  document.getElementById('projectModalTitle').innerHTML = proj
    ? '<i class="fa-solid fa-pen me-2"></i>Modifier le Projet'
    : '<i class="fa-solid fa-folder-plus me-2"></i>Nouveau Projet';
  document.getElementById('projName').value     = proj?.name || '';
  document.getElementById('projDesc').value     = proj?.desc || '';
  document.getElementById('projBudget').value   = proj?.budget || '';
  document.getElementById('projAutoSave').value = proj?.autoSave?.amount || '';
  if (proj?.color) selectedProjColor = proj.color;
  if (proj?.icon)  selectedProjIcon  = proj.icon;
  document.getElementById('projColorPicker').innerHTML = PROJ_COLORS.map(c =>
    '<span class="bgt-color-swatch ' + (c === selectedProjColor ? 'selected' : '') + '" style="background:' + c + '" onclick="selectProjColor(\'' + c + '\',this)"></span>'
  ).join('');
  document.getElementById('projIconPicker').innerHTML = PROJ_ICONS.map(ic =>
    '<span class="bgt-icon-swatch ' + (ic === selectedProjIcon ? 'selected' : '') + '" data-icon="' + ic + '" onclick="selectProjIcon(\'' + ic + '\',this)" title="' + ic + '"><i class="fa-solid ' + ic + '"></i></span>'
  ).join('');
  const periods = sortedPeriods();
  document.getElementById('projAllocations').innerHTML = !periods.length
    ? '<p class="text-muted small">Créez d\'abord une période.</p>'
    : periods.map(p => {
        const existing = proj?.allocations?.[p.id] || '';
        const isPaused = proj?.paused?.[p.id] || false;
        return '<div class="bgt-proj-alloc-row">'
          + '<div class="bgt-proj-alloc-period">' + escHtml(p.name) + (isPaused ? ' <span style="font-size:.6rem;color:var(--bgt-warning)">⏸</span>' : '')
          + '<br><span style="font-size:.68rem;color:var(--bgt-text3);font-family:var(--bgt-mono)">' + shortPeriodDates(p) + '</span></div>'
          + '<div style="width:140px"><input type="number" class="form-control bgt-input bgt-proj-alloc-input" data-period-id="' + p.id + '" placeholder="0.00" step="0.01" min="0" value="' + existing + '" style="font-size:.8rem;padding:.3rem .5rem"/></div>'
          + '</div>';
      }).join('');
  getBSModal('projectModal').show();
}

function selectProjColor(color, el) {
  selectedProjColor = color;
  document.querySelectorAll('#projColorPicker .bgt-color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}
function selectProjIcon(icon, el) {
  selectedProjIcon = icon;
  document.querySelectorAll('#projIconPicker .bgt-icon-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

function saveProject() {
  const name        = document.getElementById('projName').value.trim();
  const desc        = document.getElementById('projDesc').value.trim();
  const budget      = parseFloat(document.getElementById('projBudget').value)   || 0;
  const autoSaveAmt = parseFloat(document.getElementById('projAutoSave').value) || 0;
  if (!name) { showToast('Donnez un nom au projet.', 'danger'); return; }
  const newAllocations = {};
  document.querySelectorAll('.bgt-proj-alloc-input').forEach(inp => {
    const val = parseFloat(inp.value);
    if (val > 0) newAllocations[inp.dataset.periodId] = val;
  });
  const isNew = !editingProjectId;
  if (editingProjectId) {
    const proj = appData.projects.find(p => p.id === editingProjectId);
    if (proj) {
      const oldAlloc = proj.allocations || {};
      proj.name = name; proj.desc = desc; proj.budget = budget;
      proj.color = selectedProjColor; proj.icon = selectedProjIcon;
      proj.autoSave = autoSaveAmt > 0 ? { amount: autoSaveAmt } : null;
      proj.allocations = newAllocations;
      sortedPeriods().forEach(p => {
        const oldAmt = parseFloat(oldAlloc[p.id]) || 0;
        const newAmt = parseFloat(newAllocations[p.id]) || 0;
        if (oldAmt !== newAmt) upsertProjectExpense(proj, p.id, newAmt);
      });
    }
  } else {
    const proj = { id: genId(), name, desc, budget, color: selectedProjColor, icon: selectedProjIcon,
      autoSave: autoSaveAmt > 0 ? { amount: autoSaveAmt } : null, allocations: newAllocations, paused: {} };
    appData.projects.push(proj);
    if (currentPeriodId) {
      const amt = parseFloat(newAllocations[currentPeriodId]) || autoSaveAmt || 0;
      if (amt > 0) { proj.allocations[currentPeriodId] = amt; upsertProjectExpense(proj, currentPeriodId, amt); }
    }
  }
  save(); getBSModal('projectModal').hide();
  renderProjects(); renderProjectsWidget(); updateAllUI();
  showToast(isNew ? 'Projet créé ✓' : 'Projet modifié ✓', 'success');
  editingProjectId = null;
}

function deleteProject(id) {
  if (!confirm('Supprimer ce projet et toutes ses dépenses associées ?')) return;
  appData.items    = appData.items.filter(i => i.projectId !== id);
  appData.projects = appData.projects.filter(p => p.id !== id);
  save(); renderProjects(); renderProjectsWidget(); updateAllUI();
  showToast('Projet supprimé', 'info');
}

// ============================================================
// GRILLE PROJETS
// ============================================================
function renderProjects() {
  const container = document.getElementById('projectsGrid');
  if (!appData.projects?.length) {
    container.innerHTML = '<div class="col-12"><div class="bgt-no-period" style="min-height:200px">'
      + '<div class="bgt-no-period-icon"><i class="fa-solid fa-folder-plus"></i></div>'
      + '<p class="bgt-no-period-sub">Aucun projet. Créez des enveloppes pour vos objectifs d\'épargne.</p>'
      + '<button class="btn bgt-btn-primary" onclick="openProjectModal()"><i class="fa-solid fa-plus me-1"></i>Créer un projet</button>'
      + '</div></div>';
    return;
  }
  container.innerHTML = appData.projects.map(proj => {
    const allocTotal = getProjectAllocTotal(proj), budget = proj.budget || 0;
    const pct  = budget > 0 ? Math.min(100, allocTotal / budget * 100) : 0;
    const over = budget > 0 && allocTotal > budget;
    const thisAlloc  = parseFloat(proj.allocations?.[currentPeriodId]) || 0;
    const allocCount = Object.keys(proj.allocations || {}).filter(k => (proj.allocations[k] || 0) > 0).length;
    const isPaused   = proj.paused?.[currentPeriodId] || false;
    const color      = proj.color || 'var(--bgt-primary)';
    return '<div class="col-sm-6 col-lg-4">'
      + '<div class="bgt-project-card" style="--proj-color:' + color + '">'
      // Header
      + '<div class="d-flex align-items-start justify-content-between mb-2">'
      + '<div class="d-flex align-items-center gap-2">'
      + '<div style="width:36px;height:36px;border-radius:50%;background:' + color + '22;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
      + '<i class="fa-solid ' + (proj.icon || 'fa-folder') + '" style="color:' + color + '"></i></div>'
      + '<div>'
      + '<div class="bgt-project-name">' + escHtml(proj.name) + '</div>'
      + (proj.autoSave ? '<div style="font-size:.68rem;color:var(--bgt-text3)"><i class="fa-solid fa-rotate fa-xs me-1"></i>Auto ' + formatAmount(proj.autoSave.amount) + '/période</div>' : '')
      + (isPaused ? '<div style="font-size:.68rem;color:var(--bgt-warning)"><i class="fa-solid fa-pause fa-xs me-1"></i>Pausé ce mois</div>' : '')
      + '</div></div>'
      // Mini donut si budget défini
      + (budget > 0 ? '<canvas id="minidonut_' + proj.id + '" width="48" height="48" style="flex-shrink:0"></canvas>' : '')
      + '</div>'
      + (proj.desc ? '<div class="bgt-project-desc">' + escHtml(proj.desc) + '</div>' : '')
      // Barre progression
      + (budget > 0
          ? '<div class="bgt-project-budget-bar"><div class="bgt-project-budget-fill ' + (over ? 'over' : '') + '" style="width:' + pct + '%;background:' + color + '"></div></div>'
          + '<div class="bgt-project-stats"><span>' + formatAmount(allocTotal) + '</span><span style="color:' + (over?'var(--bgt-danger)':'var(--bgt-text3)') + '">' + pct.toFixed(0) + '% de ' + formatAmount(budget) + '</span></div>'
          : '<div class="bgt-project-alloc">' + formatAmount(allocTotal) + ' sur ' + allocCount + ' période(s)</div>')
      // Dépôt rapide
      + (currentPeriodId
          ? '<div class="bgt-proj-quick-deposit-row"><span style="font-size:.7rem;color:var(--bgt-text3)"><i class="fa-solid fa-coins fa-xs me-1"></i>Ce mois :</span>'
          + '<div class="d-flex align-items-center gap-1">'
          + '<input type="number" id="qd2_' + proj.id + '" class="form-control bgt-input" placeholder="0.00" value="' + (thisAlloc || '') + '" step="0.01" min="0" style="width:90px;font-size:.78rem;padding:.3rem .4rem;height:auto"/>'
          + '<button class="bgt-proj-btn" style="padding:.3rem .6rem" onclick="projectPageSetDeposit(\'' + proj.id + '\')"><i class="fa-solid fa-check fa-xs me-1"></i>OK</button>'
          + '<button class="bgt-proj-btn" style="padding:.3rem .5rem;color:' + (isPaused ? 'var(--bgt-success)' : 'var(--bgt-warning)') + '" onclick="toggleProjectPause(\'' + proj.id + '\')" title="' + (isPaused ? 'Réactiver' : 'Pause') + '"><i class="fa-solid ' + (isPaused ? 'fa-play' : 'fa-pause') + ' fa-xs"></i></button>'
          + '</div></div>'
          : '')
      // Actions
      + '<div class="bgt-project-actions">'
      + '<button class="bgt-proj-btn" onclick="viewProject(\'' + proj.id + '\')"><i class="fa-solid fa-chart-pie fa-xs me-1"></i>Analyse</button>'
      + '<button class="bgt-proj-btn" onclick="openProjectModal(\'' + proj.id + '\')"><i class="fa-solid fa-pen fa-xs me-1"></i>Modifier</button>'
      + '<button class="bgt-proj-btn" style="color:var(--bgt-danger)" onclick="deleteProject(\'' + proj.id + '\')"><i class="fa-solid fa-trash fa-xs me-1"></i>Suppr.</button>'
      + '</div></div></div>';
  }).join('');

  // Dessiner les mini-donuts après que le DOM est en place
  requestAnimationFrame(() => {
    appData.projects.forEach(proj => {
      const budget = proj.budget || 0;
      if (!budget) return;
      const canvas = document.getElementById('minidonut_' + proj.id);
      if (!canvas) return;
      const allocTotal = getProjectAllocTotal(proj);
      const pct  = Math.min(100, (allocTotal / budget) * 100);
      const rest = Math.max(0, 100 - pct);
      const color = proj.color || 'var(--bgt-primary)';
      if (charts['minidonut_' + proj.id]) { charts['minidonut_' + proj.id].destroy(); }
      charts['minidonut_' + proj.id] = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { datasets: [{ data: [pct, rest],
          backgroundColor: [color, 'rgba(255,255,255,0.07)'],
          borderWidth: 0 }] },
        options: { cutout: '72%', responsive: false, animation: { duration: 600 },
          plugins: { legend: { display: false }, tooltip: { enabled: false } } }
      });
    });
  });
}

function projectPageSetDeposit(projId) {
  if (!currentPeriodId) { showToast('Sélectionnez une période.', 'danger'); return; }
  const proj = appData.projects.find(p => p.id === projId); if (!proj) return;
  const val  = parseFloat(document.getElementById('qd2_' + projId)?.value) || 0;
  if (!proj.allocations) proj.allocations = {};
  if (val > 0) { proj.allocations[currentPeriodId] = val; if (proj.paused) proj.paused[currentPeriodId] = false; }
  else delete proj.allocations[currentPeriodId];
  upsertProjectExpense(proj, currentPeriodId, val);
  save(); renderProjects(); renderProjectsWidget(); updateAllUI();
  showToast(val > 0 ? proj.name + ' : ' + formatAmount(val) + ' alloué ✓' : proj.name + ' : allocation supprimée', 'success');
}

// ============================================================
// MODAL DÉTAIL — GRAPHIQUES
// ============================================================
// Stockage des charts de la modal détail projet
let _projDetailCharts = {};

function viewProject(id) {
  const proj = appData.projects.find(p => p.id === id); if (!proj) return;
  const sorted     = sortedPeriods();
  const allocs     = proj.allocations || {};
  const paused     = proj.paused || {};
  const allocTotal = getProjectAllocTotal(proj);
  const budget     = proj.budget || 0;
  const pct        = budget > 0 ? Math.min(100, (allocTotal / budget) * 100) : 0;
  const color      = proj.color || '#6366f1';

  // KPIs
  const periodsWithAlloc = sorted.filter(p => (parseFloat(allocs[p.id]) || 0) > 0);
  const avgPerPeriod     = periodsWithAlloc.length > 0 ? allocTotal / periodsWithAlloc.length : 0;
  const remaining        = budget > 0 ? Math.max(0, budget - allocTotal) : null;
  const periodsNeeded    = (remaining !== null && avgPerPeriod > 0) ? Math.ceil(remaining / avgPerPeriod) : null;

  document.getElementById('projDetailTitle').innerHTML =
    '<i class="fa-solid ' + (proj.icon || 'fa-folder') + ' me-2" style="color:' + color + '"></i>' + escHtml(proj.name);

  document.getElementById('projDetailBody').innerHTML =
    // Description + autoSave
    (proj.desc ? '<p class="text-muted mb-3" style="font-size:.88rem">' + escHtml(proj.desc) + '</p>' : '')
    + (proj.autoSave ? '<div class="alert bgt-alert-info mb-3" style="font-size:.82rem"><i class="fa-solid fa-rotate me-2"></i>Épargne auto : <strong>' + formatAmount(proj.autoSave.amount) + '</strong>/période</div>' : '')

    // KPIs row
    + '<div class="row g-2 mb-3">'
    + '<div class="col-6 col-md-3"><div class="bgt-kpi bgt-kpi-income"><div class="bgt-kpi-label">Épargné</div><div class="bgt-kpi-value" style="color:' + color + '">' + formatAmount(allocTotal) + '</div></div></div>'
    + (budget > 0
        ? '<div class="col-6 col-md-3"><div class="bgt-kpi bgt-kpi-ratio"><div class="bgt-kpi-label">Objectif</div><div class="bgt-kpi-value">' + formatAmount(budget) + '</div></div></div>'
        + '<div class="col-6 col-md-3"><div class="bgt-kpi bgt-kpi-balance"><div class="bgt-kpi-label">Restant</div><div class="bgt-kpi-value" style="color:' + (remaining === 0 ? 'var(--bgt-success)' : 'var(--bgt-warning)') + '">' + formatAmount(remaining) + '</div></div></div>'
        : '')
    + '<div class="col-6 col-md-3"><div class="bgt-kpi bgt-kpi-expense"><div class="bgt-kpi-label">Moy./période</div><div class="bgt-kpi-value">' + formatAmount(avgPerPeriod) + '</div></div></div>'
    + '</div>'

    // Estimation
    + (periodsNeeded !== null && periodsNeeded > 0
        ? '<div class="alert" style="background:' + color + '15;border:1px solid ' + color + '44;border-radius:.5rem;font-size:.8rem;margin-bottom:1rem">'
        + '<i class="fa-solid fa-clock-rotate-left me-2" style="color:' + color + '"></i>'
        + 'À ce rythme (<strong>' + formatAmount(avgPerPeriod) + '/période</strong>), objectif atteint dans <strong>~' + periodsNeeded + ' période(s)</strong>.'
        + '</div>'
        : (budget > 0 && pct >= 100
            ? '<div class="alert" style="background:rgba(16,185,129,.12);border:1px solid var(--bgt-success);border-radius:.5rem;font-size:.8rem;margin-bottom:1rem">'
            + '<i class="fa-solid fa-trophy me-2" style="color:var(--bgt-success)"></i><strong>Objectif atteint ! 🎉</strong></div>'
            : ''))

    // Graphiques
    + '<div class="row g-3 mb-3">'
    // Donut progression
    + (budget > 0
        ? '<div class="col-md-5">'
        + '<div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--bgt-text3);margin-bottom:.5rem">Progression</div>'
        + '<div style="position:relative;max-width:160px;margin:0 auto">'
        + '<canvas id="projDetailDonut" height="160"></canvas>'
        + '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none">'
        + '<div style="font-size:1.1rem;font-weight:700;color:' + color + '">' + pct.toFixed(0) + '%</div>'
        + '<div style="font-size:.65rem;color:var(--bgt-text3)">de l\'objectif</div>'
        + '</div></div></div>'
        : '')
    // Barres par période
    + '<div class="' + (budget > 0 ? 'col-md-7' : 'col-12') + '">'
    + '<div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--bgt-text3);margin-bottom:.5rem">Épargne par période</div>'
    + '<div style="height:140px"><canvas id="projDetailBars"></canvas></div>'
    + '</div></div>'

    // Courbe cumul
    + (periodsWithAlloc.length > 1
        ? '<div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--bgt-text3);margin-bottom:.5rem">Cumul de l\'épargne</div>'
        + '<div style="height:120px;margin-bottom:1rem"><canvas id="projDetailLine"></canvas></div>'
        : '')

    // Tableau allocations
    + '<div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--bgt-text3);margin-bottom:.5rem">Détail par période</div>'
    + '<div style="max-height:200px;overflow-y:auto">'
    + '<table class="table bgt-table mb-0" style="font-size:.8rem">'
    + '<thead><tr><th>Période</th><th>Alloué</th><th>Statut</th></tr></thead>'
    + '<tbody>'
    + sorted.map(p => {
        const amt      = parseFloat(allocs[p.id]) || 0;
        const isPaused = paused[p.id] || false;
        const isCurrent = p.id === currentPeriodId;
        if (amt === 0 && !isPaused) return '';
        return '<tr' + (isCurrent ? ' style="background:' + color + '10"' : '') + '>'
          + '<td>' + escHtml(p.name) + (isCurrent ? ' <span class="badge" style="background:' + color + '33;color:' + color + ';font-size:.6rem">actuelle</span>' : '') + '</td>'
          + '<td style="font-family:var(--bgt-mono)">' + (amt > 0 ? formatAmount(amt) : '—') + '</td>'
          + '<td>' + (isPaused
              ? '<span style="font-size:.7rem;color:var(--bgt-warning)"><i class="fa-solid fa-pause fa-xs me-1"></i>Pausé</span>'
              : '<span style="font-size:.7rem;color:var(--bgt-success)"><i class="fa-solid fa-check fa-xs me-1"></i>OK</span>')
          + '</td></tr>';
      }).join('')
    + '</tbody></table></div>';

  getBSModal('projectDetailModal').show();

  // Dessiner les charts après affichage de la modal
  setTimeout(() => {
    // Détruire les anciens
    Object.values(_projDetailCharts).forEach(c => c?.destroy?.());
    _projDetailCharts = {};

    const axisStyle = {
      ticks: { color: '#8d96a0', font: { size: 10 } },
      grid:  { color: 'rgba(255,255,255,0.04)' }
    };

    // 1. Donut progression
    if (budget > 0) {
      const donutCtx = document.getElementById('projDetailDonut')?.getContext('2d');
      if (donutCtx) {
        _projDetailCharts.donut = new Chart(donutCtx, {
          type: 'doughnut',
          data: { datasets: [{ data: [pct, Math.max(0, 100 - pct)],
            backgroundColor: [color, 'rgba(255,255,255,0.07)'], borderWidth: 0 }] },
          options: { cutout: '70%', responsive: true, maintainAspectRatio: false,
            animation: { duration: 800 },
            plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
      }
    }

    // 2. Barres par période
    const barsCtx = document.getElementById('projDetailBars')?.getContext('2d');
    if (barsCtx && sorted.length) {
      const barData   = sorted.map(p => parseFloat(allocs[p.id]) || 0);
      const barColors = sorted.map(p => (paused[p.id] ? 'rgba(245,158,11,.4)' : color + 'cc'));
      _projDetailCharts.bars = new Chart(barsCtx, {
        type: 'bar',
        data: { labels: sorted.map(p => p.name),
          datasets: [{ label: 'Alloué', data: barData, backgroundColor: barColors, borderRadius: 5, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: ctx => formatAmount(ctx.raw) } } },
          scales: { x: { ...axisStyle, ticks: { ...axisStyle.ticks, maxRotation: 30 } }, y: { ...axisStyle, beginAtZero: true,
            ticks: { ...axisStyle.ticks, callback: v => formatAmount(v) } } } }
      });
    }

    // 3. Courbe cumul
    if (periodsWithAlloc.length > 1) {
      const lineCtx = document.getElementById('projDetailLine')?.getContext('2d');
      if (lineCtx) {
        let cumul = 0;
        const cumulData = sorted.map(p => { cumul += parseFloat(allocs[p.id]) || 0; return cumul; });
        const datasets = [{ label: 'Cumul épargné', data: cumulData, borderColor: color,
          backgroundColor: color + '18', tension: .4, fill: true, pointRadius: 3,
          pointBackgroundColor: color }];
        if (budget > 0) {
          datasets.push({ label: 'Objectif', data: sorted.map(() => budget),
            borderColor: 'rgba(255,255,255,.2)', borderDash: [5,4], pointRadius: 0,
            borderWidth: 1.5, fill: false });
        }
        _projDetailCharts.line = new Chart(lineCtx, {
          type: 'line',
          data: { labels: sorted.map(p => p.name), datasets },
          options: { responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: budget > 0,
              labels: { color: '#8d96a0', font: { size: 10 }, boxWidth: 12 } },
              tooltip: { callbacks: { label: ctx => ctx.dataset.label + ' : ' + formatAmount(ctx.raw) } } },
            scales: { x: { ...axisStyle, ticks: { ...axisStyle.ticks, maxRotation: 30 } },
              y: { ...axisStyle, beginAtZero: true,
                ticks: { ...axisStyle.ticks, callback: v => formatAmount(v) } } } }
        });
      }
    }
  }, 120);
}