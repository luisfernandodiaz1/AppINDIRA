/* ═══════════════════════════════════════════════════════════════════
   modules/config.js – Configuración del sistema
   Transportes CI – Sistema de Turnos
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

window.TCI = window.TCI || {};

TCI.Config = (() => {

  const DM = () => TCI.DataManager;
  const U  = () => TCI.Utils;

  let _onSave = null;
  function onConfigSave(cb) { _onSave = cb; }

  function loadConfigUI() {
    const cfg = DM().getConfig();
    document.getElementById('cfg-company').value        = cfg.company;
    document.getElementById('cfg-d-start').value        = cfg.shiftDStart;
    document.getElementById('cfg-d-end').value          = cfg.shiftDEnd;
    document.getElementById('cfg-n-start').value        = cfg.shiftNStart;
    document.getElementById('cfg-n-end').value          = cfg.shiftNEnd;
    document.getElementById('cfg-monthly-target').value = cfg.monthlyTarget;
    document.getElementById('cfg-weekly-target').value  = cfg.weeklyTarget;
    document.getElementById('cfg-reg-year').value       = cfg.regulationYear;
  }

  function saveConfigUI() {
    const cfg = {
      company:        document.getElementById('cfg-company').value.trim() || 'Transportes CI',
      shiftDStart:    document.getElementById('cfg-d-start').value,
      shiftDEnd:      document.getElementById('cfg-d-end').value,
      shiftNStart:    document.getElementById('cfg-n-start').value,
      shiftNEnd:      document.getElementById('cfg-n-end').value,
      monthlyTarget:  parseInt(document.getElementById('cfg-monthly-target').value,10) || TCI.DEFAULT_CONFIG.monthlyTarget,
      weeklyTarget:   parseInt(document.getElementById('cfg-weekly-target').value,10)  || TCI.DEFAULT_CONFIG.weeklyTarget,
      regulationYear: document.getElementById('cfg-reg-year').value,
    };
    DM().saveConfig(cfg);
    const el = document.querySelector('.brand-name');
    if (el) el.textContent = cfg.company;
    U().toast('Configuración guardada correctamente.', 'success');
    if (_onSave) _onSave();
  }

  function resetConfigUI() {
    DM().saveConfig({ ...TCI.DEFAULT_CONFIG });
    loadConfigUI();
    const el = document.querySelector('.brand-name');
    if (el) el.textContent = TCI.DEFAULT_CONFIG.company;
    U().toast('Configuración restaurada a los valores predeterminados.', 'info');
    if (_onSave) _onSave();
  }

  /* ── Backup / Restore ── */
  function exportBackup() {
    const data = DM().exportBackup();
    const date = new Date().toISOString().split('T')[0];
    const filename = `tci_backup_${date}.json`;
    
    // Trigger download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    U().toast('Backup descargado correctamente.', 'success');
  }

  function triggerRestore() {
    document.getElementById('input-restore-backup').click();
  }

  function handleRestore(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const success = DM().restoreBackup(data);
        if (success) {
          U().toast('Copia de seguridad restaurada correctamente. Recargando...', 'success');
          setTimeout(() => location.reload(), 1500); // Reload the app to apply changes globally
        } else {
          U().toast('El archivo no es un backup válido de Transportes CI.', 'error');
        }
      } catch (err) {
        U().toast('Error al leer el archivo. Asegúrate de que sea un JSON válido.', 'error');
      }
    };
    reader.readAsText(file);
    // Reset file input so we can select the same file again if needed
    event.target.value = '';
  }

  function initConfigEvents() {
    document.getElementById('btn-save-config').addEventListener('click', saveConfigUI);
    document.getElementById('btn-reset-config').addEventListener('click', resetConfigUI);
    document.getElementById('btn-export-backup').addEventListener('click', exportBackup);
    document.getElementById('btn-trigger-restore').addEventListener('click', triggerRestore);
    document.getElementById('input-restore-backup').addEventListener('change', handleRestore);
  }

  return { loadConfigUI, saveConfigUI, resetConfigUI, onConfigSave, initConfigEvents };
})();
