/* ═══════════════════════════════════════════════════════════════════
   modules/planner.js – Tabla semanal + Filtros avanzados
   Transportes CI – Sistema de Turnos
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

window.TCI = window.TCI || {};

TCI.Planner = (() => {

  const DM = () => TCI.DataManager;
  const SC = () => TCI.Scheduler;
  const U  = () => TCI.Utils;

  let _onShiftChange = null;
  function onShiftChange(cb) { _onShiftChange = cb; }

  const CYCLE       = ['', 'D', 'N', 'L', 'LD', 'HLD', 'HLN'];
  const REST_TYPES    = new Set(['L', 'LD']);
  const WORKING_TYPES = new Set(['D', 'N', 'HLD', 'HLN']);

  const CHIP_LABEL = { '':'—', D:'D', N:'N', L:'L', LD:'LD', HLD:'HLD', HLN:'HLN' };
  const CHIP_TITLE = {
    '':'Sin turno asignado', D:'Turno Día 07–17h', N:'Turno Noche 19–05h',
    L:'Libre (Domingo)', LD:'Libre por Descanso', HLD:'Holgura Libre Día', HLN:'Holgura Libre Noche'
  };

  /* ── Estado de filtros ── */
  let _pfFilter  = 'all';
  let _pfSearch  = '';
  let _allDrivers = [];
  let _wkRef     = '';
  let _cfgRef    = null;

  /* ── Helpers ── */
  function weekSummary(dSched) {
    let cD = 0, cN = 0, cRest = 0, cHolg = 0;
    for (let d = 0; d < 7; d++) {
      const s = dSched[d] || '';
      if (s === 'D') cD++;
      else if (s === 'N') cN++;
      else if (REST_TYPES.has(s)) cRest++;
      else if (s === 'HLD' || s === 'HLN') cHolg++;
    }
    return { cD, cN, cRest, cHolg };
  }

  function chipHTML(driverId, day, current, isSunday) {
    const alarm = isSunday && WORKING_TYPES.has(current);
    return `<button class="shift-btn shift-btn-${current||'empty'}"
      data-driver="${driverId}" data-day="${day}" data-current="${current}"
      title="${CHIP_TITLE[current]||'Sin turno'}"
      aria-label="${TCI.DAYS_FULL[day]}: ${CHIP_TITLE[current]||'Sin turno'}"
    >${CHIP_LABEL[current]||'—'}${alarm?' ⚠':''}</button>`;
  }

  function summaryBadgesHTML(sum) {
    const parts = [];
    if (sum.cD    > 0) parts.push(`<span class="week-summary-chip chip-d">☀️ ${sum.cD}D</span>`);
    if (sum.cN    > 0) parts.push(`<span class="week-summary-chip chip-n">🌙 ${sum.cN}N</span>`);
    if (sum.cRest > 0) parts.push(`<span class="week-summary-chip chip-rest">💤 ${sum.cRest}L</span>`);
    if (sum.cHolg > 0) parts.push(`<span class="week-summary-chip chip-holg">⏳ ${sum.cHolg}H</span>`);
    return parts.length ? `<div class="driver-week-summary">${parts.join('')}</div>` : '<div class="driver-week-summary"></div>';
  }

  function restBadgeHTML(hasRest) {
    return hasRest ? `<span class="rest-assigned-badge" title="Ya tiene descanso esta semana">💤 Desc.</span>` : '';
  }

  /* ── Lógica de filtrado ── */
  function applyFilters(drivers, wk, cfg) {
    const weekSched = DM().getWeekSchedule(wk);
    let result = drivers;

    // Búsqueda por nombre
    if (_pfSearch) {
      const q = _pfSearch.toLowerCase();
      result = result.filter(d => d.name.toLowerCase().includes(q));
    }

    // Filtros rápidos
    switch (_pfFilter) {
      case 'norest':
        result = result.filter(d => {
          const sched = weekSched[d.id] || {};
          return !Object.values(sched).some(s => REST_TYPES.has(s));
        });
        break;
      case 'hasrest':
        result = result.filter(d => {
          const sched = weekSched[d.id] || {};
          return Object.values(sched).some(s => REST_TYPES.has(s));
        });
        break;
      case 'hasD':
        result = result.filter(d => {
          const sched = weekSched[d.id] || {};
          return Object.values(sched).includes('D');
        });
        break;
      case 'hasN':
        result = result.filter(d => {
          const sched = weekSched[d.id] || {};
          return Object.values(sched).includes('N');
        });
        break;
      case 'deficit':
        result = result.filter(d => {
          const h = SC().weekHours(d.id, wk, cfg);
          return SC().hoursStatus(h, cfg.weeklyTarget) === 'under';
        });
        break;
    }
    return result;
  }

  /* ── Actualiza contador de filas visibles ── */
  function updateFilterCount(visible, total) {
    let counter = document.getElementById('planner-filter-count');
    if (!counter) {
      const bar = document.getElementById('planner-filter-bar');
      if (bar) {
        counter = document.createElement('span');
        counter.id = 'planner-filter-count';
        counter.className = 'filter-result-count';
        bar.appendChild(counter);
      }
    }
    if (counter) {
      counter.textContent = visible < total ? `Mostrando ${visible} de ${total}` : `${total} conductores`;
    }
  }

  /* ── Actualiza Pie de Tabla (Totales Diarios) ── */
  function updateTableFooter(drivers, wk) {
    const table = document.querySelector('.planner-table');
    if (!table) return;
    const tfoot = table.querySelector('tfoot');
    if (!tfoot) return;

    const weekSched = DM().getWeekSchedule(wk);
    const filtered  = applyFilters(drivers, wk, _cfgRef);

    const totals = Array.from({length: 7}, () => ({ D: 0, N: 0, Rest: 0, Avail: 0 }));
    filtered.forEach(driver => {
      const dSched = weekSched[driver.id] || {};
      for(let d=0; d<7; d++) {
        const s = dSched[d] || '';
        if (s === 'D') totals[d].D++;
        else if (s === 'N') totals[d].N++;
        else if (REST_TYPES.has(s)) totals[d].Rest++;
        else if (s === 'HLD' || s === 'HLN') totals[d].Avail++;
      }
    });

    const todayStr = U().formatDate(new Date(), {day:'2-digit', month:'2-digit', year:'numeric'});
    const monday   = U().weekKeyToDate(wk) || U().getMondayOfWeek(new Date());

    const footerCells = totals.map((t, d) => {
      const isSunday   = d === 6;
      const date       = U().addDays(monday, d);
      const dateStr    = U().formatDate(date, {day:'2-digit', month:'2-digit', year:'numeric'});
      const isToday    = dateStr === todayStr;
      
      const badgeHTML = (count, label, color) => count > 0 
        ? `<div style="display:flex; justify-content:space-between;">
             <strong style="color:var(--${color})">${label}:</strong> <span>${count}</span>
           </div>` 
        : '';

      const content = `
        <div style="font-size: .68rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 2px; padding: 0 4px;">
          ${badgeHTML(t.D, 'D', 'blue-400')}
          ${badgeHTML(t.N, 'N', 'purple-400')}
          ${badgeHTML(t.Rest, 'L', 'green-500')}
          ${badgeHTML(t.Avail, 'H', 'yellow-400')}
        </div>`;

      return `<td class="${isSunday?'sunday-col ':''}${isToday?'today-col':''}">${content}</td>`;
    }).join('');

    tfoot.innerHTML = `
      <tr>
        <td class="driver-cell" style="font-weight:700; font-size:.75rem; border-top: 2px solid var(--border-default);">
          <div style="display: flex; align-items: center; justify-content: space-between;">
             Totales<br>Diarios
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="color:var(--text-muted)"><polyline points="18 15 12 9 6 15"/></svg>
          </div>
        </td>
        ${footerCells}
        <td style="border-top: 2px solid var(--border-default);"></td>
      </tr>
    `;
  }

  /* ── Actualiza UNA celda sin re-render ── */
  function updateCell(btn, wk, cfg, drivers) {
    const driverId = btn.dataset.driver;
    const day      = parseInt(btn.dataset.day, 10);
    const current  = btn.dataset.current || '';
    const isSunday = day === 6;

    const dSched    = DM().getWeekSchedule(wk)[driverId] || {};
    const restCount = Object.values(dSched).filter(s => REST_TYPES.has(s)).length;

    const nextIdx = (CYCLE.indexOf(current) + 1) % CYCLE.length;
    const next    = CYCLE[nextIdx];

    if (REST_TYPES.has(next) && !REST_TYPES.has(current) && restCount >= 1) {
      const driver = (drivers || []).find(d => d.id === driverId);
      const name   = driver ? driver.name.split(' ')[0] : 'Este conductor';
      U().toast(`⚠️ ${name} ya tiene descanso asignado esta semana.`, 'warn', 4000);
    }

    DM().setShift(wk, driverId, day, next);
    btn.dataset.current = next;
    btn.className       = `shift-btn shift-btn-${next||'empty'}`;
    btn.title           = CHIP_TITLE[next] || 'Sin turno';
    btn.setAttribute('aria-label', `${TCI.DAYS_FULL[day]}: ${CHIP_TITLE[next]||'Sin turno'}`);
    btn.textContent     = (CHIP_LABEL[next]||'—') + (isSunday && WORKING_TYPES.has(next) ? ' ⚠' : '');

    const td = btn.closest('td');
    let classes = next ? `shift-cell-${next}` : '';
    if (isSunday) classes += ' sunday-col';
    if (td.classList.contains('today-col')) classes += ' today-col';
    td.className = classes.trim();

    const tr      = btn.closest('tr');
    const buttons = tr.querySelectorAll('.shift-btn');
    let total = 0, nD = 0, nN = 0, nRest = 0, nHolg = 0;
    buttons.forEach(b => {
      const s = b.dataset.current || '';
      total += SC().shiftHours(s, cfg);
      if (s === 'D') nD++; else if (s === 'N') nN++;
      else if (REST_TYPES.has(s)) nRest++;
      else if (s === 'HLD' || s === 'HLN') nHolg++;
    });

    const status = SC().hoursStatus(total, cfg.weeklyTarget);
    tr.querySelector('.hours-cell').textContent = `${total.toFixed(1)}h`;
    tr.querySelector('.hours-cell').className   = `hours-cell hours-${status}`;
    const dot = tr.querySelector('.semaphore');
    if (dot) dot.className = `semaphore ${status}`;

    // Actualizar resumen y badge
    const newSum   = { cD: nD, cN: nN, cRest: nRest, cHolg: nHolg };
    const sumEl    = tr.querySelector('.driver-week-summary');
    if (sumEl) sumEl.outerHTML = summaryBadgesHTML(newSum);

    const badgeEl  = tr.querySelector('.rest-assigned-badge');
    const hasRest  = nRest > 0;
    if (hasRest && !badgeEl) {
      tr.querySelector('.driver-cell-name')?.insertAdjacentHTML('afterend', restBadgeHTML(true));
    } else if (!hasRest && badgeEl) {
      badgeEl.remove();
    }
    tr.classList.toggle('has-rest', hasRest);
    tr.classList.toggle('double-rest', nRest >= 2);

    updateTableFooter(drivers, wk);

    if (_onShiftChange) _onShiftChange();
  }

  /* ── Render principal ── */
  function renderPlanner(drivers, wk, cfg) {
    _allDrivers = drivers;
    _wkRef      = wk;
    _cfgRef     = cfg;

    const container = document.getElementById('planner-table-container');
    const monday    = U().weekKeyToDate(wk) || U().getMondayOfWeek(new Date());
    document.getElementById('planner-week-label').textContent = U().weekLabel(monday);

    if (!drivers.length) {
      container.innerHTML = '<p class="placeholder-text" style="padding:2rem;">Agrega conductores para comenzar la planeación.</p>';
      updateFilterCount(0, 0);
      return;
    }

    const filtered  = applyFilters(drivers, wk, cfg);
    const weekSched = DM().getWeekSchedule(wk);

    updateFilterCount(filtered.length, drivers.length);

    if (!filtered.length) {
      container.innerHTML = '<p class="placeholder-text" style="padding:2rem;">Ningún conductor coincide con los filtros aplicados.</p>';
      return;
    }

    const todayStr   = U().formatDate(new Date(), {day:'2-digit', month:'2-digit', year:'numeric'});

    const headerCols = TCI.DAYS_SHORT.map((day, i) => {
      const date = U().addDays(monday, i);
      const dateStr = U().formatDate(date, {day:'2-digit', month:'2-digit', year:'numeric'});
      const isToday = dateStr === todayStr;
      
      return `<th class="${i===6?'day-sunday ':''}${isToday?'today-col':''}">${day}<br>
        <small style="font-weight:400;font-size:.7rem">${U().formatDate(date,{day:'2-digit',month:'2-digit'})}</small></th>`;
    }).join('');

    const rows = filtered.map(driver => {
      const dSched = weekSched[driver.id] || {};
      const sum    = weekSummary(dSched);
      let total    = 0;
      
      const cells  = Array.from({length:7}, (_,d) => {
        const isSunday = d === 6;
        const cur      = dSched[d] || '';
        const date     = U().addDays(monday, d);
        const dateStr  = U().formatDate(date, {day:'2-digit', month:'2-digit', year:'numeric'});
        const isToday  = dateStr === todayStr;
        
        total += SC().shiftHours(cur, cfg);
        return `<td class="${cur?`shift-cell-${cur}`:''}${isSunday?' sunday-col':''}${isToday?' today-col':''}">${chipHTML(driver.id, d, cur, isSunday)}</td>`;
      }).join('');
      const status  = SC().hoursStatus(total, cfg.weeklyTarget);
      const hasRest = sum.cRest > 0;
      return `<tr class="${hasRest?'has-rest':''}${sum.cRest>=2?' double-rest':''}">
        <td class="driver-cell">
          <div class="driver-cell-top">
            <span class="semaphore ${status}"></span>
            <span class="driver-cell-name">${driver.name}</span>
            ${restBadgeHTML(hasRest)}
          </div>
          <div class="driver-cell-sub">${driver.cedula||''}</div>
          ${summaryBadgesHTML(sum)}
        </td>
        ${cells}
        <td class="hours-cell hours-${status}">${total.toFixed(1)}h</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <table class="planner-table" role="grid" aria-label="Planeador semanal de turnos">
        <thead><tr>
          <th class="col-driver">Conductor</th>${headerCols}
          <th class="col-total">Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot></tfoot>
      </table>`;

    // Populate footer for the first time
    updateTableFooter(drivers, wk);

    container.querySelector('tbody').addEventListener('click', e => {
      const btn = e.target.closest('.shift-btn');
      if (!btn) return;
      updateCell(btn, wk, cfg, drivers);
    });

    // Inicializar filtros (solo una vez)
    _initPlannerFilters();
  }

  /* ── Inicializar filtros del planeador (idempotente) ── */
  let _filtersInited = false;
  function _initPlannerFilters() {
    if (_filtersInited) return;
    _filtersInited = true;

    const searchEl = document.getElementById('planner-search');
    if (searchEl) {
      searchEl.addEventListener('input', e => {
        _pfSearch = e.target.value.trim();
        renderPlanner(_allDrivers, _wkRef, _cfgRef);
      });
    }

    document.querySelectorAll('[data-pf]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-pf]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _pfFilter = btn.dataset.pf;
        renderPlanner(_allDrivers, _wkRef, _cfgRef);
      });
    });
  }

  return { renderPlanner, onShiftChange };
})();
