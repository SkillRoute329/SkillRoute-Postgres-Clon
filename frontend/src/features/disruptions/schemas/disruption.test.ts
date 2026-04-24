/**
 * Tests — disruption schema + state machine
 * Trim+ #71 (2026-04-23)
 */

import { describe, it, expect } from 'vitest';
import {
  DisruptionSchema,
  DisruptionCreatePayloadSchema,
  canTransition,
  severityColor,
  severityEmoji,
  VALID_TRANSITIONS,
  type DisruptionStatus,
} from './disruption';

describe('DisruptionSchema — validación Zod', () => {
  it('acepta disrupción completa válida', () => {
    const doc = {
      tipo: 'ACCIDENTE',
      severidad: 'MAJOR',
      estado: 'DETECTED',
      titulo: 'Choque en Bvar Artigas',
      reportedBy: 'uid-123',
      operadorId: 'ucot',
      lineasAfectadas: ['300', '306'],
      lat: -34.89,
      lng: -56.17,
    };
    expect(DisruptionSchema.safeParse(doc).success).toBe(true);
  });

  it('rechaza tipo fuera de enum', () => {
    const doc = {
      tipo: 'TIPO_INEXISTENTE',
      severidad: 'MAJOR',
      estado: 'DETECTED',
      titulo: 'X',
      reportedBy: 'uid',
    };
    expect(DisruptionSchema.safeParse(doc).success).toBe(false);
  });

  it('rechaza severidad fuera de enum', () => {
    const doc = {
      tipo: 'ACCIDENTE',
      severidad: 'SUPER_CRITICAL',
      estado: 'DETECTED',
      titulo: 'X',
      reportedBy: 'uid',
    };
    expect(DisruptionSchema.safeParse(doc).success).toBe(false);
  });

  it('rechaza título < 3 caracteres', () => {
    const doc = {
      tipo: 'ACCIDENTE',
      severidad: 'MINOR',
      estado: 'DETECTED',
      titulo: 'AB',
      reportedBy: 'uid',
    };
    expect(DisruptionSchema.safeParse(doc).success).toBe(false);
  });

  it('lineasAfectadas acepta array vacío (toda la red)', () => {
    const doc = {
      tipo: 'CLIMA',
      severidad: 'MODERATE',
      estado: 'DETECTED',
      titulo: 'Lluvia intensa',
      reportedBy: 'uid',
      lineasAfectadas: [],
    };
    expect(DisruptionSchema.safeParse(doc).success).toBe(true);
  });
});

describe('DisruptionCreatePayloadSchema — validación para create()', () => {
  it('acepta payload mínimo', () => {
    const payload = {
      tipo: 'DESVIO_NO_PROGRAMADO',
      severidad: 'MODERATE',
      titulo: 'Corte 8 de Octubre',
      reportedBy: 'uid-123',
    };
    const r = DisruptionCreatePayloadSchema.safeParse(payload);
    expect(r.success).toBe(true);
    // operadorId default "ucot" aplicado
    if (r.success) expect(r.data.operadorId).toBe('ucot');
  });

  it('rechaza sin título', () => {
    const payload = {
      tipo: 'DESVIO_NO_PROGRAMADO',
      severidad: 'MODERATE',
      reportedBy: 'uid',
    };
    expect(DisruptionCreatePayloadSchema.safeParse(payload).success).toBe(false);
  });
});

describe('State machine — canTransition', () => {
  const ALL_STATES: DisruptionStatus[] = [
    'DETECTED',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'RESOLVED',
    'CANCELLED',
  ];

  it('DETECTED puede ir a ACKNOWLEDGED o CANCELLED', () => {
    expect(canTransition('DETECTED', 'ACKNOWLEDGED')).toBe(true);
    expect(canTransition('DETECTED', 'CANCELLED')).toBe(true);
  });

  it('DETECTED NO puede saltar directo a RESOLVED', () => {
    expect(canTransition('DETECTED', 'RESOLVED')).toBe(false);
    expect(canTransition('DETECTED', 'IN_PROGRESS')).toBe(false);
  });

  it('ACKNOWLEDGED → IN_PROGRESS | CANCELLED', () => {
    expect(canTransition('ACKNOWLEDGED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('ACKNOWLEDGED', 'CANCELLED')).toBe(true);
    expect(canTransition('ACKNOWLEDGED', 'DETECTED')).toBe(false); // no regresa
  });

  it('IN_PROGRESS → RESOLVED | CANCELLED', () => {
    expect(canTransition('IN_PROGRESS', 'RESOLVED')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'DETECTED')).toBe(false);
  });

  it('RESOLVED y CANCELLED son terminales (sin salida)', () => {
    ALL_STATES.forEach((s) => {
      expect(canTransition('RESOLVED', s)).toBe(false);
      expect(canTransition('CANCELLED', s)).toBe(false);
    });
  });

  it('mismo estado no es transición válida', () => {
    ALL_STATES.forEach((s) => {
      expect(canTransition(s, s)).toBe(false);
    });
  });

  it('VALID_TRANSITIONS cubre todos los estados', () => {
    ALL_STATES.forEach((s) => {
      expect(VALID_TRANSITIONS[s]).toBeDefined();
    });
  });
});

describe('UI helpers', () => {
  it('severityColor distinto por nivel', () => {
    const colors = new Set(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'].map((s) => severityColor(s as any)));
    expect(colors.size).toBe(4); // todos únicos
  });

  it('severityEmoji distinto por nivel', () => {
    expect(severityEmoji('MINOR')).not.toBe(severityEmoji('CRITICAL'));
    expect(severityEmoji('CRITICAL')).toContain('🚨');
  });
});
