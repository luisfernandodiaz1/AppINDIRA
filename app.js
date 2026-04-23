/* ═══════════════════════════════════════════════════════════════════
   TRANSPORTES CI – SISTEMA DE TURNOS
   app.js – Módulo principal (ES6 Vanilla JS)
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════
   1. CONSTANTS & CONFIG
══════════════════════════════════════════════════════ */
const SHIFT_TYPES = ['', 'D', 'N', 'L', 'LD', 'HLD', 'HLN'];
const SHIFT_LABELS = {
  '':    '—',
  D:     'Día (D)',
  N:     'Noche (N)',
  L:     'Libre (L)',
  LD:    'Libre Desc. (LD)',
  HLD:   'Holgura D (HLD)',
  HLN:   'Holgura N (HLN)',
};

const DAYS_SHORT  = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAYS_FULL   = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const STATUS_LABELS = { active: 'Activo', inactive: 'Inactivo', vacation: 'Vacaciones' };
const STATUS_CLASSES = { active: 'status-active', inactive: 'status-inactive', vacation: 'status-vacation' };

const STORAGE_KEYS = {
  drivers:  'tci_drivers',
  schedule: 'tci_schedule',
  config:   'tci_config',
};

const DEFAULT_CONFIG = {
  company:        'Transportes CI',
  shiftDStart:    '07:00',
  shiftDEnd:      '17:00',
  shiftNStart:    '19:00',
  shiftNEnd:      '05:00',
  monthlyTarget:  184,
  weeklyTarget:   46,
  regulationYear: '2025',
};

/* ══════════════════════════════════════════════════════
   2. DATA MANAGER – LocalStorage CRUD
══════════════════════════════════════════════════════ */
const DataManager = (() => {

  /* ── Config ── */
  function getConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.config);
      return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : { ...DEFAULT_CONFIG };
    } catch { return { ...DEFAULT_CONFIG }; }
  }
  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(cfg));
  }

  /* ── Drivers ── */
  function getDrivers() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.drivers) || '[]');
    } catch { return []; }
  }
  function saveDrivers(drivers) {
    localStorage.setItem(STORAGE_KEYS.drivers, JSON.stringify(drivers));
  }
  function addDriver(driver) {
    const drivers = getDrivers();
    driver.id = 'drv_' + Date.now();
    driver.createdAt = new Date().toISOString();
    drivers.push(driver);
    saveDrivers(drivers);
    return driver;
  }
  function updateDriver(id, data) {
    const drivers = getDrivers();
    const idx = drivers.findIndex(d => d.id === id);
    if (idx === -1) return null;
    drivers[idx] = { ...drivers[idx], ...data };
    saveDrivers(drivers);
    return drivers[idx];
  }
  function deleteDriver(id) {
    const drivers = getDrivers().filter(d => d.id !== id);
    saveDrivers(drivers);
    // Remove all schedules for this driver
    const schedule = getSchedule();
    Object.keys(schedule).forEach(wk => {
      if (schedule[wk][id]) delete schedule[wk][id];
    });
    saveSchedule(schedule);
  }

  /* ── Schedule ── */
  // schedule[weekKey][driverId][dayIndex 0-6] = shiftType string
  function getSchedule() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.schedule) || '{}');
    } catch { return {}; }
  }
  function saveSchedule(schedule) {
    localStorage.setItem(STORAGE_KEYS.schedule, JSON.stringify(schedule));
  }
  function getWeekSchedule(weekKey) {
    const schedule = getSchedule();
    return schedule[weekKey] || {};
  }
  function setShift(weekKey, driverId, dayIndex, shiftType) {
    const schedule = getSchedule();
    if (!schedule[weekKey]) schedule[weekKey] = {};
    if (!schedule[weekKey][driverId]) schedule[weekKey][driverId] = {};
    schedule[weekKey][driverId][dayIndex] = shiftType;
    saveSchedule(schedule);
  }
  function setWeekSchedule(weekKey, weekData) {
    const schedule = getSchedule();
    schedule[weekKey] = weekData;
    saveSchedule(schedule);
  }

  return {
    getConfig, saveConfig,
    getDrivers, addDriver, updateDriver, deleteDriver,
    getSchedule, getWeekSchedule, setShift, setWeekSchedule,
  };
})();

/* ══════════════════════════════════════════════════════
   3. SCHEDULER – Hours logic & distribution
══════════════════════════════════════════════════════ */
const Scheduler = (() => {

  /** Return hours for a given shift type */
  function shiftHours(type, cfg) {
    switch (type) {
      case 'D':   return calcHours(cfg.shiftDStart, cfg.shiftDEnd);
      case 'N':   return calcHours(cfg.shiftNStart, cfg.shiftNEnd);
      case 'HLD': return calcHours(cfg.shiftDStart, cfg.shiftDEnd);
      case 'HLN': return calcHours(cfg.shiftNStart, cfg.shiftNEnd);
      default:    return 0; // L, LD, ''
    }
  }

  /** Calculate hours between two HH:MM strings (handles overnight) */
  function calcHours(start, end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let startMins = sh * 60 + sm;
    let endMins   = eh * 60 + em;
    if (endMins <= startMins) endMins += 24 * 60; // overnight
    return (endMins - startMins) / 60;
  }

  /** Total hours for a driver in a given week */
  function weekHours(driverId, weekKey, cfg) {
    const weekSched = DataManager.getWeekSchedule(weekKey);
    const days = weekSched[driverId] || {};
    let total = 0;
    for (let d = 0; d < 7; d++) {
      total += shiftHours(days[d] || '', cfg);
    }
    return total;
  }

  /** Total hours for a driver in a given month (all weeks that overlap) */
  function monthHours(driverId, year, month, cfg) {
    const schedule = DataManager.getSchedule();
    let total = 0;
    Object.keys(schedule).forEach(wk => {
      const monday = weekKeyToDate(wk);
      if (!monday) return;
      // check if any day of this week is in the target month
      for (let d = 0; d < 7; d++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + d);
        if (day.getFullYear() === year && day.getMonth() === month) {
          const shift = (schedule[wk][driverId] || {})[d] || '';
          total += shiftHours(shift, cfg);
        }
      }
    });
    return total;
  }

  /** Check if driver worked a sunday without LD the following week */
  function getSundayCompensations(drivers, cfg) {
    const schedule = DataManager.getSchedule();
    const results = [];
    const weekKeys = Object.keys(schedule).sort();

    weekKeys.forEach((wk, wkIdx) => {
      drivers.forEach(driver => {
        const days = (schedule[wk][driver.id] || {});
        const sundayShift = days[6] || '';
        if (sundayShift === 'D' || sundayShift === 'N' || sundayShift === 'HLD' || sundayShift === 'HLN') {
          // needs LD in the next week
          const nextWk = weekKeys[wkIdx + 1];
          let compensated = false;
          if (nextWk) {
            const nextDays = (schedule[nextWk][driver.id] || {});
            compensated = Object.values(nextDays).includes('LD');
          }
          if (!compensated) {
            const sundayDate = weekKeyToDate(wk);
            if (sundayDate) {
              sundayDate.setDate(sundayDate.getDate() + 6);
            }
            results.push({
              driverId:   driver.id,
              driverName: driver.name,
              weekKey:    wk,
              sundayDate: sundayDate ? formatDate(sundayDate) : wk,
              shift:      sundayShift,
              compensated,
            });
          }
        }
      });
    });
    return results;
  }

  /**
   * Auto-suggest a balanced distribution for a given week.
   * Strategy: assign each driver shifts such that their accumulated hours
   * stay as close to the weekly target as possible, while respecting
   * the rule that Sunday must be 'L' unless compensating.
   */
  function suggestWeek(weekKey, drivers, cfg) {
    if (!drivers.length) return {};
    const weekTarget = cfg.weeklyTarget;
    const newSched = {};

    // Compute existing monthly hours per driver (for equity)
    const monthlyHours = {};
    drivers.forEach(d => {
      // use current month of the monday
      const monday = weekKeyToDate(weekKey);
      const y = monday ? monday.getFullYear() : new Date().getFullYear();
      const m = monday ? monday.getMonth() : new Date().getMonth();
      monthlyHours[d.id] = monthHours(d.id, y, m, cfg);
    });

    // Sort drivers by accumulated hours ascending (give more to those with less)
    const sorted = [...drivers].sort((a, b) => monthlyHours[a.id] - monthlyHours[b.id]);

    const shiftOptions = ['D', 'N', 'L'];
    let dayToggle = 0; // alternate D and N across drivers

    sorted.forEach((driver, i) => {
      newSched[driver.id] = {};
      let hoursLeft = weekTarget;
      // Mon–Sat (0–5)
      for (let d = 0; d < 6; d++) {
        const hD = shiftHours('D', cfg);
        const hN = shiftHours('N', cfg);
        if (hoursLeft >= hD) {
          // alternate D and N evenly
          const pick = ((i + d) % 2 === 0) ? 'D' : 'N';
          newSched[driver.id][d] = pick;
          hoursLeft -= shiftHours(pick, cfg);
        } else {
          newSched[driver.id][d] = 'L';
        }
      }
      // Sunday = L (rest)
      newSched[driver.id][6] = 'L';
    });

    return newSched;
  }

  /** Status: 'ok' | 'over' | 'under' */
  function hoursStatus(hours, target, tolerance = 4) {
    if (hours > target + tolerance) return 'over';
    if (hours < target - tolerance) return 'under';
    return 'ok';
  }

  return { shiftHours, calcHours, weekHours, monthHours, getSundayCompensations, suggestWeek, hoursStatus };
})();

/* ══════════════════════════════════════════════════════
   4. WEEK UTILITIES
══════════════════════════════════════════════════════ */
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekKey(monday) {
  const y  = monday.getFullYear();
  const m  = String(monday.getMonth() + 1).padStart(2, '0');
  const d  = String(monday.getDate()).padStart(2, '0');
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
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', ...opts });
}

function weekLabel(mondayDate) {
  const end = addDays(mondayDate, 6);
  return `${formatDate(mondayDate)} – ${formatDate(end)}`;
}

/* ══════════════════════════════════════════════════════
   5. UI RENDERER
══════════════════════════════════════════════════════ */
const UI = (() => {

  /* ── Toast ── */
  function toast(msg, type = 'info', duration = 3500) {
    const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
    container.prepend(el);
    setTimeout(() => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove());
    }, duration);
  }

  /* ── Initials avatar ── */
  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  /* ── KPI Grid (Dashboard) ── */
  function renderKPIGrid(drivers, currentWeekKey, cfg) {
    const grid = document.getElementById('kpi-grid');
    if (!drivers.length) {
      grid.innerHTML = '<p class="placeholder-text" style="grid-column:1/-1">Agrega conductores para ver el resumen.</p>';
      return;
    }

    grid.innerHTML = drivers.map(driver => {
      const wkHours  = Scheduler.weekHours(driver.id, currentWeekKey, cfg);
      const wkTarget = cfg.weeklyTarget;
      const status   = Scheduler.hoursStatus(wkHours, wkTarget);
      const pct      = Math.min((wkHours / wkTarget) * 100, 100).toFixed(1);

      // Monthly
      const monday = weekKeyToDate(currentWeekKey);
      const moHours  = Scheduler.monthHours(driver.id, monday.getFullYear(), monday.getMonth(), cfg);
      const moTarget = cfg.monthlyTarget;
      const moStatus = Scheduler.hoursStatus(moHours, moTarget, 8);

      return `
      <div class="kpi-card status-${status}">
        <div class="kpi-name">${driver.name}</div>
        <div class="kpi-hours ${status}">${wkHours.toFixed(1)}h <small style="font-size:.85rem;font-weight:400;color:var(--text-muted)">esta semana</small></div>
        <div class="kpi-progress-track">
          <div class="kpi-progress-fill ${status}" style="width:${pct}%"></div>
        </div>
        <div class="kpi-meta">
          Meta semana: ${wkTarget}h &nbsp;|&nbsp; Mes: ${moHours.toFixed(0)}/${moTarget}h
          <span class="badge badge-${moStatus === 'ok' ? 'success' : moStatus === 'over' ? 'danger' : 'warning'}" style="margin-left:.4rem">${moStatus === 'ok' ? '✓OK' : moStatus === 'over' ? 'Exceso' : 'Déficit'}</span>
        </div>
      </div>`;
    }).join('');
  }

  /* ── Equity Card ── */
  function renderEquity(drivers, currentWeekKey, cfg) {
    const el = document.getElementById('equity-content');
    if (!drivers.length) { el.innerHTML = '<p class="placeholder-text">Sin datos.</p>'; return; }

    const hours = drivers.map(d => ({
      name:  d.name,
      hours: Scheduler.weekHours(d.id, currentWeekKey, cfg),
    }));
    hours.sort((a, b) => b.hours - a.hours);
    const max = hours[0].hours;
    const min = hours[hours.length - 1].hours;
    const delta = (max - min).toFixed(1);

    el.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:.5rem;margin-bottom:1rem;">
        <span class="equity-delta">${delta}h</span>
        <span class="equity-label">diferencia entre conductor con más y menos horas</span>
      </div>
      ${hours.map(h => {
        const pct = max > 0 ? (h.hours / max) * 100 : 0;
        return `
        <div class="equity-row"><span>${h.name}</span><span>${h.hours.toFixed(1)}h</span></div>
        <div class="equity-bar-track" style="margin-bottom:.6rem">
          <div class="equity-bar-fill" style="width:${pct}%"></div>
        </div>`;
      }).join('')}
    `;
  }

  /* ── Alerts ── */
  function renderAlerts(drivers, currentWeekKey, cfg) {
    const list = document.getElementById('alerts-list');
    const countEl = document.getElementById('alert-count');
    const alerts = [];

    const compensations = Scheduler.getSundayCompensations(drivers, cfg);
    compensations.forEach(c => {
      alerts.push({ type: 'error', icon: '🔴', text: `<strong>${c.driverName}</strong> trabajó el domingo ${c.sundayDate} sin compensación LD asignada.` });
    });

    drivers.forEach(driver => {
      const moDate = weekKeyToDate(currentWeekKey) || new Date();
      const moHours = Scheduler.monthHours(driver.id, moDate.getFullYear(), moDate.getMonth(), cfg);
      if (moHours > cfg.monthlyTarget + 8) {
        alerts.push({ type: 'error', icon: '⚠️', text: `<strong>${driver.name}</strong> supera el límite mensual (${moHours.toFixed(0)}h / ${cfg.monthlyTarget}h).` });
      } else if (moHours < cfg.monthlyTarget - 16) {
        alerts.push({ type: 'warn', icon: '🟡', text: `<strong>${driver.name}</strong> está en déficit mensual (${moHours.toFixed(0)}h / ${cfg.monthlyTarget}h).` });
      }
    });

    countEl.textContent = alerts.length;
    if (!alerts.length) {
      list.innerHTML = '<p class="placeholder-text">Sin alertas activas. ✅</p>';
    } else {
      list.innerHTML = alerts.map(a =>
        `<div class="alert-item ${a.type === 'warn' ? 'warn' : ''}">
          <span class="alert-icon">${a.icon}</span>
          <span class="alert-text">${a.text}</span>
         </div>`
      ).join('');
    }
  }

  /* ── Planner Table ── */
  function renderPlanner(drivers, currentWeekKey, cfg) {
    const container = document.getElementById('planner-table-container');
    if (!drivers.length) {
      container.innerHTML = '<p class="placeholder-text" style="padding:2rem;">Agrega conductores para comenzar la planeación.</p>';
      return;
    }

    const weekSched = DataManager.getWeekSchedule(currentWeekKey);
    const monday = weekKeyToDate(currentWeekKey) || getMondayOfWeek(new Date());

    // Build header
    const headerCols = DAYS_SHORT.map((day, i) => {
      const date = addDays(monday, i);
      const isSunday = i === 6;
      return `<th class="${isSunday ? 'day-sunday' : ''}">${day}<br><small style="font-weight:400;font-size:.7rem">${formatDate(date, { day:'2-digit', month:'2-digit' })}</small></th>`;
    }).join('');

    // Build rows
    const rows = drivers.map(driver => {
      const driverSched = weekSched[driver.id] || {};
      let weekTotal = 0;

      const cells = Array.from({ length: 7 }, (_, d) => {
        const isSunday = d === 6;
        const current = driverSched[d] || '';
        weekTotal += Scheduler.shiftHours(current, cfg);

        const options = SHIFT_TYPES.map(t =>
          `<option value="${t}" ${t === current ? 'selected' : ''}>${t || '—'}</option>`
        ).join('');

        const cellClass = current ? `shift-cell-${current}` : '';
        const sundayWorked = isSunday && ['D','N','HLD','HLN'].includes(current);

        return `<td class="${cellClass}${isSunday ? ' sunday-col' : ''}" data-driver="${driver.id}" data-day="${d}">
          <select class="shift-select" data-driver="${driver.id}" data-day="${d}" aria-label="Turno ${driver.name} ${DAYS_FULL[d]}">
            ${options}
          </select>
          ${sundayWorked ? '<span class="sunday-alarm">⚠️ Dom</span>' : ''}
        </td>`;
      }).join('');

      const status = Scheduler.hoursStatus(weekTotal, cfg.weeklyTarget);
      return `
        <tr>
          <td class="driver-cell">
            <span class="semaphore ${status}"></span>
            ${driver.name}
            <div class="driver-cell-sub">${driver.cedula || ''}</div>
          </td>
          ${cells}
          <td class="hours-cell hours-${status}">${weekTotal.toFixed(1)}h</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <table class="planner-table" role="grid" aria-label="Planeador semanal de turnos">
        <thead>
          <tr>
            <th style="text-align:left;min-width:140px;">Conductor</th>
            ${headerCols}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    // Attach change listeners
    container.querySelectorAll('.shift-select').forEach(sel => {
      sel.addEventListener('change', e => {
        const driverId  = e.target.dataset.driver;
        const dayIndex  = parseInt(e.target.dataset.day, 10);
        const shiftType = e.target.value;
        DataManager.setShift(currentWeekKey, driverId, dayIndex, shiftType);
        renderPlanner(drivers, currentWeekKey, cfg);
        renderDashboard(currentWeekKey, cfg);
      });
    });
  }

  /* ── Drivers Grid ── */
  function renderDrivers(filterText = '') {
    const grid = document.getElementById('drivers-grid');
    let drivers = DataManager.getDrivers();
    if (filterText) {
      const q = filterText.toLowerCase();
      drivers = drivers.filter(d => d.name.toLowerCase().includes(q) || (d.cedula || '').includes(q));
    }
    if (!drivers.length) {
      grid.innerHTML = filterText
        ? '<p class="placeholder-text">Sin resultados para tu búsqueda.</p>'
        : '<p class="placeholder-text">No hay conductores registrados. Agrega el primero.</p>';
      return;
    }
    grid.innerHTML = drivers.map(d => {
      const cfg = DataManager.getConfig();
      const currentWk = weekKey(getMondayOfWeek(new Date()));
      const wkH = Scheduler.weekHours(d.id, currentWk, cfg);
      const moDate = getMondayOfWeek(new Date());
      const moH = Scheduler.monthHours(d.id, moDate.getFullYear(), moDate.getMonth(), cfg);
      const moPct = Math.min((moH / cfg.monthlyTarget) * 100, 100).toFixed(0);
      const moStatus = Scheduler.hoursStatus(moH, cfg.monthlyTarget, 8);

      return `
      <div class="driver-card" data-driver-id="${d.id}">
        <div class="driver-card-header">
          <div class="driver-avatar">${initials(d.name)}</div>
          <div class="driver-info">
            <div class="driver-name">${d.name}</div>
            <div class="driver-cedula">${d.cedula || 'Sin cédula'}</div>
          </div>
          <div class="driver-actions">
            <button class="btn-icon" data-action="edit" data-id="${d.id}" title="Editar conductor" aria-label="Editar ${d.name}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" data-action="delete" data-id="${d.id}" title="Eliminar conductor" aria-label="Eliminar ${d.name}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>

        <div style="display:flex;gap:.5rem;align-items:center;">
          <span class="status-badge ${STATUS_CLASSES[d.status] || 'status-active'}">${STATUS_LABELS[d.status] || 'Activo'}</span>
          <span style="font-size:.75rem;color:var(--text-muted)">Lic. ${d.license || '—'}</span>
        </div>

        <div class="driver-meta">
          <div class="driver-meta-item"><span class="driver-meta-label">Ingreso</span><br><span class="driver-meta-value">${d.startDate ? formatDate(new Date(d.startDate + 'T00:00:00')) : '—'}</span></div>
          <div class="driver-meta-item"><span class="driver-meta-label">Sem. actual</span><br><span class="driver-meta-value" style="color:var(--green-500)">${wkH.toFixed(1)}h</span></div>
        </div>

        <div class="driver-hours-bar">
          <div class="driver-hours-row">
            <span class="driver-hours-label">Horas mes</span>
            <span class="driver-hours-value" style="color:var(--${moStatus==='ok'?'green-500':moStatus==='over'?'red-400':'orange-400'})">${moH.toFixed(0)} / ${cfg.monthlyTarget}h</span>
          </div>
          <div class="kpi-progress-track">
            <div class="kpi-progress-fill ${moStatus}" style="width:${moPct}%"></div>
          </div>
        </div>
      </div>`;
    }).join('');

    // Attach edit/delete
    grid.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        const action = btn.dataset.action;
        const id     = btn.dataset.id;
        if (action === 'edit')   openDriverModal(id);
        if (action === 'delete') confirmDeleteDriver(id);
      });
    });
  }

  /* ── Reports ── */
  function renderReports(yearMonth) {
    const cfg = DataManager.getConfig();
    const drivers = DataManager.getDrivers();
    const [year, month] = yearMonth.split('-').map(Number);

    // Monthly hours table
    const tableWrapper = document.getElementById('report-table-wrapper');
    if (!drivers.length) {
      tableWrapper.innerHTML = '<p class="placeholder-text">Sin conductores registrados.</p>';
    } else {
      const rows = drivers.map(d => {
        const moH   = Scheduler.monthHours(d.id, year, month - 1, cfg);
        const pct   = Math.min((moH / cfg.monthlyTarget) * 100, 100).toFixed(0);
        const status = Scheduler.hoursStatus(moH, cfg.monthlyTarget, 8);
        const diff  = (moH - cfg.monthlyTarget).toFixed(1);
        return `
        <tr>
          <td style="font-weight:600">${d.name}</td>
          <td>${d.cedula || '—'}</td>
          <td>${moH.toFixed(1)}h</td>
          <td>
            <div class="progress-bar">
              <div class="progress-track"><div class="progress-fill ${status}" style="width:${pct}%"></div></div>
              <span class="progress-label" style="color:var(--${status==='ok'?'green-500':status==='over'?'red-400':'orange-400'})">${pct}%</span>
            </div>
          </td>
          <td style="color:var(--${status==='ok'?'green-500':status==='over'?'red-400':'orange-400'})">
            ${diff > 0 ? '+' : ''}${diff}h
          </td>
          <td><span class="badge badge-${status==='ok'?'success':status==='over'?'danger':'warning'}">${status==='ok'?'OK':status==='over'?'Exceso':'Déficit'}</span></td>
        </tr>`;
      }).join('');

      tableWrapper.innerHTML = `
        <table class="report-table" aria-label="Reporte mensual de horas">
          <thead>
            <tr>
              <th>Conductor</th><th>Cédula</th><th>Horas</th><th>Progreso</th><th>Diferencia</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    // Compensations
    const compList = document.getElementById('compensation-list');
    const comps = Scheduler.getSundayCompensations(drivers, cfg);
    if (!comps.length) {
      compList.innerHTML = '<p class="placeholder-text">Sin compensaciones pendientes. ✅</p>';
    } else {
      compList.innerHTML = comps.map(c => `
        <div class="comp-item">
          <div>
            <div class="comp-driver">${c.driverName}</div>
            <div class="comp-date">Domingo trabajado: ${c.sundayDate}</div>
          </div>
          <span class="comp-badge">LD Pendiente</span>
        </div>
      `).join('');
    }
  }

  /* ── Dashboard composite ── */
  function renderDashboard(currentWeekKey, cfg) {
    const drivers = DataManager.getDrivers().filter(d => d.status !== 'inactive');
    renderKPIGrid(drivers, currentWeekKey, cfg);
    renderEquity(drivers, currentWeekKey, cfg);
    renderAlerts(drivers, currentWeekKey, cfg);
    document.getElementById('dash-week-label').textContent =
      weekLabel(weekKeyToDate(currentWeekKey) || getMondayOfWeek(new Date()));
  }

  return { toast, renderDashboard, renderPlanner, renderDrivers, renderReports };
})();

/* ══════════════════════════════════════════════════════
   6. DRIVER MODAL
══════════════════════════════════════════════════════ */
function openDriverModal(editId = null) {
  const modal  = document.getElementById('modal-driver');
  const title  = document.getElementById('modal-driver-title');
  const idInp  = document.getElementById('driver-id');
  const nameInp = document.getElementById('driver-name');
  const cedula  = document.getElementById('driver-cedula');
  const license = document.getElementById('driver-license');
  const start   = document.getElementById('driver-start');
  const status  = document.getElementById('driver-status');

  if (editId) {
    const driver = DataManager.getDrivers().find(d => d.id === editId);
    if (!driver) return;
    title.textContent   = 'Editar Conductor';
    idInp.value         = driver.id;
    nameInp.value       = driver.name;
    cedula.value        = driver.cedula || '';
    license.value       = driver.license || 'C2';
    start.value         = driver.startDate || '';
    status.value        = driver.status || 'active';
  } else {
    title.textContent   = 'Agregar Conductor';
    idInp.value         = '';
    nameInp.value       = '';
    cedula.value        = '';
    license.value       = 'C2';
    start.value         = '';
    status.value        = 'active';
  }
  modal.classList.remove('hidden');
  nameInp.focus();
}

function closeDriverModal() {
  document.getElementById('modal-driver').classList.add('hidden');
}

function saveDriver() {
  const id     = document.getElementById('driver-id').value;
  const name   = document.getElementById('driver-name').value.trim();
  const cedula = document.getElementById('driver-cedula').value.trim();

  if (!name) { UI.toast('El nombre del conductor es obligatorio.', 'error'); return; }

  const data = {
    name,
    cedula,
    license:   document.getElementById('driver-license').value,
    startDate: document.getElementById('driver-start').value,
    status:    document.getElementById('driver-status').value,
  };

  if (id) {
    DataManager.updateDriver(id, data);
    UI.toast(`Conductor "${name}" actualizado.`, 'success');
  } else {
    DataManager.addDriver(data);
    UI.toast(`Conductor "${name}" agregado.`, 'success');
  }

  closeDriverModal();
  UI.renderDrivers(document.getElementById('driver-search').value);
  refreshAll();
}

function confirmDeleteDriver(id) {
  const driver = DataManager.getDrivers().find(d => d.id === id);
  if (!driver) return;
  if (!window.confirm(`¿Eliminar al conductor "${driver.name}"? Esta acción no se puede deshacer.`)) return;
  DataManager.deleteDriver(id);
  UI.toast(`Conductor "${driver.name}" eliminado.`, 'warn');
  UI.renderDrivers(document.getElementById('driver-search').value);
  refreshAll();
}

/* ══════════════════════════════════════════════════════
   7. CONFIG MODULE
══════════════════════════════════════════════════════ */
function loadConfigUI() {
  const cfg = DataManager.getConfig();
  document.getElementById('cfg-company').value           = cfg.company;
  document.getElementById('cfg-d-start').value           = cfg.shiftDStart;
  document.getElementById('cfg-d-end').value             = cfg.shiftDEnd;
  document.getElementById('cfg-n-start').value           = cfg.shiftNStart;
  document.getElementById('cfg-n-end').value             = cfg.shiftNEnd;
  document.getElementById('cfg-monthly-target').value    = cfg.monthlyTarget;
  document.getElementById('cfg-weekly-target').value     = cfg.weeklyTarget;
  document.getElementById('cfg-reg-year').value          = cfg.regulationYear;
}

function saveConfig() {
  const cfg = {
    company:        document.getElementById('cfg-company').value.trim() || 'Transportes CI',
    shiftDStart:    document.getElementById('cfg-d-start').value,
    shiftDEnd:      document.getElementById('cfg-d-end').value,
    shiftNStart:    document.getElementById('cfg-n-start').value,
    shiftNEnd:      document.getElementById('cfg-n-end').value,
    monthlyTarget:  parseInt(document.getElementById('cfg-monthly-target').value, 10) || 184,
    weeklyTarget:   parseInt(document.getElementById('cfg-weekly-target').value, 10) || 46,
    regulationYear: document.getElementById('cfg-reg-year').value,
  };
  DataManager.saveConfig(cfg);
  document.querySelector('.brand-name').textContent = cfg.company;
  UI.toast('Configuración guardada correctamente.', 'success');
  refreshAll();
}

function resetConfig() {
  DataManager.saveConfig({ ...DEFAULT_CONFIG });
  loadConfigUI();
  UI.toast('Configuración restaurada a los valores predeterminados.', 'info');
  refreshAll();
}

/* ══════════════════════════════════════════════════════
   8. EXCEL EXPORT
══════════════════════════════════════════════════════ */
function exportToExcel() {
  if (typeof XLSX === 'undefined') {
    UI.toast('La librería SheetJS no está disponible (requiere conexión para la primera carga).', 'error');
    return;
  }

  const cfg     = DataManager.getConfig();
  const drivers = DataManager.getDrivers();
  const sel     = document.getElementById('report-month');
  const [year, month] = sel.value.split('-').map(Number);

  const wb = XLSX.utils.book_new();

  // Sheet 1: Monthly hours
  const header = ['Conductor', 'Cédula', 'Licencia', 'Horas Mes', 'Meta', 'Diferencia', 'Estado'];
  const rows = drivers.map(d => {
    const moH    = Scheduler.monthHours(d.id, year, month - 1, cfg);
    const status = Scheduler.hoursStatus(moH, cfg.monthlyTarget, 8);
    return [d.name, d.cedula || '', d.license || '', moH.toFixed(1), cfg.monthlyTarget, (moH - cfg.monthlyTarget).toFixed(1), status === 'ok' ? 'OK' : status === 'over' ? 'Exceso' : 'Déficit'];
  });
  const ws1 = XLSX.utils.aoa_to_sheet([header, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws1, 'Horas Mensuales');

  // Sheet 2: Pending compensations
  const comps = Scheduler.getSundayCompensations(drivers, cfg);
  const header2 = ['Conductor', 'Domingo Trabajado', 'Turno', 'Estado'];
  const rows2 = comps.map(c => [c.driverName, c.sundayDate, c.shift, 'LD Pendiente']);
  const ws2 = XLSX.utils.aoa_to_sheet([header2, ...rows2]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Compensaciones');

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const filename = `Turnos_CI_${monthNames[month-1]}_${year}.xlsx`;
  XLSX.writeFile(wb, filename);
  UI.toast(`Exportado: ${filename}`, 'success');
}

/* ══════════════════════════════════════════════════════
   9. REPORT MONTH SELECTOR
══════════════════════════════════════════════════════ */
function populateMonthSelector() {
  const sel = document.getElementById('report-month');
  const now = new Date();
  sel.innerHTML = '';
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  for (let i = -6; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
    const label = `${months[d.getMonth()]} ${d.getFullYear()}`;
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}

/* ══════════════════════════════════════════════════════
   10. APP STATE & REFRESH
══════════════════════════════════════════════════════ */
let currentWeek = getMondayOfWeek(new Date());
let currentTab  = 'dashboard';

function refreshAll() {
  const cfg     = DataManager.getConfig();
  const wk      = weekKey(currentWeek);
  const drivers = DataManager.getDrivers();

  // Update weekday labels display
  document.getElementById('planner-week-label').textContent = weekLabel(currentWeek);
  document.getElementById('dash-week-label').textContent    = weekLabel(currentWeek);

  if (currentTab === 'dashboard') UI.renderDashboard(wk, cfg);
  if (currentTab === 'planner')   UI.renderPlanner(drivers.filter(d => d.status !== 'inactive'), wk, cfg);
  if (currentTab === 'drivers')   UI.renderDrivers(document.getElementById('driver-search').value);
  if (currentTab === 'reports')   UI.renderReports(document.getElementById('report-month').value);
}

/* ══════════════════════════════════════════════════════
   11. NAVIGATION
══════════════════════════════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
    btn.setAttribute('aria-current', btn.dataset.tab === tab ? 'page' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });
  currentTab = tab;
  refreshAll();
}

/* ══════════════════════════════════════════════════════
   12. BOOT
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // ── Splash ──
  const splash = document.getElementById('splash');
  const app    = document.getElementById('app');
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.classList.add('hidden');
      app.classList.remove('hidden');
    }, 400);
  }, 1800);

  // ── Nav ──
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ── Week navigation ──
  document.getElementById('btn-prev-week').addEventListener('click', () => {
    currentWeek = addDays(currentWeek, -7);
    refreshAll();
  });
  document.getElementById('btn-next-week').addEventListener('click', () => {
    currentWeek = addDays(currentWeek, 7);
    refreshAll();
  });

  // ── Auto-suggest ──
  document.getElementById('btn-suggest').addEventListener('click', () => {
    const cfg     = DataManager.getConfig();
    const drivers = DataManager.getDrivers().filter(d => d.status !== 'inactive');
    const wk      = weekKey(currentWeek);
    if (!drivers.length) { UI.toast('No hay conductores activos para distribuir.', 'warn'); return; }
    const suggestion = Scheduler.suggestWeek(wk, drivers, cfg);
    DataManager.setWeekSchedule(wk, suggestion);
    UI.renderPlanner(drivers, wk, cfg);
    UI.renderDashboard(wk, cfg);
    UI.toast('Distribución sugerida aplicada.', 'success');
  });

  // ── Add driver ──
  document.getElementById('btn-add-driver').addEventListener('click', () => openDriverModal());
  document.getElementById('btn-save-driver').addEventListener('click', saveDriver);
  document.getElementById('btn-cancel-driver').addEventListener('click', closeDriverModal);
  document.getElementById('btn-close-driver-modal').addEventListener('click', closeDriverModal);
  document.getElementById('modal-driver').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDriverModal();
  });

  // ── Driver search ──
  document.getElementById('driver-search').addEventListener('input', e => {
    UI.renderDrivers(e.target.value);
  });

  // ── Config ──
  document.getElementById('btn-save-config').addEventListener('click', saveConfig);
  document.getElementById('btn-reset-config').addEventListener('click', resetConfig);

  // ── Reports ──
  populateMonthSelector();
  document.getElementById('report-month').addEventListener('change', () => {
    UI.renderReports(document.getElementById('report-month').value);
  });
  document.getElementById('btn-export-excel').addEventListener('click', exportToExcel);
  document.getElementById('btn-print-report').addEventListener('click', () => window.print());

  // ── Company name ──
  const cfg = DataManager.getConfig();
  document.querySelector('.brand-name').textContent = cfg.company;
  loadConfigUI();

  // ── Initial render ──
  switchTab('dashboard');
});
