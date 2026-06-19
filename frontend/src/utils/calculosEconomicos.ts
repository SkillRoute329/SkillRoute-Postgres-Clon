/**
 * calculosEconomicos.ts — Fórmulas económicas críticas de la red (IVA, elasticidades, break-even, OTP)
 * Mes+1 #5 (2026-04-23)
 */

// ─── Fórmula de ingresos brutos/netos con IVA ───────────────────────
export function calcularIngresos(
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
export function breakEvenPax(
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
export function penalizacionDemanda(flotaDelta: number, elasticidad: number): number {
  return flotaDelta > 0 ? 1 - flotaDelta * elasticidad : 1;
}

// ─── OTP asimétrico UITP ────────────────────────────────────────────
export function otpEstado(
  desviacionMin: number,
  earlyMin: number,
  lateMin: number,
): 'ATRASADO' | 'ADELANTADO' | 'EN_TIEMPO' {
  if (desviacionMin > lateMin) return 'ATRASADO';
  if (desviacionMin < earlyMin) return 'ADELANTADO';
  return 'EN_TIEMPO';
}
