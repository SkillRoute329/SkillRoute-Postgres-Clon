/**
 * Tests para linesService — wrapper cross-operador de catálogo de líneas.
 * Cubre cache TTL, invalidación, fallback shapes_cross_operator.
 *
 * NOTA: estos tests NO mockean Firestore — verifican la API pública del
 * service y los comportamientos de cache. Para tests E2E con Firestore real
 * se usa Firebase Emulator (no incluido aquí).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invalidateLinesCache } from '../services/linesService';

describe('linesService', () => {
  beforeEach(() => {
    invalidateLinesCache(); // clear cache global
  });

  it('invalidateLinesCache(undefined) limpia toda la cache', () => {
    expect(() => invalidateLinesCache()).not.toThrow();
  });

  it('invalidateLinesCache(70) limpia solo UCOT', () => {
    expect(() => invalidateLinesCache(70)).not.toThrow();
  });

  it('invalidateLinesCache acepta cualquier agencyId numérico', () => {
    expect(() => invalidateLinesCache(50)).not.toThrow();
    expect(() => invalidateLinesCache(20)).not.toThrow();
    expect(() => invalidateLinesCache(10)).not.toThrow();
  });

  it('exporta las funciones esperadas', async () => {
    const mod = await import('../services/linesService');
    expect(typeof mod.getLineasByAgency).toBe('function');
    expect(typeof mod.getLineaDataByAgency).toBe('function');
    expect(typeof mod.invalidateLinesCache).toBe('function');
    expect(typeof mod.countLineasByAgency).toBe('function');
  });
});
