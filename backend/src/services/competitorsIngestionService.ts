/**
 * Competitors Ingestion Service
 * Toma snapshots GPS del endpoint público IMM/STM y materializa la colección
 * Firestore `competidores` con datos REALES de las empresas competidoras de UCOT.
 *
 * Estrategia:
 *   1. fetchBusesLive("-1") → todas las empresas operando ahora
 *   2. Agrupar por empresa (excluir UCOT, código 70)
 *   3. Para cada empresa: upsert documento con sus líneas observadas
 *   4. Cada línea es construida con la info disponible del snapshot:
 *      - numeroLinea, operador, sublineas (variantes IDA/VUELTA), destinos
 *      - recorrido = [] hasta tener scraper de horarios JSF
 *      - horarios = [] idem
 *      - frecuencia = estimación cruda (ver más abajo) o 0
 *      - activa = busesActivos > 0
 *
 * Nota: la frecuencia REAL viene del scraper JSF de stm/horarios. Esto es la
 * primera capa: identidad y estado operativo en vivo.
 */

import { db } from '../config/database';
import { logger } from '../config/logger';
import {
  fetchBusesLive,
  agruparPorEmpresa,
  EMPRESA_CODES,
  EmpresaLive,
} from './immRealtimeService';
import { Competidor, LineaCompetencia } from '../types/competition';

const COMPETIDORES_COLLECTION = 'competidores';
const SNAPSHOT_COLLECTION = 'stm_snapshots';

export interface IngestResult {
  timestampISO: string;
  totalBusesObservados: number;
  empresasProcesadas: Array<{
    codigo: number;
    nombre: string;
    buses: number;
    lineas: number;
    omitida: boolean;
  }>;
  competidoresUpsert: number;
  duracionMs: number;
}

/**
 * Construye un Competidor (formato Firestore) desde una EmpresaLive.
 */
function empresaLiveToCompetidor(emp: EmpresaLive, ahora: Date): Competidor {
  const lineas: LineaCompetencia[] = Array.from(emp.lineas.values()).map(
    (l) => {
      // Estimar destino principal (el más frecuente entre las posiciones)
      const sublineasArr = Array.from(l.sublineas);
      const destinosArr = Array.from(l.destinos);

      const linea: LineaCompetencia = {
        id: `${emp.codigo}-${l.numero}`,
        numeroLinea: parseInt(l.numero, 10) || 0,
        operador: emp.nombre,
        recorrido: [], // Pendiente: scraper JSF de stm/horarios
        horarios: [], // Pendiente
        frecuencia: 0, // Pendiente: derivar de horarios reales
        historico: [],
        activa: l.busesActivos > 0,
      };

      // Persistimos metadata extra del snapshot en campos no tipados
      // (Firestore acepta extras; el tipo TS solo es para el código que lo lee)
      (linea as any).numeroLineaTexto = l.numero;
      (linea as any).sublineas = sublineasArr;
      (linea as any).destinos = destinosArr;
      (linea as any).variantes = Array.from(l.variantes);
      (linea as any).tipoLineaDesc = l.tipoLineaDesc ?? null;
      (linea as any).busesActivosUltimoSnapshot = l.busesActivos;

      return linea;
    }
  );

  return {
    id: `emp-${emp.codigo}`,
    nombre: emp.nombre,
    color: undefined,
    lineas,
    ultimaActualizacion: ahora,
    createdAt: ahora,
  };
}

/**
 * Ejecuta una ingesta completa: pulls live data, agrupa, upsert en Firestore.
 * Crea también un documento de auditoría en `stm_snapshots`.
 */
export async function ingestCompetitorsFromSTM(): Promise<IngestResult> {
  const started = Date.now();
  const ahora = new Date();
  const collection = await fetchBusesLive(EMPRESA_CODES.TODAS);
  const totalBusesObservados = collection.features?.length ?? 0;

  const grouped = agruparPorEmpresa(collection);

  const procesadas: IngestResult['empresasProcesadas'] = [];
  let competidoresUpsert = 0;

  // Batch para escrituras eficientes
  const batch = db.batch();

  for (const [codigo, emp] of grouped.entries()) {
    const omitida = String(codigo) === EMPRESA_CODES.UCOT; // No es competidor
    procesadas.push({
      codigo,
      nombre: emp.nombre,
      buses: emp.totalBuses,
      lineas: emp.lineas.size,
      omitida,
    });
    if (omitida) continue;

    const competidor = empresaLiveToCompetidor(emp, ahora);
    const ref = db.collection(COMPETIDORES_COLLECTION).doc(competidor.id);

    // Preservamos createdAt si ya existe — solo actualizamos
    const existing = await ref.get();
    const dataToWrite: any = {
      ...competidor,
      ultimaActualizacion: ahora,
    };
    if (existing.exists) {
      const existingData = existing.data();
      if (existingData?.createdAt) {
        dataToWrite.createdAt = existingData.createdAt;
      }
    }

    batch.set(ref, dataToWrite, { merge: true });
    competidoresUpsert += 1;
  }

  // Snapshot de auditoría
  const snapshotRef = db.collection(SNAPSHOT_COLLECTION).doc();
  batch.set(snapshotRef, {
    timestamp: ahora,
    totalBuses: totalBusesObservados,
    porEmpresa: procesadas,
    fuente: 'POST /buses/rest/stm-online',
  });

  await batch.commit();

  const duracionMs = Date.now() - started;
  const result: IngestResult = {
    timestampISO: ahora.toISOString(),
    totalBusesObservados,
    empresasProcesadas: procesadas,
    competidoresUpsert,
    duracionMs,
  };

  logger.info(
    `[competitorsIngestion] OK ${totalBusesObservados} buses, ${competidoresUpsert} competidores upsert en ${duracionMs}ms`
  );

  return result;
}

export default { ingestCompetitorsFromSTM };
