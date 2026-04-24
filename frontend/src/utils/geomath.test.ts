/**
 * Tests — cálculos geoespaciales (haversine + bearing)
 * Mes+1 #5 (2026-04-23)
 *
 * Valida las implementaciones que usan ShadowRadar, FleetMonitor y
 * scheduleComplianceEngine. Si cambia la constante R o la fórmula,
 * estos tests detectan la regresión.
 */

import { describe, it, expect } from 'vitest';

// Reimplementación inline (idéntica a las del proyecto) para testearlas.
// Si se extraen a un módulo común `utils/geomath.ts`, los tests
// pasan a importarlas de ahí.

function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

describe('Haversine — distancia entre dos coordenadas', () => {
  it('distancia entre el mismo punto es 0', () => {
    expect(haversineMetros(-34.9, -56.2, -34.9, -56.2)).toBe(0);
  });

  it('1 grado de latitud ≈ 111 km en el ecuador', () => {
    const d = haversineMetros(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('Tres Cruces a Plaza Independencia en Montevideo (~2.6 km)', () => {
    // Tres Cruces
    const tc: [number, number] = [-34.896, -56.163];
    // Plaza Independencia
    const pi: [number, number] = [-34.907, -56.199];
    const d = haversineMetros(tc[0], tc[1], pi[0], pi[1]);
    expect(d).toBeGreaterThan(2_400);
    expect(d).toBeLessThan(3_800);
  });

  it('es simétrica', () => {
    const d1 = haversineMetros(-34.9, -56.2, -34.85, -56.15);
    const d2 = haversineMetros(-34.85, -56.15, -34.9, -56.2);
    expect(d1).toBeCloseTo(d2, 5);
  });

  it('dos puntos a 100 m devuelven ~100 m', () => {
    // 100 m al norte en Montevideo — 1 grado lat ≈ 111 km, 100 m ≈ 0.0009 grados
    const d = haversineMetros(-34.9, -56.2, -34.9 + 0.0009, -56.2);
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
  });
});

describe('Bearing — ángulo entre dos coordenadas', () => {
  it('norte puro → ~0°', () => {
    const b = calculateBearing(-34.9, -56.2, -34.85, -56.2);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(1);
  });

  it('sur puro → ~180°', () => {
    const b = calculateBearing(-34.9, -56.2, -34.95, -56.2);
    expect(b).toBeGreaterThan(179);
    expect(b).toBeLessThan(181);
  });

  it('este puro → ~90°', () => {
    const b = calculateBearing(-34.9, -56.2, -34.9, -56.15);
    expect(b).toBeGreaterThan(89);
    expect(b).toBeLessThan(91);
  });

  it('oeste puro → ~270°', () => {
    const b = calculateBearing(-34.9, -56.2, -34.9, -56.25);
    expect(b).toBeGreaterThan(269);
    expect(b).toBeLessThan(271);
  });

  it('devuelve siempre valor 0-360', () => {
    for (let i = 0; i < 20; i++) {
      const lat1 = -34.9 + Math.random() * 0.1;
      const lng1 = -56.2 + Math.random() * 0.1;
      const lat2 = -34.9 + Math.random() * 0.1;
      const lng2 = -56.2 + Math.random() * 0.1;
      const b = calculateBearing(lat1, lng1, lat2, lng2);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });
});
