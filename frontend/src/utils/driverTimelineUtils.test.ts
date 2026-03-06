/**
 * Test UI/UX Vista Chofer: DriverTimeline calcula correctamente el desvío de tiempo
 * (atraso/adelanto) comparando hora del sistema vs puntos de control.
 */
import { describe, it, expect } from 'vitest';
import { computeTimelineState, parseHoraTimeline } from './driverTimelineUtils';

const puntosControl = [
  { nombre: 'Melilla', hora: '14:00' },
  { nombre: 'Paso de la Arena', hora: '15:00' },
  { nombre: 'Terminal', hora: '16:00' },
];

describe('DriverTimeline – desvío de tiempo', () => {
  it('calcula atraso cuando la hora del sistema supera la del punto de control', () => {
    const state = computeTimelineState(puntosControl, '15:10', undefined);
    expect(state.indiceActual).toBe(1);
    expect(state.minutosAtraso).toBe(10);
    expect(state.proximo?.nombre).toBe('Terminal');
    expect(state.proximo?.hora).toBe('16:00');
  });

  it('usa atrasoMinutos cuando se pasa explícitamente (inspección)', () => {
    const state = computeTimelineState(puntosControl, '15:00', 15);
    expect(state.minutosAtraso).toBe(15);
  });

  it('no muestra atraso cuando aún no ha pasado ningún punto de control', () => {
    const state = computeTimelineState(puntosControl, '13:00', undefined);
    expect(state.indiceActual).toBe(-1);
    expect(state.minutosAtraso).toBe(0);
    expect(state.proximo?.nombre).toBe('Melilla');
    expect(state.proximo?.hora).toBe('14:00');
  });

  it('parseHoraTimeline convierte HH:mm a minutos', () => {
    expect(parseHoraTimeline('15:10')).toBe(15 * 60 + 10);
    expect(parseHoraTimeline('08:00')).toBe(8 * 60);
  });
});
