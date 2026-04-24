/**
 * Tests — frontend/src/utils/formatTimestamp.ts
 * Mes+1 #5 (2026-04-23)
 */

import { describe, it, expect } from 'vitest';
import {
  formatHoraMvd,
  formatHoraSegundosMvd,
  formatFechaMvd,
  formatFechaHoraMvd,
  formatRelativoMvd,
  toIsoMvd,
} from './formatTimestamp';

describe('formatTimestamp — Montevideo (UTC-3)', () => {
  // 2026-04-23T18:30:45Z  =  2026-04-23 15:30:45 Montevideo
  const sampleUtc = new Date('2026-04-23T18:30:45Z');

  describe('formatHoraMvd', () => {
    it('devuelve HH:MM en hora Montevideo', () => {
      expect(formatHoraMvd(sampleUtc)).toBe('15:30');
    });
    it('acepta número ms', () => {
      expect(formatHoraMvd(sampleUtc.getTime())).toBe('15:30');
    });
    it('acepta string ISO', () => {
      expect(formatHoraMvd('2026-04-23T18:30:45Z')).toBe('15:30');
    });
    it('devuelve fallback si el input es null', () => {
      expect(formatHoraMvd(null)).toBe('—');
    });
    it('devuelve fallback custom si se pide', () => {
      expect(formatHoraMvd(null, 'sin hora')).toBe('sin hora');
    });
    it('acepta Firestore Timestamp (pato-tipo toDate)', () => {
      const fsTs = { toDate: () => sampleUtc, seconds: 0 };
      expect(formatHoraMvd(fsTs)).toBe('15:30');
    });
    it('acepta Firestore Timestamp con solo seconds', () => {
      const fsTs = { seconds: Math.floor(sampleUtc.getTime() / 1000) };
      expect(formatHoraMvd(fsTs)).toBe('15:30');
    });
    it('rechaza string inválido', () => {
      expect(formatHoraMvd('no-es-fecha')).toBe('—');
    });
  });

  describe('formatHoraSegundosMvd', () => {
    it('devuelve HH:MM:SS', () => {
      expect(formatHoraSegundosMvd(sampleUtc)).toBe('15:30:45');
    });
  });

  describe('formatFechaMvd', () => {
    it('devuelve DD/MM/YYYY', () => {
      expect(formatFechaMvd(sampleUtc)).toBe('23/04/2026');
    });
    // Caso edge: la hora en UTC dice "24 de abril" pero en Montevideo sigue siendo 23
    it('respeta la zona horaria en el cambio de día', () => {
      const utcNewDay = new Date('2026-04-24T02:00:00Z'); // 23:00 Montevideo del 23
      expect(formatFechaMvd(utcNewDay)).toBe('23/04/2026');
    });
  });

  describe('formatFechaHoraMvd', () => {
    it('devuelve DD/MM/YYYY HH:MM', () => {
      const res = formatFechaHoraMvd(sampleUtc);
      // Intl puede usar ", " o " " — verificamos contenidos
      expect(res).toContain('23/04/2026');
      expect(res).toContain('15:30');
    });
  });

  describe('formatRelativoMvd', () => {
    it('ahora → "ahora"', () => {
      expect(formatRelativoMvd(new Date())).toBe('ahora');
    });
    it('hace 30 segundos', () => {
      const d = new Date(Date.now() - 30_000);
      expect(formatRelativoMvd(d)).toMatch(/hace \d+ s/);
    });
    it('hace varios minutos', () => {
      const d = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatRelativoMvd(d)).toMatch(/hace 5 min/);
    });
    it('dentro del día pero más de una hora', () => {
      const d = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatRelativoMvd(d)).toMatch(/^hoy \d{2}:\d{2}$/);
    });
    it('más de 24h usa formato completo', () => {
      const d = new Date(Date.now() - 48 * 60 * 60 * 1000);
      expect(formatRelativoMvd(d)).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });

  describe('toIsoMvd', () => {
    it('devuelve ISO con offset -03:00', () => {
      const iso = toIsoMvd(sampleUtc);
      expect(iso).toBe('2026-04-23T15:30:45-03:00');
    });
    it('devuelve null para null', () => {
      expect(toIsoMvd(null)).toBeNull();
    });
  });
});
