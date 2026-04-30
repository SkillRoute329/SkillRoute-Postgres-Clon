/**
 * fleetMonitorUtils.ts
 * Lógica pura del Radar de Flota — sin dependencias de React ni del DOM.
 * Importada por FleetMonitorModule y cubierta por tests en __tests__/fleetMonitor.test.ts.
 */

export interface BusLive {
  id:            string;
  codigoBus:     string;
  empresa:       string;
  empresaId:     number;
  linea:         string;
  sublinea:      string | null;
  destino:       string;
  lat:           number;
  lng:           number;
  timestamp:     string;
  // Campos enriquecidos de la API oficial IMM (opcionales — ausentes en fuente STM)
  velocidadKmh?: number;
  acceso?:       string;   // "PISO BAJO" | "COMÚN" | "SIN DATOS"
  climatizacion?: string;  // "Aire Acondicionado" | "SIN DATOS"
  emisiones?:    string;   // "Cero emisiones" | "SIN DATOS"
  fuente?:       'IMM_OFICIAL' | 'STM';
}

export interface AlertaBunching {
  linea:       string;
  bus1:        string;
  bus2:        string;
  distanciaKm: number;
}

export interface KPIs {
  totalPropios:   number;
  totalRivales:   number;
  lineasActivas:  number;
  bunchingPares:  number;
  empresas:       Record<string, number>;
}

// ─── Haversine ────────────────────────────────────────────────────────────────

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Normalización de respuesta del backend ───────────────────────────────────

export function normalizarBuses(raw: Record<string, unknown>[], fuente: 'IMM_OFICIAL' | 'STM' = 'STM'): BusLive[] {
  return raw.map((b, i) => {
    const vel = b.velocidadKmh !== undefined ? Number(b.velocidadKmh) : undefined;
    const acc = b.acceso       ? String(b.acceso)       : undefined;
    const cli = b.climatizacion ? String(b.climatizacion) : undefined;
    const emi = b.emisiones    ? String(b.emisiones)    : undefined;
    return {
      id:            String(b.id ?? b.idBus ?? b.codigoBus ?? i),
      codigoBus:     String(b.codigoBus ?? b.idBus ?? ''),
      empresa:       String(b.empresa   ?? ''),
      empresaId:     Number(b.empresaId ?? 0),
      linea:         String(b.linea     ?? ''),
      sublinea:      (b.sublinea as string | null) ?? null,
      destino:       String(b.destino   ?? ''),
      lat:           Number(b.lat),
      lng:           Number(b.lng),
      timestamp:     String(b.timestamp ?? ''),
      fuente,
      ...(vel !== undefined ? { velocidadKmh: vel } : {}),
      ...(acc ? { acceso:       acc } : {}),
      ...(cli ? { climatizacion: cli } : {}),
      ...(emi ? { emisiones:    emi } : {}),
    };
  });
}

// ─── Detección de bunching ────────────────────────────────────────────────────

/** Umbral en km por debajo del cual dos buses de la misma línea están en bunching */
export const BUNCHING_UMBRAL_KM = 0.8;

export function detectarBunching(propios: BusLive[]): AlertaBunching[] {
  const alertas: AlertaBunching[] = [];
  for (let i = 0; i < propios.length; i++) {
    for (let j = i + 1; j < propios.length; j++) {
      if (propios[i].linea !== propios[j].linea) continue;
      const dist = haversineKm(propios[i].lat, propios[i].lng, propios[j].lat, propios[j].lng);
      if (dist < BUNCHING_UMBRAL_KM) {
        alertas.push({
          linea:       propios[i].linea,
          bus1:        propios[i].codigoBus,
          bus2:        propios[j].codigoBus,
          distanciaKm: Math.round(dist * 1000) / 1000,
        });
      }
    }
  }
  return alertas;
}

// ─── Cálculo de KPIs ──────────────────────────────────────────────────────────

export function calcularKPIs(todos: BusLive[], empresaPropia: number): KPIs {
  const propios  = todos.filter((b) => b.empresaId === empresaPropia);
  const rivales  = todos.filter((b) => b.empresaId !== empresaPropia);
  const alertas  = detectarBunching(propios);

  const lineasActivas = new Set(propios.map((b) => b.linea).filter(Boolean)).size;
  const empresas: Record<string, number> = {};
  for (const b of todos) {
    if (!b.empresa) continue;
    empresas[b.empresa] = (empresas[b.empresa] || 0) + 1;
  }

  return {
    totalPropios:  propios.length,
    totalRivales:  rivales.length,
    lineasActivas,
    bunchingPares: alertas.length,
    empresas,
  };
}
