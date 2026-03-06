/**
 * Test: falta de personal (servicio 1148 sin chofer) → Dashboard Listero en ROJO.
 */
import { describe, it, expect } from 'vitest';
import { computeSemaforo } from './semaforoListero';

describe('Semáforo Listero – falta de personal', () => {
  it('estado no verde cuando falta el chofer (servicio 1148 sin chofer) – requiere Asignar Suplente', () => {
    const semaforo = computeSemaforo(true, false, 'activo', 0);
    expect(['naranja', 'rojo']).toContain(semaforo);
  });

  it('NARANJA cuando solo falta chofer (coche asignado)', () => {
    expect(computeSemaforo(true, false, 'activo', 0)).toBe('naranja');
  });

  it('NARANJA cuando solo falta coche (chofer asignado)', () => {
    expect(computeSemaforo(false, true, 'activo', 0)).toBe('naranja');
  });

  it('ROJO cuando faltan coche y chofer', () => {
    expect(computeSemaforo(false, false, 'activo', 0)).toBe('rojo');
  });

  it('ROJO cuando status es incidencia o pendiente_de_coche', () => {
    expect(computeSemaforo(true, true, 'incidencia', 0)).toBe('rojo');
    expect(computeSemaforo(true, true, 'pendiente_de_coche', 0)).toBe('rojo');
  });

  it('AMARILLO cuando hay atraso en punto de control', () => {
    expect(computeSemaforo(true, true, 'activo', 15)).toBe('amarillo');
  });

  it('VERDE cuando coche y chofer asignados, sin incidencia ni atraso', () => {
    expect(computeSemaforo(true, true, 'activo', 0)).toBe('verde');
  });

  it('VERDE cuando atraso <= tolerancia (Parámetros del Sistema)', () => {
    expect(computeSemaforo(true, true, 'activo', 5, 10)).toBe('verde');
    expect(computeSemaforo(true, true, 'activo', 10, 10)).toBe('verde');
  });

  it('AMARILLO cuando atraso > tolerancia', () => {
    expect(computeSemaforo(true, true, 'activo', 15, 10)).toBe('amarillo');
  });
});
