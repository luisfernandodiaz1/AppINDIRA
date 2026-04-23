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

    // Equidad Fines de Semana
    renderEquityTable(year, month);
  }

  function renderEquityTable(year, month) {
    const drivers = DM().getDrivers();
    const wrapper = document.getElementById('equity-table-wrapper');
    if (!wrapper) return; // Si no existe en el DOM, ignora

    if (!drivers.length) {
      wrapper.innerHTML = '<p class="placeholder-text">Sin conductores para el reporte de equidad.</p>';
      return;
    }

    const equityData = SC().weekendEquityReport(drivers, year, month - 1);
    
    // Función helper para no mostrar ceros secos si el usuario prefiere algo más visible, aunque los dejaré en 0 pero tenues si son 0
    const formatCell = (val) => val === 0 ? `<span style="opacity: 0.3">0</span>` : `<strong>${val}</strong>`;

    const rows = equityData.map(d => `
      <tr>
        <td style="text-align: left; font-weight: 600; padding-left: 1rem;">${d.driverName}</td>
        <td class="eq-sat">${formatCell(d.q1.satRest)}</td>
        <td class="eq-sun">${formatCell(d.q1.sunWork)}</td>
        <td class="eq-sat">${formatCell(d.q2.satRest)}</td>
        <td class="eq-sun">${formatCell(d.q2.sunWork)}</td>
        <td class="eq-tot-sat">${formatCell(d.total.satRest)}</td>
        <td class="eq-tot-sun">${formatCell(d.total.sunWork)}</td>
      </tr>
    `).join('');

    wrapper.innerHTML = `
      <div class="equity-table-container">
        <table class="report-table equity-table" aria-label="Reporte de equidad de fines de semana">
          <thead>
            <tr>
              <th rowspan="2" style="text-align:left; padding-left:1rem; vertical-align: bottom;">CONDUCTORES</th>
              <th colspan="2" class="eq-header-q">1 QUINCENA</th>
              <th colspan="2" class="eq-header-q">2 QUINCENA</th>
              <th colspan="2" class="eq-header-tot">MES</th>
            </tr>
            <tr>
              <th class="eq-header-sat">SABADOS<br>DESCANSOS</th>
              <th class="eq-header-sun">DOMINGOS<br>TRABAJADOS</th>
              <th class="eq-header-sat">SABADOS<br>DESCANSOS</th>
              <th class="eq-header-sun">DOMINGOS<br>TRABAJADOS</th>
              <th class="eq-header-sat">SABADOS<br>DESCANSOS</th>
              <th class="eq-header-sun">DOMINGOS<br>TRABAJADOS</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
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

    const equityData = SC().weekendEquityReport(drivers, year, month - 1);
    const eqH1 = ['CONDUCTORES', '1 QUINCENA', '', '2 QUINCENA', '', 'MES', ''];
    const eqH2 = ['', 'SABADOS DESCANSOS', 'DOMINGOS TRABAJADOS', 'SABADOS DESCANSOS', 'DOMINGOS TRABAJADOS', 'SABADOS DESCANSOS', 'DOMINGOS TRABAJADOS'];
    const eqRows = equityData.map(d => [
      d.driverName,
      d.q1.satRest, d.q1.sunWork,
      d.q2.satRest, d.q2.sunWork,
      d.total.satRest, d.total.sunWork
    ]);
    const wsEquity = XLSX.utils.aoa_to_sheet([eqH1, eqH2, ...eqRows]);
    // Merge de cabeceras
    wsEquity['!merges'] = [
      { s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }, // 1 QUINCENA
      { s: { r: 0, c: 3 }, e: { r: 0, c: 4 } }, // 2 QUINCENA
      { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } }  // MES
    ];
    XLSX.utils.book_append_sheet(wb, wsEquity, 'Equidad Fines Semana');

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
