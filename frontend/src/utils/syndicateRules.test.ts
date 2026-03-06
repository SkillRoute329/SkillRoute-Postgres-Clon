/**
 * Test de reglas de negocio: 9h descanso y doble turno (sindicato/listería).
 */
import { describe, it, expect } from 'vitest';
import { validateAssignment, validateDobleTurno, MAX_HORAS_DIA_UCOT } from './syndicateRules';

describe('Regla de 9 horas de descanso (UNOTT)', () => {
  it('bloquea asignación cuando el chofer terminó a las 04:00 e inicia a las 11:00 (7h descanso)', () => {
    const result = validateAssignment('driver1', '11:00', '04:00');
    expect(result.valid).toBe(false);
    expect(result.restHours).toBe(7);
    expect(result.error).toMatch(/9|descanso/i);
  });

  it('permite asignación cuando hay al menos 9h entre fin 23:00 e inicio 08:00', () => {
    const result = validateAssignment('driver1', '08:00', '23:00');
    expect(result.valid).toBe(true);
    expect(result.restHours).toBeGreaterThanOrEqual(9);
  });

  it('bloquea cuando hay 8h entre fin 23:00 e inicio 07:00', () => {
    const result = validateAssignment('driver1', '07:00', '23:00');
    expect(result.valid).toBe(false);
    expect(result.restHours).toBe(8);
  });
});

describe('Doble turno – horas de seguridad UCOT', () => {
  it('arroja error cuando el chofer excede 12h totales de conducción (con 9h descanso entre turnos)', () => {
    const result = validateDobleTurno('00:00', '06:00', '15:00', '22:00');
    expect(result.valid).toBe(false);
    expect(result.totalHoras).toBe(13);
    expect(result.error).toMatch(new RegExp(MAX_HORAS_DIA_UCOT.toString()));
  });

  it('permite doble turno cuando total <= 12h y descanso >= 9h', () => {
    const result = validateDobleTurno('06:00', '11:00', '20:00', '23:00');
    expect(result.valid).toBe(true);
    expect(result.totalHoras).toBeLessThanOrEqual(12);
  });

  it('bloquea si el descanso entre turnos es menor a 9h', () => {
    const result = validateDobleTurno('06:00', '12:00', '14:00', '20:00');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/descanso|9/i);
  });
});
