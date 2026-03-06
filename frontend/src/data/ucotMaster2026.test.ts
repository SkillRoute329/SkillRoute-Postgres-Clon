/**
 * Test de integridad de datos: mapeo maestro UCOT 2026.
 * Valida que todos los servicios del JSON se carguen y relación Coche-Servicio sea exacta sin duplicados.
 */
import { describe, it, expect } from 'vitest';
import {
  getMaster2026,
  getMapeoOperativo,
  getMapeoOperativoByCoche,
  getCochesByCategoria,
  getCategoriaByCocheId,
  getCategoriaReemplazoParaAveria,
} from './ucotMaster2026';

describe('Integridad de datos – JSON Maestro ucot_master_2026', () => {
  const master = getMaster2026();

  it('carga correctamente el maestro con metadatos', () => {
    expect(master.metadatos.empresa).toBe('UCOT');
    expect(master.metadatos.temporada).toBe('VERANO 2026');
    expect(master.metadatos.flota).toBe(137);
    expect(master.metadatos.servicios).toBe(163);
  });

  it('todos los servicios del mapeo se cargan correctamente en AssignmentService (mapeo_operativo)', () => {
    const servicios = Object.keys(master.mapeo_operativo);
    expect(servicios.length).toBeGreaterThanOrEqual(1);
    for (const servicioId of servicios) {
      const entry = getMapeoOperativo(servicioId);
      expect(entry).not.toBeNull();
      expect(entry?.coche).toBeDefined();
      expect(entry?.linea).toBeDefined();
    }
  });

  it('relación Coche-Servicio es exacta (ej: Coche 64 -> Servicio 1006)', () => {
    expect(getMapeoOperativo('1006')?.coche).toBe('64');
    expect(getMapeoOperativo('1006')?.linea).toBe('300b');
    expect(getMapeoOperativo('1129')?.coche).toBe('115');
    expect(getMapeoOperativo('1129')?.linea).toBe('329h');
    expect(getMapeoOperativo('1148')?.coche).toBe('140');
    expect(getMapeoOperativo('1029')?.coche).toBe('104');
    expect(getMapeoOperativo('1044')?.coche).toBe('163');
  });

  it('no hay duplicados de servicioId en mapeo_operativo', () => {
    const ids = Object.keys(master.mapeo_operativo);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it('getMapeoOperativoByCoche devuelve un único servicio por coche en mapeo', () => {
    const by64 = getMapeoOperativoByCoche('64');
    expect(by64.length).toBe(1);
    expect(by64[0].servicioId).toBe('1006');
    expect(by64[0].entry.coche).toBe('64');
    const by115 = getMapeoOperativoByCoche('115');
    expect(by115.length).toBe(1);
    expect(by115[0].servicioId).toBe('1129');
  });

  it('categorías tienen coches y LINEA_FIJA incluye 163', () => {
    const lineaFija = getCochesByCategoria('LINEA_FIJA');
    expect(lineaFija).toContain('64');
    expect(lineaFija).toContain('115');
    expect(lineaFija).toContain('163');
    expect(getCategoriaByCocheId('64')).toBe('LINEA_FIJA');
    expect(getCategoriaReemplazoParaAveria('104')).toBe('LINEA_FIJA');
  });
});
