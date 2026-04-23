/* ═══════════════════════════════════════════════════════════════════
   modules/drivers.js – Gestión + Filtros avanzados
   Transportes CI – Sistema de Turnos
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

window.TCI = window.TCI || {};

TCI.Drivers = (() => {

  const DM = () => TCI.DataManager;
  const SC = () => TCI.Scheduler;
  const U  = () => TCI.Utils;

  let _onChange    = null;
  let _statusFilter  = 'all';
  let _licenseFilter = 'all';

  function onDriverChange(cb) { _onChange = cb; }
  function _notify() { if (_onChange) _onChange(); }

  /* ── Render grid ── */
  function renderDrivers(filterText = '') {
    const grid = document.getElementById('drivers-grid');
    const cfg  = DM().getConfig();
    let drivers = DM().getDrivers();

    // Búsqueda por texto
    if (filterText) {
      const q = filterText.toLowerCase();
      drivers = drivers.filter(d => d.name.toLowerCase().includes(q) || (d.cedula||'').includes(q));
    }

    // Filtro por estado
    if (_statusFilter !== 'all') {
      drivers = drivers.filter(d => d.status === _statusFilter);
    }

    // Filtro por licencia
    if (_licenseFilter !== 'all') {
      drivers = drivers.filter(d => (d.license||'') === _licenseFilter);
    }

    // Actualizar contador
    const allCount = DM().getDrivers().length;
    let counter = document.getElementById('drivers-filter-count');
    if (!counter) {
      const bar = document.getElementById('drivers-filter-bar');
      if (bar) {
        counter = document.createElement('span');
        counter.id = 'drivers-filter-count';
        counter.className = 'filter-result-count';
        bar.appendChild(counter);
      }
    }
    if (counter) counter.textContent = drivers.length < allCount
      ? `${drivers.length} de ${allCount}`
      : `${allCount} conductores`;

    if (!drivers.length) {
      grid.innerHTML = (filterText || _statusFilter !== 'all' || _licenseFilter !== 'all')
        ? '<p class="placeholder-text">Sin resultados. Prueba con otros filtros.</p>'
        : '<p class="placeholder-text">No hay conductores registrados. Agrega el primero.</p>';
      return;
    }

    const today  = new Date();
    const monday = U().getMondayOfWeek(today);
    const wk     = U().weekKey(monday);

    grid.innerHTML = drivers.map(d => {
      const wkH     = SC().weekHours(d.id, wk, cfg);
      const moH     = SC().monthHours(d.id, monday.getFullYear(), monday.getMonth(), cfg);
      const moPct   = Math.min((moH/cfg.monthlyTarget)*100,100).toFixed(0);
      const moSt    = SC().hoursStatus(moH, cfg.monthlyTarget, 8);
      const moColor = moSt==='ok'?'green-500':moSt==='over'?'red-400':'orange-400';
      const start   = d.startDate ? U().formatDate(new Date(d.startDate+'T00:00:00')) : '—';
      const statusCls = TCI.STATUS_CLASSES[d.status] || 'status-active';
      const statusLbl = TCI.STATUS_LABELS[d.status]  || 'Activo';

      return `
        <div class="driver-card" data-driver-id="${d.id}">
          <div class="driver-card-header">
            <div class="driver-avatar">${U().initials(d.name)}</div>
            <div class="driver-info">
              <div class="driver-name">${d.name}</div>
              <div class="driver-cedula">${d.cedula||'Sin cédula'}</div>
            </div>
            <div class="driver-actions">
              <button class="btn-icon" data-action="edit" data-id="${d.id}" title="Editar" aria-label="Editar ${d.name}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon danger" data-action="delete" data-id="${d.id}" title="Eliminar" aria-label="Eliminar ${d.name}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
              </button>
            </div>
          </div>
          <div style="display:flex;gap:.5rem;align-items:center;">
            <span class="status-badge ${statusCls}">${statusLbl}</span>
            <span style="font-size:.75rem;color:var(--text-muted)">Lic. ${d.license||'—'}</span>
          </div>
          <div class="driver-meta">
            <div class="driver-meta-item"><span class="driver-meta-label">Ingreso</span><br><span class="driver-meta-value">${start}</span></div>
            <div class="driver-meta-item"><span class="driver-meta-label">Sem. actual</span><br><span class="driver-meta-value" style="color:var(--green-500)">${wkH.toFixed(1)}h</span></div>
          </div>
          <div class="driver-hours-bar">
            <div class="driver-hours-row">
              <span class="driver-hours-label">Horas mes</span>
              <span class="driver-hours-value" style="color:var(--${moColor})">${moH.toFixed(0)} / ${cfg.monthlyTarget}h</span>
            </div>
            <div class="kpi-progress-track"><div class="kpi-progress-fill ${moSt}" style="width:${moPct}%"></div></div>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'edit')   openDriverModal(btn.dataset.id);
        if (btn.dataset.action === 'delete') confirmDeleteDriver(btn.dataset.id);
      });
    });
  }

  /* ── Modal ── */
  function openDriverModal(editId = null) {
    const modal   = document.getElementById('modal-driver');
    const title   = document.getElementById('modal-driver-title');
    const idInp   = document.getElementById('driver-id');
    const nameInp = document.getElementById('driver-name');
    const cedula  = document.getElementById('driver-cedula');
    const license = document.getElementById('driver-license');
    const start   = document.getElementById('driver-start');
    const status  = document.getElementById('driver-status');

    if (editId) {
      const d = DM().getDrivers().find(d => d.id === editId);
      if (!d) return;
      title.textContent = 'Editar Conductor';
      idInp.value = d.id; nameInp.value = d.name;
      cedula.value = d.cedula||''; license.value = d.license||'C2';
      start.value = d.startDate||''; status.value = d.status||'active';
    } else {
      title.textContent = 'Agregar Conductor';
      idInp.value = nameInp.value = cedula.value = start.value = '';
      license.value = 'C2'; status.value = 'active';
    }
    modal.classList.remove('hidden');
    nameInp.focus();
  }

  function closeDriverModal() { document.getElementById('modal-driver').classList.add('hidden'); }

  function saveDriver() {
    const id   = document.getElementById('driver-id').value;
    const name = document.getElementById('driver-name').value.trim();
    if (!name) { U().toast('El nombre del conductor es obligatorio.', 'error'); return; }
    const data = {
      name, cedula: document.getElementById('driver-cedula').value.trim(),
      license: document.getElementById('driver-license').value,
      startDate: document.getElementById('driver-start').value,
      status: document.getElementById('driver-status').value,
    };
    if (id) { DM().updateDriver(id, data); U().toast(`Conductor "${name}" actualizado.`, 'success'); }
    else    { DM().addDriver(data);         U().toast(`Conductor "${name}" agregado.`,    'success'); }
    closeDriverModal();
    renderDrivers(document.getElementById('driver-search').value);
    _notify();
  }

  function confirmDeleteDriver(id) {
    const d = DM().getDrivers().find(d => d.id === id);
    if (!d) return;
    if (!confirm(`¿Eliminar al conductor "${d.name}"? Esta acción no se puede deshacer.`)) return;
    DM().deleteDriver(id);
    U().toast(`Conductor "${d.name}" eliminado.`, 'warn');
    renderDrivers(document.getElementById('driver-search').value);
    _notify();
  }

  /* ── Init events ── */
  function initDriverEvents() {
    document.getElementById('btn-add-driver').addEventListener('click', () => openDriverModal());
    document.getElementById('btn-save-driver').addEventListener('click', saveDriver);
    document.getElementById('btn-cancel-driver').addEventListener('click', closeDriverModal);
    document.getElementById('btn-close-driver-modal').addEventListener('click', closeDriverModal);
    document.getElementById('modal-driver').addEventListener('click', e => { if (e.target===e.currentTarget) closeDriverModal(); });
    document.getElementById('driver-search').addEventListener('input', e => renderDrivers(e.target.value));

    // Filtros de estado
    document.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-status]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _statusFilter = btn.dataset.status;
        renderDrivers(document.getElementById('driver-search').value);
      });
    });

    // Filtros de licencia
    document.querySelectorAll('[data-license]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-license]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _licenseFilter = btn.dataset.license;
        renderDrivers(document.getElementById('driver-search').value);
      });
    });
  }

  return { renderDrivers, openDriverModal, closeDriverModal, saveDriver, confirmDeleteDriver, onDriverChange, initDriverEvents };
})();
