'use strict';
/* ============================================================
   BUDGE v4.2 — tabs.js
   Navigation par onglets
   ============================================================ */

document.querySelectorAll('#mainTabs .nav-link').forEach(btn => {
  btn.addEventListener('click', function() {
    const tab = this.dataset.tab;
    document.querySelectorAll('#mainTabs .nav-link').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById(tab).classList.add('active');
    setTimeout(() => {
      if      (tab === 'analytics') updateAnalyticsCharts();
      else if (tab === 'annual')    updateAnnualView();
      else if (tab === 'report')    generateReport();
      else if (tab === 'projects')  renderProjects();
      else if (tab === 'history')   renderHistory();
      Object.values(charts).forEach(c => c?.resize?.());
    }, 60);
  });
});

function goToTab(tabId) {
  document.querySelectorAll('#mainTabs .nav-link').forEach(tab => {
    if (tab.getAttribute('data-tab') === tabId) tab.click();
  });
}
