import { collection, getDocs, query, where, limit, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { fetchEtapaStats } from './etapaStatsService';

// ── Tipos públicos ───────────────────────────────────────────────────────────

export interface CorredorRiesgo {
  lineaPropia: string;
  sentidoPropio: string;
  lineaRival: string;
  empresaRival: string;
  sharedKm: number;
  shareActual: number;
  shareAnterior: number | null;
  delta: number | null;
  tendencia: 'perdiendo' | 'ganando' | 'estable' | 'sin_datos';
  pasajerosEstimados: number | null;
}

export interface Bloque1Result {
  sinDatos: boolean;
  totalCorredores: number;
  enRiesgo: CorredorRiesgo[];
  ganando: CorredorRiesgo[];
  conclusion: string;
}

export interface LineaOTPCritico {
  linea: string;
  sentido: string;
  otpPromedio: number;
  totalPasadas: number;
}

export interface CocheAnomalo {
  idBus: string;
  linea: string;
  otpCoche: number;
  otpLinea: number;
  diferencia: number;
  muestras: number;
}

export interface EtapaCritica {
  linea: string;
  directionId: number;
  paradaIdx: number;
  nombreParada: string;
  pctEnTiempo: number;
  totalEventos: number;
}

export interface BunchingAlerta {
  linea: string;
  sentido: string;
  coche1: string;
  coche2: string;
  distanciaMetros: number;
  duracionMin: number;
  ts: string;
}

export interface Bloque2Result {
  sinDatos: boolean;
  otpCritico: LineaOTPCritico[];
  cochesAnomalos: CocheAnomalo[];
  etapasCriticas: EtapaCritica[];
  bunchingAlertas: BunchingAlerta[];
  totalDetecciones: number;
  conclusion: string;
}

export interface LineaComparativa {
  lineaPropia: string;
  sentido: string;
  lineaRival: string;
  empresaRival: string;
  otpPropio: number | null;
  otpRival: number | null;
  diferencia: number | null;
  velPropia: number | null;
  velRival: number | null;
}

export interface Bloque3Result {
  sinDatos: boolean;
  comparativas: LineaComparativa[];
  lineasSuperior: number;
  lineasInferior: number;
  conclusion: string;
}

export interface Recomendacion {
  prioridad: 'alta' | 'media' | 'baja';
  titulo: string;
  razon: string;
  impactoEstimado: string;
  plazo: string;
}

export interface Bloque4Result {
  recomendaciones: Recomendacion[];
  conclusion: string;
}

export interface DiagnosticoCompleto {
  agencyId: string;
  empresaNombre: string;
  generadoEn: Date;
  bloque1: Bloque1Result;
  bloque2: Bloque2Result;
  bloque3: Bloque3Result;
  bloque4: Bloque4Result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const EMPRESA_NOMBRES: Record<string, string> = {
  '70': 'UCOT', '50': 'CUTCSA', '20': 'COME', '10': 'COETC',
};

function otpDesde(eventos: Array<{ estadoCumplimiento: string }>): number | null {
  const validos = eventos.filter(e => e.estadoCumplimiento !== 'SIN_HORARIO');
  if (validos.length < 10) return null;
  const enTiempo = validos.filter(e => e.estadoCumplimiento === 'EN_TIEMPO').length;
  return Math.round((enTiempo / validos.length) * 100);
}

function velPromedio(eventos: Array<{ velocidad?: number }>): number | null {
  const conVel = eventos.filter(e => typeof e.velocidad === 'number' && e.velocidad > 0);
  if (conVel.length < 5) return null;
  return Math.round(conVel.reduce((s, e) => s + (e.velocidad ?? 0), 0) / conVel.length);
}

// ── Fetchers por colección ───────────────────────────────────────────────────

async function fetchVehicleEvents(agencyId: string, maxDocs = 2000) {
  const q = query(
    collection(db, 'vehicle_events'),
    where('agencyId', '==', agencyId),
    limit(maxDocs),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as {
    idBus: string; linea: string; sentido: string; agencyId: string;
    empresa: string; estadoCumplimiento: string; desviacionMin: number;
    velocidad?: number; createdAt?: { toDate?: () => Date } | Date;
  });
}

async function fetchCorredoresContraRivales(agencyId: string) {
  const [snapA, snapB] = await Promise.all([
    getDocs(query(
      collection(db, 'corridor_overlap'),
      where('agencyA', '==', agencyId),
      where('sameEmpresa', '==', false),
    )),
    getDocs(query(
      collection(db, 'corridor_overlap'),
      where('agencyB', '==', agencyId),
      where('sameEmpresa', '==', false),
    )),
  ]);

  const pares: Array<{
    lineaPropia: string; sentidoPropio: string;
    lineaRival: string; empresaRival: string; agencyRival: string;
    sharedKm: number;
  }> = [];

  snapA.docs.forEach(d => {
    const data = d.data();
    pares.push({
      lineaPropia: String(data.lineaA), sentidoPropio: data.sentidoA ?? '',
      lineaRival: String(data.lineaB), empresaRival: data.empresaB ?? '',
      agencyRival: String(data.agencyB), sharedKm: data.sharedKm ?? 0,
    });
  });
  snapB.docs.forEach(d => {
    const data = d.data();
    pares.push({
      lineaPropia: String(data.lineaB), sentidoPropio: data.sentidoB ?? '',
      lineaRival: String(data.lineaA), empresaRival: data.empresaA ?? '',
      agencyRival: String(data.agencyA), sharedKm: data.sharedKm ?? 0,
    });
  });

  return pares;
}

// ── Bloque 1: Pérdida de mercado ─────────────────────────────────────────────

async function calcBloque1(agencyId: string): Promise<Bloque1Result> {
  const [eventos, pares] = await Promise.all([
    fetchVehicleEvents(agencyId, 2000),
    fetchCorredoresContraRivales(agencyId),
  ]);

  if (pares.length === 0 || eventos.length === 0) {
    return { sinDatos: true, totalCorredores: 0, enRiesgo: [], ganando: [], conclusion: 'Sin datos de corredores compartidos.' };
  }

  // Obtener agencias rivales únicas y sus eventos
  const agenciasRivales = [...new Set(pares.map(p => p.agencyRival))];
  const eventosRivalesPromises = agenciasRivales.map(ag => fetchVehicleEvents(ag, 1000));
  const eventosRivalesArrays = await Promise.all(eventosRivalesPromises);
  const eventosRivalesPorAgency: Record<string, typeof eventos> = {};
  agenciasRivales.forEach((ag, i) => { eventosRivalesPorAgency[ag] = eventosRivalesArrays[i]; });

  // Agrupar eventos propios por (linea, sentido)
  const propiosPorLinea: Record<string, typeof eventos> = {};
  eventos.forEach(e => {
    const key = `${e.linea}__${e.sentido}`;
    if (!propiosPorLinea[key]) propiosPorLinea[key] = [];
    propiosPorLinea[key].push(e);
  });

  // Partir en dos mitades temporales para calcular delta
  const ahora = Date.now();
  const mitad = ahora - 3.5 * 24 * 3600 * 1000;

  function esMitadReciente(e: { createdAt?: { toDate?: () => Date } | Date }): boolean {
    const fecha = e.createdAt instanceof Date ? e.createdAt
      : typeof (e.createdAt as any)?.toDate === 'function' ? (e.createdAt as any).toDate()
      : null;
    return fecha ? fecha.getTime() > mitad : true;
  }

  const corredores: CorredorRiesgo[] = [];

  for (const par of pares) {
    const keyPropio = `${par.lineaPropia}__${par.sentidoPropio}`;
    const propios = propiosPorLinea[keyPropio] ?? [];
    const rivales = (eventosRivalesPorAgency[par.agencyRival] ?? [])
      .filter(e => String(e.linea) === par.lineaRival);

    const propiosActual = propios.filter(esMitadReciente).length;
    const rivalesActual = (rivales.filter(esMitadReciente)).length;
    const propiosAnterior = propios.filter(e => !esMitadReciente(e)).length;
    const rivalesAnterior = rivales.filter(e => !esMitadReciente(e)).length;

    const totalActual = propiosActual + rivalesActual;
    const totalAnterior = propiosAnterior + rivalesAnterior;

    if (totalActual < 5) continue; // sin datos suficientes para este corredor

    const shareActual = Math.round((propiosActual / totalActual) * 100);
    const shareAnterior = totalAnterior >= 5
      ? Math.round((propiosAnterior / totalAnterior) * 100)
      : null;
    const delta = shareAnterior !== null ? shareActual - shareAnterior : null;

    let tendencia: CorredorRiesgo['tendencia'] = 'sin_datos';
    if (delta !== null) {
      if (delta <= -5) tendencia = 'perdiendo';
      else if (delta >= 5) tendencia = 'ganando';
      else tendencia = 'estable';
    }

    corredores.push({
      lineaPropia: par.lineaPropia,
      sentidoPropio: par.sentidoPropio,
      lineaRival: par.lineaRival,
      empresaRival: par.empresaRival,
      sharedKm: par.sharedKm,
      shareActual,
      shareAnterior,
      delta,
      tendencia,
      pasajerosEstimados: tendencia === 'perdiendo' && delta !== null
        ? Math.abs(delta) * 8  // estimación conservadora: 8 pasajeros por punto perdido
        : null,
    });
  }

  const enRiesgo = corredores
    .filter(c => c.tendencia === 'perdiendo')
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
    .slice(0, 5);

  const ganando = corredores
    .filter(c => c.tendencia === 'ganando')
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    .slice(0, 3);

  const empresa = EMPRESA_NOMBRES[agencyId] ?? agencyId;
  let conclusion = `Sin variaciones significativas de mercado detectadas.`;
  if (enRiesgo.length > 0) {
    const peor = enRiesgo[0];
    conclusion = `${empresa} pierde terreno en ${enRiesgo.length} corredor${enRiesgo.length > 1 ? 'es' : ''}. `
      + `Caída más grave: L${peor.lineaPropia} ${peor.sentidoPropio} frente a ${peor.empresaRival} L${peor.lineaRival}`
      + (peor.delta !== null ? ` (${peor.delta} pts en 3 días).` : '.');
  } else if (ganando.length > 0) {
    conclusion = `${empresa} gana terreno en ${ganando.length} corredor${ganando.length > 1 ? 'es' : ''} sin pérdidas detectadas.`;
  }

  return { sinDatos: false, totalCorredores: corredores.length, enRiesgo, ganando, conclusion };
}

// ── Bloque 2: Inconsistencias internas ──────────────────────────────────────

async function calcBloque2(agencyId: string): Promise<Bloque2Result> {
  const eventos = await fetchVehicleEvents(agencyId, 2000);

  if (eventos.length < 20) {
    return {
      sinDatos: true, otpCritico: [], cochesAnomalos: [], etapasSinDatos: true,
      bunchingAlertas: [], totalDetecciones: 0,
      conclusion: 'Sin datos suficientes para auditoría interna.',
    };
  }

  // A) Líneas con OTP crónicamente bajo (< 65%)
  const porLinea: Record<string, typeof eventos> = {};
  eventos.forEach(e => {
    const key = `${e.linea}__${e.sentido}`;
    if (!porLinea[key]) porLinea[key] = [];
    porLinea[key].push(e);
  });

  const otpCritico: LineaOTPCritico[] = Object.entries(porLinea)
    .filter(([, evs]) => evs.length >= 15)
    .map(([key, evs]) => {
      const [linea, sentido] = key.split('__');
      const otp = otpDesde(evs);
      return { linea, sentido, otpPromedio: otp ?? 0, totalPasadas: evs.length };
    })
    .filter(r => r.otpPromedio > 0 && r.otpPromedio < 65)
    .sort((a, b) => a.otpPromedio - b.otpPromedio)
    .slice(0, 5);

  // B) Coches anómalos
  const porCocheLinea: Record<string, typeof eventos> = {};
  eventos.forEach(e => {
    const key = `${e.idBus}__${e.linea}`;
    if (!porCocheLinea[key]) porCocheLinea[key] = [];
    porCocheLinea[key].push(e);
  });

  const cochesAnomalos: CocheAnomalo[] = [];
  for (const [key, evs] of Object.entries(porCocheLinea)) {
    if (evs.length < 10) continue;
    const [idBus, linea] = key.split('__');
    const otpCoche = otpDesde(evs);
    if (otpCoche === null) continue;
    // Comparar con promedio de la línea (todos los coches)
    const todasLinea = eventos.filter(e => String(e.linea) === linea);
    const otpLinea = otpDesde(todasLinea);
    if (otpLinea === null) continue;
    const diferencia = otpCoche - otpLinea;
    if (diferencia < -20) {
      cochesAnomalos.push({ idBus, linea, otpCoche, otpLinea, diferencia, muestras: evs.length });
    }
  }
  cochesAnomalos.sort((a, b) => a.diferencia - b.diferencia).splice(5);

  // C) Etapas críticas — paradas con OTP < 60% en las líneas detectadas
  const etapasCriticas: EtapaCritica[] = [];
  for (const lcrit of otpCritico) {
    const dirs = lcrit.sentido === 'IDA' ? [0] : lcrit.sentido === 'VUELTA' ? [1] : [0, 1];
    for (const dir of dirs) {
      try {
        const ed = await fetchEtapaStats(agencyId, lcrit.linea, dir);
        if (!ed) continue;
        ed.paradas
          .filter(p => p.total >= 10 && p.pctEnTiempo < 60)
          .sort((a, b) => a.pctEnTiempo - b.pctEnTiempo)
          .slice(0, 2)
          .forEach(p => {
            etapasCriticas.push({
              linea: lcrit.linea,
              directionId: dir,
              paradaIdx: p.paradaIdx,
              nombreParada: p.nombre || `Parada ${p.paradaIdx}`,
              pctEnTiempo: p.pctEnTiempo,
              totalEventos: p.total,
            });
          });
      } catch (e) {
        console.warn('[Bloque2] etapa_stats falló para', lcrit.linea, dir, e);
      }
    }
  }
  etapasCriticas.sort((a, b) => a.pctEnTiempo - b.pctEnTiempo).splice(8);

  // D) Bunching — dos buses de la misma línea y sentido con eventos muy cercanos en tiempo
  const bunchingAlertas: BunchingAlerta[] = [];
  const eventosPorLineaSentido: Record<string, typeof eventos> = {};
  eventos.forEach(e => {
    if (!e.linea || !e.sentido || e.sentido === 'AMBOS') return;
    const key = `${e.linea}__${e.sentido}`;
    if (!eventosPorLineaSentido[key]) eventosPorLineaSentido[key] = [];
    eventosPorLineaSentido[key].push(e);
  });

  function evToMs(e: { createdAt?: { toDate?: () => Date } | Date }): number {
    if (!e.createdAt) return 0;
    if (e.createdAt instanceof Date) return e.createdAt.getTime();
    if (typeof (e.createdAt as any).toDate === 'function') return (e.createdAt as any).toDate().getTime();
    return 0;
  }

  for (const [key, evs] of Object.entries(eventosPorLineaSentido)) {
    if (bunchingAlertas.length >= 5) break;
    if (evs.length < 4) continue;
    const [linea, sentido] = key.split('__');
    const porBus: Record<string, typeof evs> = {};
    evs.forEach(e => {
      const bid = String(e.idBus);
      if (!porBus[bid]) porBus[bid] = [];
      porBus[bid].push(e);
    });
    const ids = Object.keys(porBus);
    for (let i = 0; i < ids.length && bunchingAlertas.length < 5; i++) {
      for (let j = i + 1; j < ids.length && bunchingAlertas.length < 5; j++) {
        for (const ea of porBus[ids[i]]) {
          const taMs = evToMs(ea);
          if (!taMs) continue;
          const cercano = porBus[ids[j]].find(eb => {
            const tbMs = evToMs(eb);
            return tbMs > 0 && Math.abs(tbMs - taMs) < 3 * 60_000;
          });
          if (cercano) {
            const diffMin = Math.round(Math.abs(evToMs(cercano) - taMs) / 60_000);
            const tsIso = ea.createdAt instanceof Date
              ? ea.createdAt.toISOString()
              : typeof (ea.createdAt as any)?.toDate === 'function'
              ? (ea.createdAt as any).toDate().toISOString()
              : new Date().toISOString();
            bunchingAlertas.push({ linea, sentido, coche1: ids[i], coche2: ids[j], distanciaMetros: 0, duracionMin: diffMin, ts: tsIso });
            break;
          }
        }
      }
    }
  }

  const empresa = EMPRESA_NOMBRES[agencyId] ?? agencyId;
  const totalDetecciones = otpCritico.length + cochesAnomalos.length + etapasCriticas.length + bunchingAlertas.length;

  const partes: string[] = [];
  if (otpCritico.length)      partes.push(`${otpCritico.length} línea${otpCritico.length > 1 ? 's' : ''} con OTP crítico`);
  if (cochesAnomalos.length)  partes.push(`${cochesAnomalos.length} coche${cochesAnomalos.length > 1 ? 's' : ''} anómalo${cochesAnomalos.length > 1 ? 's' : ''}`);
  if (etapasCriticas.length)  partes.push(`${etapasCriticas.length} parada${etapasCriticas.length > 1 ? 's' : ''} con baja puntualidad`);
  if (bunchingAlertas.length) partes.push(`${bunchingAlertas.length} bunching detectado${bunchingAlertas.length > 1 ? 's' : ''}`);

  const conclusion = totalDetecciones === 0
    ? `No se detectaron inconsistencias internas significativas en ${empresa}.`
    : `Detectamos ${totalDetecciones} inconsistencia${totalDetecciones > 1 ? 's' : ''} internas en ${empresa}: ${partes.join(', ')}.`;

  return { sinDatos: false, otpCritico, cochesAnomalos, etapasCriticas, bunchingAlertas, totalDetecciones, conclusion };
}

// ── Bloque 3: Comparativa vs rival ──────────────────────────────────────────

async function calcBloque3(agencyId: string): Promise<Bloque3Result> {
  const [eventosPropio, pares] = await Promise.all([
    fetchVehicleEvents(agencyId, 2000),
    fetchCorredoresContraRivales(agencyId),
  ]);

  if (pares.length === 0 || eventosPropio.length < 20) {
    return { sinDatos: true, comparativas: [], lineasSuperior: 0, lineasInferior: 0, conclusion: 'Sin datos de comparativa con rivales.' };
  }

  const agenciasRivales = [...new Set(pares.map(p => p.agencyRival))];
  const eventosRivalesArrays = await Promise.all(agenciasRivales.map(ag => fetchVehicleEvents(ag, 1000)));
  const eventosRivalesPorAgency: Record<string, typeof eventosPropio> = {};
  agenciasRivales.forEach((ag, i) => { eventosRivalesPorAgency[ag] = eventosRivalesArrays[i]; });

  const comparativas: LineaComparativa[] = [];
  const vistas = new Set<string>();

  for (const par of pares) {
    const key = `${par.lineaPropia}__${par.sentidoPropio}__${par.agencyRival}`;
    if (vistas.has(key)) continue;
    vistas.add(key);

    const evPropio = eventosPropio.filter(e => String(e.linea) === par.lineaPropia && e.sentido === par.sentidoPropio);
    const evRival = (eventosRivalesPorAgency[par.agencyRival] ?? []).filter(e => String(e.linea) === par.lineaRival);

    if (evPropio.length < 10 && evRival.length < 10) continue;

    comparativas.push({
      lineaPropia: par.lineaPropia,
      sentido: par.sentidoPropio,
      lineaRival: par.lineaRival,
      empresaRival: par.empresaRival,
      otpPropio: otpDesde(evPropio),
      otpRival: otpDesde(evRival),
      diferencia: (otpDesde(evPropio) !== null && otpDesde(evRival) !== null)
        ? (otpDesde(evPropio)! - otpDesde(evRival)!)
        : null,
      velPropia: velPromedio(evPropio),
      velRival: velPromedio(evRival),
    });
  }

  comparativas.sort((a, b) => (a.diferencia ?? 0) - (b.diferencia ?? 0));

  const lineasSuperior = comparativas.filter(c => (c.diferencia ?? 0) > 3).length;
  const lineasInferior = comparativas.filter(c => (c.diferencia ?? 0) < -3).length;
  const empresa = EMPRESA_NOMBRES[agencyId] ?? agencyId;

  let conclusion = comparativas.length === 0
    ? `Sin datos suficientes para comparativa.`
    : `${empresa} supera al rival en ${lineasSuperior} línea${lineasSuperior !== 1 ? 's' : ''} y va por debajo en ${lineasInferior}.`;

  if (comparativas.length > 0 && comparativas[0].diferencia !== null && comparativas[0].diferencia < -10) {
    const peor = comparativas[0];
    conclusion += ` Peor brecha: L${peor.lineaPropia} ${peor.sentido} (${peor.diferencia} pts vs ${peor.empresaRival} L${peor.lineaRival}).`;
  }

  return { sinDatos: false, comparativas: comparativas.slice(0, 12), lineasSuperior, lineasInferior, conclusion };
}

// ── Bloque 4: Recomendaciones accionables ────────────────────────────────────

function calcBloque4(b1: Bloque1Result, b2: Bloque2Result, b3: Bloque3Result): Bloque4Result {
  const recomendaciones: Recomendacion[] = [];

  // Desde Bloque 1
  b1.enRiesgo.slice(0, 3).forEach(c => {
    recomendaciones.push({
      prioridad: 'alta',
      titulo: `Reforzar L${c.lineaPropia} ${c.sentidoPropio} en tramo con ${c.empresaRival}`,
      razon: `Perdiste ${Math.abs(c.delta ?? 0)} pts de share frente a ${c.empresaRival} L${c.lineaRival} en 3 días (${c.sharedKm} km compartidos).`,
      impactoEstimado: c.pasajerosEstimados ? `~${c.pasajerosEstimados} pasajeros/día recuperables` : 'Reducir pérdida de mercado',
      plazo: 'Próxima vigencia STM',
    });
  });

  // Desde Bloque 2 — OTP crítico
  b2.otpCritico.slice(0, 2).forEach(l => {
    recomendaciones.push({
      prioridad: 'alta',
      titulo: `Revisar operación L${l.linea} ${l.sentido} (OTP ${l.otpPromedio}%)`,
      razon: `OTP sostenidamente bajo (${l.otpPromedio}%) sobre ${l.totalPasadas} pasadas. Posible mal calibrado de boletín.`,
      impactoEstimado: `Subir OTP línea hacia 75%+ (umbral STM)`,
      plazo: 'Inmediato — solicitar ajuste a RRHH/operación',
    });
  });

  // Desde Bloque 2 — Coches anómalos
  b2.cochesAnomalos.slice(0, 2).forEach(c => {
    recomendaciones.push({
      prioridad: 'media',
      titulo: `Derivar coche ${c.idBus} (L${c.linea}) a revisión`,
      razon: `OTP del coche: ${c.otpCoche}% vs ${c.otpLinea}% promedio de la línea (${c.diferencia} pts, ${c.muestras} pasadas).`,
      impactoEstimado: `Subir OTP L${c.linea} ~${Math.min(3, Math.abs(Math.round(c.diferencia / 4)))} pts si es problema de conductor`,
      plazo: 'Esta semana',
    });
  });

  // Desde Bloque 3 — Líneas con OTP muy inferior al rival
  b3.comparativas
    .filter(c => (c.diferencia ?? 0) < -10)
    .slice(0, 2)
    .forEach(c => {
      recomendaciones.push({
        prioridad: 'alta',
        titulo: `Cerrar brecha OTP L${c.lineaPropia} vs ${c.empresaRival} L${c.lineaRival}`,
        razon: `OTP propio ${c.otpPropio ?? '—'}% vs rival ${c.otpRival ?? '—'}% (${c.diferencia} pts). Pasajeros migran al rival.`,
        impactoEstimado: 'Recuperar pasajeros en corredor compartido',
        plazo: 'Próximo mes',
      });
    });

  // Ordenar por prioridad
  const orden: Record<string, number> = { alta: 0, media: 1, baja: 2 };
  recomendaciones.sort((a, b) => orden[a.prioridad] - orden[b.prioridad]);

  const altas = recomendaciones.filter(r => r.prioridad === 'alta').length;
  const medias = recomendaciones.filter(r => r.prioridad === 'media').length;

  const conclusion = recomendaciones.length === 0
    ? 'Sin recomendaciones urgentes. El sistema opera dentro de parámetros normales.'
    : `${altas} acción${altas !== 1 ? 'es' : ''} de alta prioridad, ${medias} de media. `
      + (altas > 0 ? `Ejecutar las de alta impacto esta semana.` : '');

  return { recomendaciones: recomendaciones.slice(0, 8), conclusion };
}

// ── Entry point público ──────────────────────────────────────────────────────

export async function fetchDiagnostico(agencyId: string): Promise<DiagnosticoCompleto> {
  const [b1, b2, b3] = await Promise.all([
    calcBloque1(agencyId),
    calcBloque2(agencyId),
    calcBloque3(agencyId),
  ]);
  const b4 = calcBloque4(b1, b2, b3);

  return {
    agencyId,
    empresaNombre: EMPRESA_NOMBRES[agencyId] ?? agencyId,
    generadoEn: new Date(),
    bloque1: b1,
    bloque2: b2,
    bloque3: b3,
    bloque4: b4,
  };
}
