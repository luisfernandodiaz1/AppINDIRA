/* ═══════════════════════════════════════════════════════════════════
   modules/dashboard.js – KPI Grid · Filtros · Equidad · Alertas
   Transportes CI – Sistema de Turnos
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

window.TCI = window.TCI || {};

TCI.Dashboard = (() => {

  const DM  = () => TCI.DataManager;
  const SC  = () => TCI.Scheduler;
  const U   = () => TCI.Utils;

  /* ── KPI Grid ── */
  function renderKPIGrid(drivers, wk, cfg, searchText, hoursFilter) {
    const grid = document.getElementById('kpi-grid');
    const monday = U().weekKeyToDate(wk) || U().getMondayOfWeek(new Date());

    let filtered = drivers;

    // Filtro por texto
    if (searchText) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(d => d.name.toLowerCase().includes(q));
    }

    // Filtro por estado de horas
    if (hoursFilter && hoursFilter !== 'all') {
      filtered = filtered.filter(d => {
        const h  = SC().weekHours(d.id, wk, cfg);
        const st = SC().hoursStatus(h, cfg.weeklyTarget);
        return st === hoursFilter;
      });
    }

    if (!filtered.length) {
      grid.innerHTML = `<p class="placeholder-text" style="grid-column:1/-1">
        ${drivers.length ? 'Sin resultados para los filtros aplicados.' : 'Agrega conductores para ver el resumen.'}
      </p>`;
      return;
    }

    grid.innerHTML = filtered.map(driver => {
      const wkH    = SC().weekHours(driver.id, wk, cfg);
      const status = SC().hoursStatus(wkH, cfg.weeklyTarget);
      const pct    = Math.min((wkH / cfg.weeklyTarget) * 100, 100).toFixed(1);
      const moH    = SC().monthHours(driver.id, monday.getFullYear(), monday.getMonth(), cfg);
      const moSt   = SC().hoursStatus(moH, cfg.monthlyTarget, 8);
      const moBdg  = moSt === 'ok' ? 'success' : moSt === 'over' ? 'danger' : 'warning';
      const moTxt  = moSt === 'ok' ? '✓ OK'    : moSt === 'over' ? 'Exceso' : 'Déficit';
      return `
        <div class="kpi-card status-${status}">
          <div class="kpi-name">${driver.name}</div>
          <div class="kpi-hours ${status}">${wkH.toFixed(1)}h <small style="font-size:.85rem;font-weight:400;color:var(--text-muted)">esta semana</small></div>
          <div class="kpi-progress-track"><div class="kpi-progress-fill ${status}" style="width:${pct}%"></div></div>
          <div class="kpi-meta">Meta semana: ${cfg.weeklyTarget}h &nbsp;|&nbsp; Mes: ${moH.toFixed(0)}/${cfg.monthlyTarget}h
            <span class="badge badge-${moBdg}" style="margin-left:.4rem">${moTxt}</span>
          </div>
        </div>`;
    }).join('');
  }

  /* ── Equity ── */
  function renderEquity(drivers, wk, cfg) {
    const el = document.getElementById('equity-content');
    if (!drivers.length) { el.innerHTML = '<p class="placeholder-text">Sin datos.</p>'; return; }
    const hours = drivers.map(d => ({ name: d.name, hours: SC().weekHours(d.id, wk, cfg) })).sort((a,b)=>b.hours-a.hours);
    const max   = hours[0].hours;
    const delta = (max - hours[hours.length-1].hours).toFixed(1);
    el.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:.5rem;margin-bottom:1rem;">
        <span class="equity-delta">${delta}h</span>
        <span class="equity-label">diferencia entre el conductor con más y menos horas</span>
      </div>
      ${hours.map(h => {
        const pct = max > 0 ? (h.hours/max*100) : 0;
        return `<div class="equity-row"><span>${h.name}</span><span>${h.hours.toFixed(1)}h</span></div>
                <div class="equity-bar-track" style="margin-bottom:.6rem"><div class="equity-bar-fill" style="width:${pct}%"></div></div>`;
      }).join('')}`;
  }

  /* ── Alerts ── */
  function renderAlerts(drivers, wk, cfg) {
    const list    = document.getElementById('alerts-list');
    const countEl = document.getElementById('alert-count');
    const alerts  = [];

    SC().getSundayCompensations(drivers, cfg).forEach(c => {
      alerts.push({ type:'error', icon:'🔴', text:`<strong>${c.driverName}</strong> trabajó el domingo ${c.sundayDate} sin compensación LD.` });
    });

    const monday = U().weekKeyToDate(wk) || new Date();
    drivers.forEach(d => {
      const moH  = SC().monthHours(d.id, monday.getFullYear(), monday.getMonth(), cfg);
      const diff = moH - cfg.monthlyTarget;
      if (diff > 8)  alerts.push({ type:'error', icon:'⚠️', text:`<strong>${d.name}</strong> supera el límite mensual (${moH.toFixed(0)}h / ${cfg.monthlyTarget}h).` });
      if (diff < -16) alerts.push({ type:'warn',  icon:'🟡', text:`<strong>${d.name}</strong> en déficit mensual (${moH.toFixed(0)}h / ${cfg.monthlyTarget}h).` });
    });

    countEl.textContent = alerts.length;
    list.innerHTML = alerts.length
      ? alerts.map(a => `<div class="alert-item ${a.type==='warn'?'warn':''}"><span class="alert-icon">${a.icon}</span><span class="alert-text">${a.text}</span></div>`).join('')
      : '<p class="placeholder-text">Sin alertas activas. ✅</p>';
  }

  /* ── Inicializar filtros del Dashboard ── */
  let _activeFilter = 'all';
  let _searchText   = '';

  function initDashFilters(wk, cfg, allDrivers) {
    // Búsqueda
    const searchEl = document.getElementById('dash-search');
    if (searchEl) {
      searchEl.addEventListener('input', e => {
        _searchText = e.target.value.trim();
        renderKPIGrid(allDrivers, wk, cfg, _searchText, _activeFilter);
      });
    }

    // Chips de filtro
    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _activeFilter = btn.dataset.filter;
        renderKPIGrid(allDrivers, wk, cfg, _searchText, _activeFilter);
      });
    });
  }

  /* ── Render principal ── */
  function renderDashboard(wk, cfg) {
    const allDrivers = DM().getDrivers().filter(d => d.status !== 'inactive');
    const monday     = U().weekKeyToDate(wk) || U().getMondayOfWeek(new Date());
    document.getElementById('dash-week-label').textContent = U().weekLabel(monday);

    renderKPIGrid(allDrivers, wk, cfg, _searchText, _activeFilter);
    renderEquity(allDrivers, wk, cfg);
    renderAlerts(allDrivers, wk, cfg);
    initDashFilters(wk, cfg, allDrivers);
  }

  return { renderDashboard };
})();
