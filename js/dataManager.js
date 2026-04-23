/* ═══════════════════════════════════════════════════════════════════
   dataManager.js – CRUD sobre LocalStorage
   Transportes CI – Sistema de Turnos
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

window.TCI = window.TCI || {};

TCI.DataManager = (() => {

  const K = TCI.STORAGE_KEYS;

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* ── Config ── */
  function getConfig() {
    const stored = readJSON(K.config, null);
    return stored ? { ...TCI.DEFAULT_CONFIG, ...stored } : { ...TCI.DEFAULT_CONFIG };
  }
  function saveConfig(cfg) { writeJSON(K.config, cfg); }

  /* ── Drivers ── */
  function getDrivers() { return readJSON(K.drivers, []); }
  function _saveDrivers(drivers) { writeJSON(K.drivers, drivers); }

  function addDriver(driver) {
    const list = getDrivers();
    driver.id        = `drv_${Date.now()}`;
    driver.createdAt = new Date().toISOString();
    list.push(driver);
    _saveDrivers(list);
    return driver;
  }
  function updateDriver(id, data) {
    const list = getDrivers();
    const idx  = list.findIndex(d => d.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data };
    _saveDrivers(list);
    return list[idx];
  }
  function deleteDriver(id) {
    _saveDrivers(getDrivers().filter(d => d.id !== id));
    const sched = getSchedule();
    let dirty = false;
    Object.keys(sched).forEach(wk => {
      if (sched[wk][id]) { delete sched[wk][id]; dirty = true; }
    });
    if (dirty) writeJSON(K.schedule, sched);
  }

  /* ── Schedule ── */
  function getSchedule()      { return readJSON(K.schedule, {}); }
  function getWeekSchedule(wk){ return getSchedule()[wk] || {}; }

  function setShift(wk, driverId, dayIndex, shiftType) {
    const sched = getSchedule();
    if (!sched[wk])           sched[wk] = {};
    if (!sched[wk][driverId]) sched[wk][driverId] = {};
    sched[wk][driverId][dayIndex] = shiftType;
    writeJSON(K.schedule, sched);
  }
  function setWeekSchedule(wk, weekData) {
    const sched = getSchedule();
    sched[wk] = weekData;
    writeJSON(K.schedule, sched);
  }

  /* ── Backup & Restore ── */
  function exportBackup() {
    return {
      version: 1,
      timestamp: new Date().toISOString(),
      config: readJSON(K.config, null),
      drivers: readJSON(K.drivers, []),
      schedule: readJSON(K.schedule, {})
    };
  }

  function restoreBackup(data) {
    if (!data || data.version !== 1) return false;
    if (data.config) writeJSON(K.config, data.config);
    if (data.drivers) writeJSON(K.drivers, data.drivers);
    if (data.schedule) writeJSON(K.schedule, data.schedule);
    return true;
  }

  return { getConfig, saveConfig, getDrivers, addDriver, updateDriver, deleteDriver, getSchedule, getWeekSchedule, setShift, setWeekSchedule, exportBackup, restoreBackup };
})();
