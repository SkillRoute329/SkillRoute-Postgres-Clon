/**
 * Tests — tendencia por regresión lineal OLS
 * Trim+ #71 (2026-04-23)
 *
 * Reimplementa la lógica del `calcularTendencia` del backend
 * para testearla aisladamente (sin dependencia de Firestore).
 */

import { describe, it, expect } from 'vitest';

/** Misma implementación que `backend/src/services/forecastService.ts:calcularTendencia`. */
function tendenciaOLS(valores: number[]): 'creciente' | 'estable' | 'decreciente' {
  if (valores.length < 10) return 'estable';
  const n = valores.length;
  const ys = valores;
  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }
  const m = ssXX > 0 ? ssXY / ssXX : 0;
  const r2 = ssXX > 0 && ssYY > 0 ? (ssXY * ssXY) / (ssXX * ssYY) : 0;
  if (r2 < 0.2) return 'estable';
  if (m > 1) return 'creciente';
  if (m < -1) return 'decreciente';
  return 'estable';
}

describe('Tendencia por regresión OLS (Mes+1 correctitud #62)', () => {
  it('menos de 10 registros → estable', () => {
    expect(tendenciaOLS([100, 110, 120, 130, 140])).toBe('estable');
  });

  it('serie perfectamente creciente (lineal, R²=1) → creciente', () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 + i * 5);
    expect(tendenciaOLS(vals)).toBe('creciente');
  });

  it('serie perfectamente decreciente → decreciente', () => {
    const vals = Array.from({ length: 30 }, (_, i) => 500 - i * 5);
    expect(tendenciaOLS(vals)).toBe('decreciente');
  });

  it('serie con ruido pero tendencia creciente clara → creciente', () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 + i * 3 + (Math.sin(i) * 5));
    expect(tendenciaOLS(vals)).toBe('creciente');
  });

  it('serie con ruido puro (sin tendencia) → estable (R² bajo)', () => {
    // Ruido centrado en 100, sin pendiente
    const vals = Array.from({ length: 30 }, (_, i) => 100 + (Math.sin(i * 7) * 20));
    expect(tendenciaOLS(vals)).toBe('estable');
  });

  it('serie con pendiente muy pequeña (<1 boleto/día) → estable', () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 + i * 0.1);
    expect(tendenciaOLS(vals)).toBe('estable');
  });

  it('serie constante → estable (R²=0)', () => {
    const vals = Array.from({ length: 30 }, () => 100);
    expect(tendenciaOLS(vals)).toBe('estable');
  });

  it('serie con outlier único no domina (OLS es robusto-ish)', () => {
    const vals = Array.from({ length: 30 }, (_, i) => 100 + i * 3);
    vals[15] = 1000; // outlier gigante
    // La pendiente sigue positiva, debería seguir siendo creciente
    expect(tendenciaOLS(vals)).toBe('creciente');
  });
});
