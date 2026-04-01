'use strict';
/* ============================================================
   BUDGE v4.2 — toast.js
   Notifications toast Bootstrap
   ============================================================ */

function showToast(msg, type='info') {
  const toastEl = document.getElementById('liveToast');
  const body    = document.getElementById('toastBody');
  toastEl.className = `toast align-items-center border-0 text-white bg-${type==='danger'?'danger':type==='success'?'success':type==='warning'?'warning':'info'}`;
  body.textContent  = msg;
  bootstrap.Toast.getOrCreateInstance(toastEl, {delay:3000}).show();
}
