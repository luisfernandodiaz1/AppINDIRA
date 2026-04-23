/* ═══════════════════════════════════════════════════════════════════
   scheduler.js – Lógica de horas, compensaciones y distribución
   Transportes CI – Sistema de Turnos
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

window.TCI = window.TCI || {};

TCI.Scheduler = (() => {

  const DM = () => TCI.DataManager;
  const U  = () => TCI.Utils;

  const SUNDAY_WORKING = new Set(['D', 'N', 'HLD', 'HLN']);

  function calcHours(start, end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let s = sh * 60 + sm;
    let e = eh * 60 + em;
    if (e <= s) e += 1440;
    return (e - s) / 60;
  }

  function shiftHours(type, cfg) {
    switch (type) {
      case 'D': case 'HLD': return calcHours(cfg.shiftDStart, cfg.shiftDEnd);
      case 'N': case 'HLN': return calcHours(cfg.shiftNStart, cfg.shiftNEnd);
      default: return 0;
    }
  }

  function weekHours(driverId, wk, cfg) {
    const days = DM().getWeekSchedule(wk)[driverId] || {};
    let total = 0;
    for (let d = 0; d < 7; d++) total += shiftHours(days[d] || '', cfg);
    return total;
  }

  function monthHours(driverId, year, month, cfg) {
    const schedule = DM().getSchedule();
    let total = 0;
    Object.keys(schedule).forEach(wk => {
      const monday = U().weekKeyToDate(wk);
      if (!monday) return;
      for (let d = 0; d < 7; d++) {
        const day = U().addDays(monday, d);
        if (day.getFullYear() === year && day.getMonth() === month) {
          total += shiftHours((schedule[wk][driverId] || {})[d] || '', cfg);
        }
      }
    });
    return total;
  }

  function getSundayCompensations(drivers, cfg) {
    const schedule = DM().getSchedule();
    const weekKeys = Object.keys(schedule).sort();
    const results  = [];

    weekKeys.forEach((wk, idx) => {
      drivers.forEach(driver => {
        const days   = schedule[wk][driver.id] || {};
        const sunday = days[6] || '';
        if (!SUNDAY_WORKING.has(sunday)) return;

        const nextWk      = weekKeys[idx + 1];
        const compensated = nextWk && Object.values(schedule[nextWk][driver.id] || {}).includes('LD');
        if (!compensated) {
          const date = U().weekKeyToDate(wk);
          if (date) date.setDate(date.getDate() + 6);
          results.push({
            driverId:   driver.id,
            driverName: driver.name,
            weekKey:    wk,
            sundayDate: date ? U().formatDate(date) : wk,
            shift:      sunday,
          });
        }
      });
    });
    return results;
  }

  function suggestWeek(wk, drivers, cfg) {
    if (!drivers.length) return {};
    const monday = U().weekKeyToDate(wk) || new Date();
    const year   = monday.getFullYear();
    const month  = monday.getMonth();

    const sorted = [...drivers].sort((a, b) =>
      monthHours(a.id, year, month, cfg) - monthHours(b.id, year, month, cfg)
    );

    const newSched = {};
    sorted.forEach((driver, i) => {
      newSched[driver.id] = {};
      let left = cfg.weeklyTarget;
      for (let d = 0; d < 6; d++) {
        const shift = ((i + d) % 2 === 0) ? 'D' : 'N';
        const h = shiftHours(shift, cfg);
        if (left >= h) { newSched[driver.id][d] = shift; left -= h; }
        else             newSched[driver.id][d] = 'L';
      }
      newSched[driver.id][6] = 'L';
    });
    return newSched;
  }

  function hoursStatus(hours, target, tolerance = 4) {
    if (hours > target + tolerance) return 'over';
    if (hours < target - tolerance) return 'under';
    return 'ok';
  }

  return { calcHours, shiftHours, weekHours, monthHours, getSundayCompensations, suggestWeek, hoursStatus };
})();
