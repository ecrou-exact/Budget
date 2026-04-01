'use strict';
/* ============================================================
   BUDGE v4.3 — export.js
   Export / Import :
   • exportPeriodData  → export période + projets + récurrents
   • exportAllData     → export intégral de tout appData
   • confirmImport     → import avec projets, periods, items, recurring
   ============================================================ */

// ---- Export d'une période + projets liés ----
function exportPeriodData() {
  if (!currentPeriodId) { showToast('Sélectionnez une période.','danger'); return; }
  const period = getPeriod(currentPeriodId);
  // Projets avec leurs allocations pour cette période
  const projectsForPeriod = (appData.projects || []).map(proj => ({
    ...proj,
    _allocForPeriod: parseFloat(proj.allocations?.[currentPeriodId]) || 0
  }));
  const blob = new Blob([JSON.stringify({
    _budgeVersion: '4.3',
    period,
    income:    getPeriodIncome(currentPeriodId),
    expenses:  getPeriodExpenses(currentPeriodId),
    recurring: appData.recurring || [],
    projects:  projectsForPeriod,
    exported:  new Date().toISOString()
  }, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'budget-' + period.name.replace(/\s+/g,'-') + '.json';
  a.click(); URL.revokeObjectURL(a.href);
  showToast('Export période terminé ✓','success');
}

// ---- Export intégral (toutes périodes + projets + récurrents) ----
function exportAllData() {
  const blob = new Blob([JSON.stringify({
    _budgeVersion: '4.3',
    _exportType:   'full',
    ...appData,
    exported: new Date().toISOString()
  }, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'budge-full-export-' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(a.href);
  showToast('Export complet téléchargé ✓','success');
}

function openImportModal() { getBSModal('importModal').show(); }

function previewImportData(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      const isFull = d._exportType === 'full';
      let html = '<div class="alert bgt-alert-info mt-2">';
      if (isFull) {
        html += '<strong>Export complet</strong> — '
          + (d.periods?.length||0) + ' périodes, '
          + (d.items?.length||0) + ' transactions, '
          + (d.projects?.length||0) + ' projets, '
          + (d.recurring?.length||0) + ' récurrents';
      } else {
        html += 'Période : <strong>' + (d.period?.name||'?') + '</strong> — '
          + (d.income?.length||0) + ' revenus, '
          + (d.expenses?.length||0) + ' dépenses, '
          + (d.projects?.length||0) + ' projets';
      }
      html += '</div>';
      document.getElementById('importPreview').innerHTML = html;
    } catch {
      document.getElementById('importPreview').innerHTML = '<p class="text-danger mt-2">Fichier invalide</p>';
    }
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

      if (d._exportType === 'full') {
        // ---- Import intégral ----
        bgtConfirm('Cet import va FUSIONNER toutes les données existantes. Continuer ?', () => {
        // Fusionne périodes
        (d.periods||[]).forEach(p => { if (!appData.periods.find(x=>x.id===p.id)) appData.periods.push(p); });
        // Fusionne items
        (d.items||[]).forEach(i => { if (!appData.items.find(x=>x.id===i.id)) appData.items.push(i); });
        // Fusionne récurrents
        (d.recurring||[]).forEach(r => { if (!appData.recurring.find(x=>x.id===r.id)) appData.recurring.push(r); });
        // Fusionne projets
        (d.projects||[]).forEach(p => {
          const existing = appData.projects.find(x=>x.id===p.id);
          if (!existing) appData.projects.push(p);
          else Object.assign(existing, p); // mise à jour si déjà présent
        });
        if (d.inputHistory) {
          ['income','expense'].forEach(t => {
            (d.inputHistory[t]||[]).forEach(v => {
              if (!appData.inputHistory[t].includes(v)) appData.inputHistory[t].push(v);
            });
          });
        }
        const sorted = sortedPeriods();
        if (sorted.length) currentPeriodId = sorted[sorted.length-1].id;
        save(); getBSModal('importModal').hide();
        renderPeriodSelector(); updateAllUI();
        showToast('Import réussi ✓','success');
        }, 'Importer', 'bgt-btn-primary');
        return;

      } else {
        // ---- Import d'une période ----
        if (d.period && !appData.periods.find(p=>p.id===d.period.id)) appData.periods.push(d.period);
        if (d.period) currentPeriodId = d.period.id;
        const pid = d.period?.id || currentPeriodId;
        (d.income  ||[]).forEach(i => { if (!appData.items.find(x=>x.id===i.id)) appData.items.push({...i, periodId:pid}); });
        (d.expenses||[]).forEach(e => { if (!appData.items.find(x=>x.id===e.id)) appData.items.push({...e, periodId:pid}); });
        (d.recurring||[]).forEach(r => { if (!appData.recurring.find(x=>x.id===r.id)) appData.recurring.push(r); });
        // Import projets (merge)
        (d.projects||[]).forEach(p => {
          const { _allocForPeriod, ...cleanProj } = p;
          const existing = appData.projects.find(x=>x.id===cleanProj.id);
          if (!existing) appData.projects.push({...cleanProj, paused: cleanProj.paused||{}});
          else {
            // Fusionner les allocations
            Object.assign(existing.allocations||{}, cleanProj.allocations||{});
          }
        });
      }

      save();
      getBSModal('importModal').hide();
      renderPeriodSelector(); updateAllUI();
      showToast('Import réussi ✓','success');
    } catch(err) {
      console.error(err);
      showToast('Erreur d\'importation : ' + err.message,'danger');
    }
  };
  r.readAsText(file);
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file || !currentPeriodId) { showToast('Créez une période d\'abord.','danger'); return; }
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d = file.name.endsWith('.json') ? JSON.parse(ev.target.result) : parseCSV(ev.target.result);
      (d.income  ||[]).forEach(i => appData.items.push({...i, id:genId(), periodId:currentPeriodId, type:'income'}));
      (d.expenses||[]).forEach(e => appData.items.push({...e, id:genId(), periodId:currentPeriodId, type:'expense', status:e.status||'completed'}));
      save(); updateAllUI(); showToast('Fichier importé ✓','success');
    } catch { showToast('Fichier invalide','danger'); }
  };
  r.readAsText(file);
}

function parseCSV(content) {
  const d = { income:[], expenses:[] };
  content.split('\n').forEach(line => {
    if (!line.trim()) return;
    const [name, amount, date, category] = line.split('|').map(s => s.trim());
    if (!name || !amount) return;
    if (!category || category.toLowerCase() === 'revenu')
      d.income.push({name, amount:parseFloat(amount), date});
    else
      d.expenses.push({name, amount:parseFloat(amount), date, category, isFixed:false, status:'completed'});
  });
  return d;
}

function generatePDFReport() {
  generateReport();
  if (typeof html2pdf === 'undefined') { showToast('html2pdf non disponible','danger'); return; }
  html2pdf().set({
    margin: 10, filename: 'rapport-' + (currentPeriodId||'export') + '.pdf',
    image: {type:'jpeg', quality:.98}, html2canvas: {scale:2},
    jsPDF: {orientation:'portrait', unit:'mm', format:'a4'}
  }).from(document.getElementById('reportContent')).save();
}