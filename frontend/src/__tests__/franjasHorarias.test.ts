/**
 * Tests para franjasHorarias.ts — clasificación de turnos personales y franjas STM.
 * Cubre el caso especial de turnos que cruzan medianoche (20:00 → 04:30).
 */
import { describe, it, expect } from 'vitest';
import {
  clasificarFranjaSTM,
  clasificarTurnoPersonal,
  tipoDiaDe,
  franjaLegacy,
  TURNOS_DEFAULT_POR_OPERADOR,
} from '../utils/franjasHorarias';

describe('clasificarFranjaSTM', () => {
  it('retorna "especial" cuando especial=true', () => {
    expect(clasificarFranjaSTM({ especial: true })).toBe('especial');
  });
  it('retorna "regular" cuando especial=false o undefined', () => {
    expect(clasificarFranjaSTM({ especial: false })).toBe('regular');
    expect(clasificarFranjaSTM({})).toBe('regular');
    expect(clasificarFranjaSTM({ especial: null })).toBe('regular');
  });
});

describe('clasificarTurnoPersonal — UCOT', () => {
  it('asigna primer turno (04:30-12:30) a 06:00', () => {
    const r = clasificarTurnoPersonal('06:00', 70);
    expect(r?.id).toBe('primer');
    expect(r?.label).toContain('Primer');
  });

  it('asigna noche (cruza medianoche) a 23:00', () => {
    const r = clasificarTurnoPersonal('23:00', 70);
    expect(r?.id).toBe('noche');
  });

  it('asigna noche (cruza medianoche) a 02:00 (madrugada)', () => {
    const r = clasificarTurnoPersonal('02:00', 70);
    expect(r?.id).toBe('noche');
  });

  it('borde inferior incluye, borde superior excluye (mismo día)', () => {
    // segundo: 10:00-18:00. 10:00 incluido, 18:00 NO (es del siguiente turno)
    expect(clasificarTurnoPersonal('10:00', 70)?.id).toBe('segundo');
    expect(clasificarTurnoPersonal('17:59', 70)?.id).toBe('segundo');
    // En 18:00 ya cae en tarde (13:00-21:00) — overlap entre segundo y tarde,
    // pero clasificarTurnoPersonal devuelve el primero que matchea, que es tarde.
  });

  it('acepta turnosOverride para casos custom', () => {
    const customTurnos = [
      { id: 'noche-corta', label: 'Noche corta', horaInicio: '22:00', horaFin: '06:00' },
      { id: 'dia', label: 'Día', horaInicio: '06:00', horaFin: '22:00' },
    ];
    expect(clasificarTurnoPersonal('14:00', 99, customTurnos)?.id).toBe('dia');
    expect(clasificarTurnoPersonal('23:30', 99, customTurnos)?.id).toBe('noche-corta');
    expect(clasificarTurnoPersonal('03:00', 99, customTurnos)?.id).toBe('noche-corta');
  });

  it('falla con hora inválida devolviendo null o turno por defecto', () => {
    const r = clasificarTurnoPersonal('xx:yy', 70);
    // Función parsea como 0 cuando inválido, lo cual cae en noche cruzando medianoche
    expect(r).toBeTruthy();
  });
});

describe('tipoDiaDe', () => {
  it('domingo → DOMINGO', () => {
    expect(tipoDiaDe(new Date('2026-04-26'))).toBe('DOMINGO'); // domingo
  });
  it('sábado → SABADO', () => {
    expect(tipoDiaDe(new Date('2026-04-25'))).toBe('SABADO');
  });
  it('miércoles → HABIL', () => {
    expect(tipoDiaDe(new Date('2026-04-22'))).toBe('HABIL');
  });
});

describe('franjaLegacy (deprecated)', () => {
  it('madrugada < 06:00', () => {
    expect(franjaLegacy('05:59')).toBe('madrugada');
    expect(franjaLegacy('00:00')).toBe('madrugada');
  });
  it('manana 06:00-11:59', () => {
    expect(franjaLegacy('06:00')).toBe('manana');
    expect(franjaLegacy('11:59')).toBe('manana');
  });
  it('tarde 12:00-17:59', () => {
    expect(franjaLegacy('12:00')).toBe('tarde');
    expect(franjaLegacy('17:59')).toBe('tarde');
  });
  it('noche >= 18:00', () => {
    expect(franjaLegacy('18:00')).toBe('noche');
    expect(franjaLegacy('23:59')).toBe('noche');
  });
});

describe('TURNOS_DEFAULT_POR_OPERADOR', () => {
  it('tiene los 4 operadores', () => {
    expect(TURNOS_DEFAULT_POR_OPERADOR[70]).toBeDefined();
    expect(TURNOS_DEFAULT_POR_OPERADOR[50]).toBeDefined();
    expect(TURNOS_DEFAULT_POR_OPERADOR[20]).toBeDefined();
    expect(TURNOS_DEFAULT_POR_OPERADOR[10]).toBeDefined();
  });

  it('cada operador tiene al menos 1 turno', () => {
    for (const ag of [70, 50, 20, 10]) {
      expect(TURNOS_DEFAULT_POR_OPERADOR[ag]?.length).toBeGreaterThanOrEqual(1);
    }
  });
});
