/**
 * operadores.ts — única fuente de verdad de los 4 operadores STM.
 *
 * FASE 5.16 (2026-05-16): consolidación. El mapeo
 *   70=UCOT · 50=CUTCSA · 20=COME · 10=COETC
 * estaba duplicado inline en 30+ archivos con formatos inconsistentes
 * (`{id,nombre}`, `Record<'70','UCOT'>`, `{codigo,label,color}`,
 * `{agencyId,label,colorClass}`). Cada copia era una oportunidad de
 * mismatch (ya vimos el bug IMM↔UCOT por códigos desalineados).
 *
 * Este módulo expone TODOS los formatos que el frontend usa, derivados de
 * una sola tabla. Importar de acá; no volver a hardcodear el mapeo.
 */

export interface Operador {
  /** Código STM numérico. */
  codigo: number;
  /** Código como string (para queries / params de URL). */
  id: string;
  /** Nombre comercial. */
  nombre: string;
  /** Color hex (charts, leaflet, barras). */
  colorHex: string;
  /** Clase Tailwind de texto (badges, labels). */
  colorClass: string;
  /** Clase Tailwind de fondo translúcido. */
  bgClass: string;
}

/** Tabla canónica. Orden: UCOT primero (operador propio del clon). */
export const OPERADORES: ReadonlyArray<Operador> = [
  { codigo: 70, id: '70', nombre: 'UCOT',   colorHex: '#eab308', colorClass: 'text-yellow-400',  bgClass: 'bg-yellow-500/10' },
  { codigo: 50, id: '50', nombre: 'CUTCSA', colorHex: '#3b82f6', colorClass: 'text-blue-400',    bgClass: 'bg-blue-500/10' },
  { codigo: 20, id: '20', nombre: 'COME',   colorHex: '#22c55e', colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10' },
  { codigo: 10, id: '10', nombre: 'COETC',  colorHex: '#ef4444', colorClass: 'text-red-400',     bgClass: 'bg-red-500/10' },
];

/** Lookup nombre por código (acepta number o string). */
export const OPERADOR_NOMBRE: Record<string, string> = OPERADORES.reduce(
  (acc, o) => {
    acc[o.id] = o.nombre;
    acc[String(o.codigo)] = o.nombre;
    return acc;
  },
  {} as Record<string, string>,
);

/** Devuelve el nombre del operador o el código tal cual si no existe. */
export function nombreOperador(codigo: number | string | null | undefined): string {
  if (codigo == null) return '—';
  return OPERADOR_NOMBRE[String(codigo)] ?? String(codigo);
}

/** Operador completo por código (number o string). */
export function operadorPorCodigo(codigo: number | string): Operador | undefined {
  const s = String(codigo);
  return OPERADORES.find((o) => o.id === s);
}

/** Color hex por código (fallback gris slate). */
export function colorOperador(codigo: number | string): string {
  return operadorPorCodigo(codigo)?.colorHex ?? '#94a3b8';
}

/** Códigos válidos como number. */
export const CODIGOS_OPERADOR = OPERADORES.map((o) => o.codigo);

/** ¿Es un código de operador válido? */
export function esOperadorValido(codigo: number | string): boolean {
  return OPERADORES.some((o) => o.id === String(codigo));
}

/**
 * Alias de compatibilidad para los formatos legacy más usados, así la
 * migración de los 30 archivos es un simple cambio de import sin tocar
 * el resto del componente.
 */

/** `[{ id:'70', nombre:'UCOT' }, ...]` — usado por CumplimientoHub, AnalisisEtapas, DiagnosticoCumplimiento. */
export const OPERADORES_ID_NOMBRE = OPERADORES.map((o) => ({ id: o.id, nombre: o.nombre }));

/** `[{ codigo:70, label:'UCOT', agencyId:'70', color:'#eab308' }, ...]` — formato useEmpresaPropia. */
export const OPERADORES_EMPRESA_CONFIG = OPERADORES.map((o) => ({
  codigo: o.codigo,
  label: o.nombre,
  agencyId: o.id,
  color: o.colorHex,
}));
