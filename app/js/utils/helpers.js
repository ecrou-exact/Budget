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
