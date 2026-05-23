/**
 * comandoService — cliente de /api/comando (FASE 5.18).
 * Inteligencia prescriptiva (recomendaciones) y predictiva (proyección).
 */
import axios from 'axios';
import { authHeader } from '../utils/tokenStore';

const BASE = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001') + '/api/comando';

export interface Recomendacion {
  ambito: 'OPERADOR' | 'GLOBAL';
  tipo: string;
  prioridad: number;
  operador: string | null;
  linea: string | null;
  titulo: string;
  evidencia: Record<string, unknown>;
  accion: string;
}
export interface RecomendacionesResultado {
  ok: boolean;
  fecha: string;
  resumen: { total: number; criticas: number; porOperador: number; globales: number };
  recomendaciones: Recomendacion[];
}

export interface FilaProyeccion {
  operador: string;
  linea: string;
  hora: number;
  demandaEsperada: number;
  promedioHistorico: number;
  tendenciaPctMes: number;
  señal: 'CRECIENTE_ALTA' | 'CRECIENTE' | 'ESTABLE' | 'DECRECIENTE';
  accionAnticipada: string | null;
}
export interface ProyeccionResultado {
  ok: boolean;
  fechaObjetivo: string;
  tipoDia: string;
  baseHistorica: { meses: number; desde: string | null; hasta: string | null };
  resumen: { lineasProyectadas: number; alertasAnticipadas: number };
  proyeccion: FilaProyeccion[];
}

export interface CompetidorDiag {
  linea: string;
  operador: string;
  empresa: string;
  kmCompartidos: number;
  pctSolape: number;
  primeraSalidaRival: string | null;
  frecuenciaRivalMin: number | null;
}
export interface LineaDiagnostico {
  linea: string;
  nombre: string;
  destino: string;
  primeraSalida: string | null;
  ultimaSalida: string | null;
  frecuenciaProgMin: number | null;
  validaciones: {
    mesActual: string | null;
    totalActual: number;
    mesPrevio: string | null;
    totalPrevio: number;
    variacionAbs: number;
    variacionPct: number | null;
    tendencia: 'SUBE' | 'BAJA' | 'ESTABLE' | 'NO_CONCLUYENTE';
    promDiaHabilActual: number | null;
    promDiaHabilComparado: number | null;
    baseComparacion: 'INTERANUAL' | 'NINGUNA';
    horaPico: number | null;
    validacionesHoraPico: number;
  };
  metodologia: string;
  serviciosUcot: Array<{ servicio: string; origen: string | null; horaSalida: string | null }>;
  competidores: CompetidorDiag[];
  diagnostico: string;
  accionSugerida: string;
  fundamento: string;
  fuentes: string[];
  auditoria: { estado: 'AUDITADO_OK' | 'DISCREPANCIA'; checks: AuditCheck[] };
}
export interface AuditCheck {
  campo: string;
  fuente: string;
  metodoRecomputo: string;
  valorInforme: number | string;
  valorRecomputado: number | string;
  ok: boolean;
}
export interface AuditoriaGlobal {
  certificado: string;
  metodoVerificacion: string;
  totalChecks: number;
  ok: number;
  discrepancias: number;
  lineasConDiscrepancia: string[];
  selloVerificacion: string;
  verificadoEn: string;
}
export interface DiagnosticoLineasResultado {
  ok: boolean;
  operador: string;
  empresa: string;
  generadoEn: string;
  mesAnalizado: string | null;
  mesComparado: string | null;
  totalLineas: number;
  lineas: LineaDiagnostico[];
  nota: string;
  auditoria: AuditoriaGlobal;
}
export async function getDiagnosticoLineas(op = '70'): Promise<DiagnosticoLineasResultado> {
  const headers = await authHeader();
  const { data } = await axios.get<DiagnosticoLineasResultado>(`${BASE}/diagnostico-linea`, {
    params: { op },
    headers,
    timeout: 60000,
  });
  return data;
}

export async function getRecomendaciones(fecha: string): Promise<RecomendacionesResultado> {
  const headers = await authHeader();
  const { data } = await axios.get<RecomendacionesResultado>(`${BASE}/recomendaciones`, {
    params: { fecha },
    headers,
    timeout: 40000,
  });
  return data;
}

export async function getProyeccion(fecha: string): Promise<ProyeccionResultado> {
  const headers = await authHeader();
  const { data } = await axios.get<ProyeccionResultado>(`${BASE}/proyeccion`, {
    params: { fecha },
    headers,
    timeout: 40000,
  });
  return data;
}

export interface SimFila {
  hora: number;
  paxDia: number;
  vehHoraBase: number;
  headwayBaseMin: number;
  factorOcupBase: number;
  esperaBaseMin: number;
  paxNoAtendBase: number;
  vehHoraEsc: number;
  headwayEscMin: number;
  factorOcupEsc: number;
  esperaEscMin: number;
  paxNoAtendEsc: number;
}
export interface SimulacionResultado {
  ok: boolean;
  linea: string;
  operador: string | null;
  tipoDia: string;
  mesDemanda: string | null;
  capacidadBusSupuesto: number;
  supuestos: string[];
  filas: SimFila[];
  resumen: {
    paxNoAtendidoBaseDia: number;
    paxNoAtendidoEscDia: number;
    deltaPaxAtendidos: number;
    factorOcupMedioBase: number;
    factorOcupMedioEsc: number;
    esperaMediaBaseMin: number;
    esperaMediaEscMin: number;
    vehiculosDiaBase: number;
    vehiculosDiaEsc: number;
  };
  efectoRed: {
    mes: string | null;
    transfTotalMes: number;
    alimentanEstaLinea: Array<{ linea: string; transbordos: number }>;
    estaLineaAlimenta: Array<{ linea: string; transbordos: number }>;
    nota: string;
  };
  veredicto: string;
}
export async function getSimulacion(params: {
  linea: string;
  op?: string;
  tipo_dia?: string;
  deltaVehiculosPct?: number;
  headwayObjetivoMin?: number;
  capacidadBus?: number;
}): Promise<SimulacionResultado> {
  const headers = await authHeader();
  const { data } = await axios.get<SimulacionResultado>(`${BASE}/simulador`, {
    params,
    headers,
    timeout: 40000,
  });
  return data;
}
