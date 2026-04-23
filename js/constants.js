/* ═══════════════════════════════════════════════════════════════════
   constants.js – Constantes globales
   Transportes CI – Sistema de Turnos
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

window.TCI = window.TCI || {};

TCI.SHIFT_TYPES  = ['', 'D', 'N', 'L', 'LD', 'HLD', 'HLN'];
TCI.SHIFT_LABELS = { '':'—', D:'Día (D)', N:'Noche (N)', L:'Libre (L)', LD:'Libre Desc. (LD)', HLD:'Holgura D (HLD)', HLN:'Holgura N (HLN)' };
TCI.DAYS_SHORT   = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
TCI.DAYS_FULL    = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
TCI.MONTH_NAMES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

TCI.STATUS_LABELS  = { active:'Activo', inactive:'Inactivo', vacation:'Vacaciones' };
TCI.STATUS_CLASSES = { active:'status-active', inactive:'status-inactive', vacation:'status-vacation' };

TCI.STORAGE_KEYS = { drivers:'tci_drivers', schedule:'tci_schedule', config:'tci_config' };

TCI.DEFAULT_CONFIG = {
  company:        'Transportes CI',
  shiftDStart:    '07:00',
  shiftDEnd:      '17:00',
  shiftNStart:    '19:00',
  shiftNEnd:      '05:00',
  monthlyTarget:  184,
  weeklyTarget:   46,
  regulationYear: '2025',
};
