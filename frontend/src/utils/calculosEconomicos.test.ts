/**
 * Tests — fórmula económica (IVA + elasticidad + OTP asimétrico)
 * Mes+1 #5 (2026-04-23)
 *
 * Reimplementación inline de fórmulas críticas para testearlas aisladas
 * (sin React, sin Firestore). Si la fórmula cambia en producción, actualizar
 * acá y verificar que los casos siguen dando el mismo resultado.
 */

import { describe, it, expect } from 'vitest';

// ─── Fórmula de ingresos brutos/netos con IVA ───────────────────────
function calcularIngresos(
  viajes: number,
  pax: number,
  tarifa: number,
  iva: number,
): { brutos: number; iva: number; netos: number } {
  const brutos = viajes * pax * tarifa;
  const ivaMonto = brutos * iva;
  return { brutos, iva: ivaMonto, netos: brutos - ivaMonto };
}

// ─── Break-even sobre netos ─────────────────────────────────────────
function breakEvenPax(
  costosDia: number,
  viajesDia: number,
  tarifa: number,
  iva: number,
): number {
  const tarifaNeta = tarifa * (1 - iva);
  return viajesDia > 0 && tarifaNeta > 0
    ? Math.ceil(costosDia / (viajesDia * tarifaNeta))
    : 0;
}

// ─── Elasticidad demanda vs reducción flota ─────────────────────────
function penalizacionDemanda(flotaDelta: number, elasticidad: number): number {
  return flotaDelta > 0 ? 1 - flotaDelta * elasticidad : 1;
}

// ─── OTP asimétrico UITP ────────────────────────────────────────────
function otpEstado(
  desviacionMin: number,
  earlyMin: number,
  lateMin: number,
): 'ATRASADO' | 'ADELANTADO' | 'EN_TIEMPO' {
  if (desviacionMin > lateMin) return 'ATRASADO';
  if (desviacionMin < earlyMin) return 'ADELANTADO';
  return 'EN_TIEMPO';
}

describe('Fórmula de ingresos con IVA (Pre-CUTCSA #3)', () => {
  it('IVA 0: brutos === netos', () => {
    const r = calcularIngresos(10, 28, 45, 0);
    expect(r.brutos).toBe(12_600);
    expect(r.iva).toBe(0);
    expect(r.netos).toBe(12_600);
  });

  it('IVA 0.22: reparte correctamente', () => {
    const r = calcularIngresos(10, 28, 45, 0.22);
    expect(r.brutos).toBe(12_600);
    expect(r.iva).toBeCloseTo(2_772, 2);
    expect(r.netos).toBeCloseTo(9_828, 2);
  });

  it('IVA 0.10 (mínimo Uruguay)', () => {
    const r = calcularIngresos(14, 30, 45, 0.10);
    expect(r.brutos).toBe(18_900);
    expect(r.iva).toBeCloseTo(1_890, 2);
    expect(r.netos).toBeCloseTo(17_010, 2);
  });

  it('sin viajes → ingresos 0', () => {
    const r = calcularIngresos(0, 28, 45, 0);
    expect(r.brutos).toBe(0);
    expect(r.netos).toBe(0);
  });
});

describe('Break-even con IVA', () => {
  it('sin IVA: resultado estándar', () => {
    const be = breakEvenPax(5_400, 10, 45, 0);
    // 5400 / (10 * 45) = 12
    expect(be).toBe(12);
  });

  it('con IVA 22 %: necesita vender más para absorber el impuesto', () => {
    const sinIva = breakEvenPax(5_400, 10, 45, 0);
    const conIva = breakEvenPax(5_400, 10, 45, 0.22);
    expect(conIva).toBeGreaterThan(sinIva);
  });

  it('devuelve 0 si no hay viajes', () => {
    expect(breakEvenPax(5_400, 0, 45, 0)).toBe(0);
  });
});

describe('Elasticidad demanda vs flota (Fase 1 #3 / TRL593)', () => {
  it('flotaDelta=0 no penaliza', () => {
    expect(penalizacionDemanda(0, 0.002)).toBe(1);
  });

  it('-10 % flota con 0.002 → 98 % demanda', () => {
    expect(penalizacionDemanda(10, 0.002)).toBeCloseTo(0.98, 5);
  });

  it('-30 % flota con 0.002 → 94 % demanda', () => {
    expect(penalizacionDemanda(30, 0.002)).toBeCloseTo(0.94, 5);
  });

  it('aumento de flota (delta negativo) no penaliza', () => {
    // Por contrato del simulador, solo penalizamos reducciones
    expect(penalizacionDemanda(-10, 0.002)).toBe(1);
  });
});

describe('OTP asimétrico UITP/TfL (Fase 1 #1)', () => {
  it('desvío 0 → EN_TIEMPO', () => {
    expect(otpEstado(0, -1, 3)).toBe('EN_TIEMPO');
  });
  it('desvío +2 (2 min atrasado) → EN_TIEMPO', () => {
    expect(otpEstado(2, -1, 3)).toBe('EN_TIEMPO');
  });
  it('desvío +4 (4 min atrasado) → ATRASADO', () => {
    expect(otpEstado(4, -1, 3)).toBe('ATRASADO');
  });
  it('desvío -2 (2 min adelantado) → ADELANTADO', () => {
    // Crítico: el umbral asimétrico hace que -2 YA sea adelantado
    // (antes era ±3 simétrico → -2 era "EN_TIEMPO" falsamente)
    expect(otpEstado(-2, -1, 3)).toBe('ADELANTADO');
  });
  it('desvío -1 (exactamente en el umbral) → EN_TIEMPO', () => {
    // Convención: < earlyMin es ADELANTADO, -1 no es < -1
    expect(otpEstado(-1, -1, 3)).toBe('EN_TIEMPO');
  });
});
