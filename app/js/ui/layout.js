'use strict';
/* ============================================================
   BUDGE v4.2 — layout.js
   Drag & drop des widgets (Sortable.js) + verrouillage layout
   ============================================================ */

function initSortable() {
  sortableInstances.forEach(s => s.destroy());
  sortableInstances = [];
  ['dashboardWidgets','sidebarWidgets'].forEach(cid => {
    const el = document.getElementById(cid);
    if (!el) return;
    sortableInstances.push(Sortable.create(el, {
      group:'widgets', handle:'.bgt-drag-handle', animation:180,
      ghostClass:'sortable-ghost', dragClass:'sortable-drag', disabled:layoutLocked, onEnd:saveLayout
    }));
  });
}

function toggleLayoutLock() {
  layoutLocked = !layoutLocked;
  sortableInstances.forEach(s => s.option('disabled', layoutLocked));
  document.body.classList.toggle('layout-locked', layoutLocked);
  const btn  = document.getElementById('layoutLockBtn');
  const icon = document.getElementById('layoutLockIcon');
  if (layoutLocked) {
    btn.classList.remove('unlocked');
    icon.className = 'fa-solid fa-lock';
    showToast('Layout verrouillé','info');
  } else {
    btn.classList.add('unlocked');
    icon.className = 'fa-solid fa-unlock';
    showToast('Drag & drop activé !','success');
  }
}

function saveLayout() {
  const layout = {};
  ['dashboardWidgets','sidebarWidgets'].forEach(cid => {
    const el = document.getElementById(cid);
    if (!el) return;
    layout[cid] = [...el.children].map(c => c.id);
  });
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

function restoreLayout() {
  try {
    const layout = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    Object.entries(layout).forEach(([cid, ids]) => {
      const container = document.getElementById(cid);
      if (!container) return;
      ids.forEach(wid => {
        const el = document.getElementById(wid);
        if (el && el.parentElement !== container) container.appendChild(el);
      });
    });
  } catch(e) {}
}
