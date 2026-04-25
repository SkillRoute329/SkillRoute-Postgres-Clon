/**
 * Tests para monitoring.ts — wrapper Sentry-ready.
 * Verifica que sin DSN configurada, el wrapper no rompe y cae a console.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureException, captureMessage, monitoringStatus } from '../services/monitoring';

describe('monitoring (sin Sentry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captureException no lanza con error simple', () => {
    expect(() => captureException(new Error('test')))
      .not.toThrow();
  });

  it('captureException acepta context con tag/extra/level', () => {
    expect(() => captureException(new Error('test'), {
      tag: 'unit-test',
      extra: { foo: 'bar' },
      level: 'warning',
    })).not.toThrow();
  });

  it('captureMessage acepta todos los niveles', () => {
    const levels = ['fatal', 'error', 'warning', 'info', 'debug'] as const;
    for (const lvl of levels) {
      expect(() => captureMessage(`msg ${lvl}`, lvl)).not.toThrow();
    }
  });

  it('monitoringStatus devuelve estructura esperada', () => {
    const s = monitoringStatus();
    expect(s).toHaveProperty('enabled');
    expect(s).toHaveProperty('initialized');
    expect(s).toHaveProperty('bufferedEvents');
    expect(typeof s.enabled).toBe('boolean');
    expect(typeof s.initialized).toBe('boolean');
    expect(typeof s.bufferedEvents).toBe('number');
  });
});
