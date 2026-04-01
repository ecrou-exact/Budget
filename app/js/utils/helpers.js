'use strict';
/* ============================================================
   BUDGE v4.2 — helpers.js
   Fonctions utilitaires génériques
   ============================================================ */

function genId()        { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function getPeriod(id)  { return appData.periods.find(p => p.id === id) || null; }
function sortedPeriods(){ return [...appData.periods].sort((a,b) => new Date(a.startDate)-new Date(b.startDate)); }
function getPeriodItems(pid)    { return appData.items.filter(i => i.periodId === pid); }
function getPeriodIncome(pid)   { return getPeriodItems(pid).filter(i => i.type === 'income'); }
function getPeriodExpenses(pid) { return getPeriodItems(pid).filter(i => i.type === 'expense'); }
function sumAmount(arr) { return arr.reduce((s,i) => s + (parseFloat(i.amount)||0), 0); }
function escHtml(s)     { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDateFR(d) { if (!d) return '—'; return new Date(d+'T00:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function shortPeriodDates(p) { if (!p) return ''; return formatDateFR(p.startDate)+' → '+(p.endDate?formatDateFR(p.endDate):'En cours'); }
function formatAmount(n) { const abs=Math.abs(n); return (n<0?'−':'')+abs.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'; }
function getOpenPeriod() { return appData.periods.find(p => !p.endDate) || null; }
function hasOpenPeriod() { return !!getOpenPeriod(); }

// ============================================================
// CONFIRM — remplace window.confirm() incompatible avec Electron
// Usage : bgtConfirm('Message ?', () => { /* action */ });
// ============================================================
function bgtConfirm(message, onYes, labelYes, styleYes) {
  const id  = 'bgt-confirm-modal';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'modal fade';
    el.setAttribute('tabindex', '-1');
    el.setAttribute('data-bs-backdrop', 'static');
    document.body.appendChild(el);
  }
  el.innerHTML =
    '<div class="modal-dialog modal-dialog-centered modal-sm">'
    + '<div class="modal-content bgt-modal">'
    + '<div class="modal-body p-4" style="text-align:center">'
    + '<i class="fa-solid fa-triangle-exclamation fa-xl mb-3 d-block" style="color:var(--bgt-warning)"></i>'
    + '<p style="font-size:.9rem;margin-bottom:1.2rem">' + message + '</p>'
    + '<div class="d-flex gap-2 justify-content-center">'
    + '<button class="btn bgt-btn-secondary" id="bgt-confirm-no">Annuler</button>'
    + '<button class="btn ' + (styleYes || 'btn-danger') + '" id="bgt-confirm-yes">' + (labelYes || 'Confirmer') + '</button>'
    + '</div></div></div></div>';
  const modal = new bootstrap.Modal(el);
  modal.show();
  document.getElementById('bgt-confirm-no').onclick  = () => modal.hide();
  document.getElementById('bgt-confirm-yes').onclick = () => { modal.hide(); onYes(); };
}