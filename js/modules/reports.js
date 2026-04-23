/* ═══════════════════════════════════════════════════════════════════
   modules/reports.js – Reporte mensual · Excel export
   Transportes CI – Sistema de Turnos
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

window.TCI = window.TCI || {};

TCI.Reports = (() => {

  const DM = () => TCI.DataManager;
  const SC = () => TCI.Scheduler;
  const U  = () => TCI.Utils;

  function renderReports(yearMonth) {
    const cfg     = DM().getConfig();
    const drivers = DM().getDrivers();
    const [year, month] = yearMonth.split('-').map(Number);

    // Tabla de horas
    const wrapper = document.getElementById('report-table-wrapper');
    if (!drivers.length) {
      wrapper.innerHTML = '<p class="placeholder-text">Sin conductores registrados.</p>';
    } else {
      const rows = drivers.map(d => {
        const moH    = SC().monthHours(d.id, year, month-1, cfg);
        const pct    = Math.min((moH/cfg.monthlyTarget)*100,100).toFixed(0);
        const status = SC().hoursStatus(moH, cfg.monthlyTarget, 8);
        const diff   = (moH - cfg.monthlyTarget).toFixed(1);
        const color  = status==='ok'?'green-500':status==='over'?'red-400':'orange-400';
        const lbl    = status==='ok'?'OK':status==='over'?'Exceso':'Déficit';
        const bdg    = status==='ok'?'success':status==='over'?'danger':'warning';
        return `<tr>
          <td style="font-weight:600">${d.name}</td>
          <td>${d.cedula||'—'}</td>
          <td>${moH.toFixed(1)}h</td>
          <td><div class="progress-bar"><div class="progress-track"><div class="progress-fill ${status}" style="width:${pct}%"></div></div><span class="progress-label" style="color:var(--${color})">${pct}%</span></div></td>
          <td style="color:var(--${color})">${diff>0?'+':''}${diff}h</td>
          <td><span class="badge badge-${bdg}">${lbl}</span></td>
        </tr>`;
      }).join('');
      wrapper.innerHTML = `
        <table class="report-table" aria-label="Reporte mensual de horas">
          <thead><tr><th>Conductor</th><th>Cédula</th><th>Horas</th><th>Progreso</th><th>Diferencia</th><th>Estado</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    // Compensaciones
    const compList = document.getElementById('compensation-list');
    const comps    = SC().getSundayCompensations(drivers, cfg);
    if (!comps.length) {
      compList.innerHTML = '<p class="placeholder-text">Sin compensaciones pendientes. ✅</p>';
    } else {
      compList.innerHTML = comps.map(c => `
        <div class="comp-item">
          <div><div class="comp-driver">${c.driverName}</div><div class="comp-date">Domingo trabajado: ${c.sundayDate}</div></div>
          <span class="comp-badge">LD Pendiente</span>
        </div>`).join('');
    }
  }

  function exportToExcel() {
    if (typeof XLSX === 'undefined') {
      U().toast('SheetJS no disponible (requiere conexión para la primera carga).', 'error');
      return;
    }
    const cfg     = DM().getConfig();
    const drivers = DM().getDrivers();
    const [year, month] = document.getElementById('report-month').value.split('-').map(Number);
    const wb = XLSX.utils.book_new();

    const h1   = ['Conductor','Cédula','Licencia','Horas Mes','Meta','Diferencia','Estado'];
    const rows1 = drivers.map(d => {
      const moH = SC().monthHours(d.id, year, month-1, cfg);
      const st  = SC().hoursStatus(moH, cfg.monthlyTarget, 8);
      return [d.name, d.cedula||'', d.license||'', +moH.toFixed(1), cfg.monthlyTarget, +(moH-cfg.monthlyTarget).toFixed(1), st==='ok'?'OK':st==='over'?'Exceso':'Déficit'];
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h1,...rows1]), 'Horas Mensuales');

    const h2    = ['Conductor','Domingo Trabajado','Turno','Estado'];
    const rows2 = SC().getSundayCompensations(drivers, cfg).map(c => [c.driverName, c.sundayDate, c.shift, 'LD Pendiente']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h2,...rows2]), 'Compensaciones');

    const fn = `Turnos_CI_${TCI.MONTH_NAMES[month-1]}_${year}.xlsx`;
    XLSX.writeFile(wb, fn);
    U().toast(`Exportado: ${fn}`, 'success');
  }

  function initReportEvents() {
    U().populateMonthSelector();
    document.getElementById('report-month').addEventListener('change', () =>
      renderReports(document.getElementById('report-month').value)
    );
    document.getElementById('btn-export-excel').addEventListener('click', exportToExcel);
    document.getElementById('btn-print-report').addEventListener('click', () => window.print());
  }

  return { renderReports, exportToExcel, initReportEvents };
})();
