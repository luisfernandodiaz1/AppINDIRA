/* ═══════════════════════════════════════════════════════════════════
   app.js – Boot · Estado global · Navegación · Orquestación
   Transportes CI – Sistema de Turnos
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

// Alias cortos a los módulos globales
const DM   = () => TCI.DataManager;
const SC   = () => TCI.Scheduler;
const U    = () => TCI.Utils;
const DASH = () => TCI.Dashboard;
const PLAN = () => TCI.Planner;
const DRV  = () => TCI.Drivers;
const REP  = () => TCI.Reports;
const CFG  = () => TCI.Config;

/* ══════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════ */
let currentWeek = U().getMondayOfWeek(new Date());
let currentTab  = 'dashboard';

/* ══════════════════════════════════
   REFRESH CENTRAL
══════════════════════════════════ */
function refreshAll() {
  const cfg     = DM().getConfig();
  const wk      = U().weekKey(currentWeek);
  const drivers = DM().getDrivers();
  const label   = U().weekLabel(currentWeek);

  document.getElementById('planner-week-label').textContent = label;
  document.getElementById('dash-week-label').textContent    = label;

  switch (currentTab) {
    case 'dashboard': DASH().renderDashboard(wk, cfg); break;
    case 'planner':   PLAN().renderPlanner(drivers.filter(d => d.status !== 'inactive'), wk, cfg); break;
    case 'drivers':   DRV().renderDrivers(document.getElementById('driver-search').value); break;
    case 'reports':   REP().renderReports(document.getElementById('report-month').value); break;
  }
}

/* ══════════════════════════════════
   NAVEGACIÓN
══════════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });
  currentTab = tab;
  refreshAll();
}

/* ══════════════════════════════════
   BOOT
══════════════════════════════════ */
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

  // ── Sidebar nav ──
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ── Week navigation ──
  document.getElementById('btn-prev-week').addEventListener('click', () => {
    currentWeek = U().addDays(currentWeek, -7); refreshAll();
  });
  document.getElementById('btn-next-week').addEventListener('click', () => {
    currentWeek = U().addDays(currentWeek, 7); refreshAll();
  });

  // ── Clonar semana anterior ──
  document.getElementById('btn-copy-week').addEventListener('click', () => {
    const prevWk    = U().weekKey(U().addDays(currentWeek, -7));
    const currentWk = U().weekKey(currentWeek);
    const prevSched = DM().getSchedule()[prevWk];
    
    if (!prevSched || Object.keys(prevSched).length === 0) {
      U().toast('No hay datos en la semana anterior para copiar.', 'warn');
      return;
    }

    const currentSched = DM().getWeekSchedule(currentWk);
    if (Object.keys(currentSched).length > 0) {
      if (!confirm('Ya hay turnos asignados en esta semana. ¿Sobrescribir con los de la semana anterior?')) return;
    }

    // Copiar profundamente
    DM().setWeekSchedule(currentWk, JSON.parse(JSON.stringify(prevSched)));
    
    const cfg     = DM().getConfig();
    const drivers = DM().getDrivers().filter(d => d.status !== 'inactive');
    PLAN().renderPlanner(drivers, currentWk, cfg);
    DASH().renderDashboard(currentWk, cfg);
    U().toast('Turnos clonados de la semana anterior.', 'success');
  });

  // ── Sugerir distribución ──
  document.getElementById('btn-suggest').addEventListener('click', () => {
    const cfg     = DM().getConfig();
    const drivers = DM().getDrivers().filter(d => d.status !== 'inactive');
    const wk      = U().weekKey(currentWeek);
    if (!drivers.length) { U().toast('No hay conductores activos.', 'warn'); return; }
    const suggestion = SC().suggestWeek(wk, drivers, cfg);
    DM().setWeekSchedule(wk, suggestion);
    PLAN().renderPlanner(drivers, wk, cfg);
    DASH().renderDashboard(wk, cfg);
    U().toast('Distribución sugerida aplicada.', 'success');
  });

  // ── Módulos ──
  DRV().initDriverEvents();
  DRV().onDriverChange(refreshAll);

  REP().initReportEvents();

  CFG().initConfigEvents();
  CFG().onConfigSave(refreshAll);

  // Cuando cambia un turno en el planeador → refrescar dashboard también
  PLAN().onShiftChange(() => {
    const cfg     = DM().getConfig();
    const wk      = U().weekKey(currentWeek);
    const drivers = DM().getDrivers().filter(d => d.status !== 'inactive');
    PLAN().renderPlanner(drivers, wk, cfg);
    DASH().renderDashboard(wk, cfg);
  });

  // ── Nombre de empresa ──
  const brandEl = document.querySelector('.brand-name');
  if (brandEl) brandEl.textContent = DM().getConfig().company;

  CFG().loadConfigUI();

  // ── Render inicial ──
  switchTab('dashboard');
});
