/* ═══════════════════════════════════════════════════════════════════
   utils.js – Utilidades de fechas, formato, toast y selector de mes
   Transportes CI – Sistema de Turnos
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

window.TCI = window.TCI || {};

TCI.Utils = (() => {

  function getMondayOfWeek(date) {
    const d   = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function weekKey(monday) {
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function weekKeyToDate(key) {
    if (!key) return null;
    const [y, m, d] = key.split('-').map(Number);
    if (!y) return null;
    return new Date(y, m - 1, d);
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function formatDate(date, opts = {}) {
    return date.toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric', ...opts });
  }

  function weekLabel(mondayDate) {
    return `${formatDate(mondayDate)} – ${formatDate(addDays(mondayDate, 6))}`;
  }

  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  function toast(msg, type = 'info', duration = 3500) {
    const icons = { success:'✅', error:'❌', warn:'⚠️', info:'ℹ️' };
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
    container.prepend(el);
    setTimeout(() => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
  }

  function populateMonthSelector() {
    const sel = document.getElementById('report-month');
    const now = new Date();
    sel.innerHTML = '';
    for (let i = -6; i <= 3; i++) {
      const d     = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${TCI.MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
      const opt   = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if (i === 0) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  return { getMondayOfWeek, weekKey, weekKeyToDate, addDays, formatDate, weekLabel, initials, toast, populateMonthSelector };
})();
