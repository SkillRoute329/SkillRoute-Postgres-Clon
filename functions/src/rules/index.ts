/**
 * Registro de reglas por empresa
 * ================================
 * Para agregar una empresa nueva: importar sus reglas y agregarlas al mapa.
 * El motor busca por empresaId (string: '70', '50', '20', '10').
 */

import { ucotReglas } from './ucot';
import type { ReglasPorEmpresa } from '../consequenceEngine';

const REGISTRO: Record<string, ReglasPorEmpresa> = {
  '70': ucotReglas,
  // '50': cutcsaReglas,   // TODO: cuando se integre CUTCSA
  // '20': comeReglas,     // TODO: cuando se integre COME
  // '10': coetcReglas,    // TODO: cuando se integre COETC
};

export function obtenerReglasEmpresa(empresaId: string): ReglasPorEmpresa | null {
  return REGISTRO[empresaId] ?? null;
}

export function empresasConReglas(): string[] {
  return Object.keys(REGISTRO);
}
