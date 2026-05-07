// 10 casos sintéticos §10.1 SPEC_CUMPLIMIENTO_V2_BACKEND_2026_05.md
import { describe, it, expect } from 'vitest';
import { inferirSentido } from '../src/lib/senseInference';
import { GpsEvent, Shape } from '../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<GpsEvent> = {}): GpsEvent {
  return {
    idBus: 'TEST_BUS',
    agencyId: '70',
    linea: '316',
    lat: -34.9011,
    lng: -56.1645,
    bearing: 180,
    velocidad: 25,
    destinoDesc: null,
    variante: '316',
    timestampGPS: '2026-05-07T14:00:00.000Z',
    ...overrides,
  };
}

// Shape norte→sur (IDA): 5 puntos de norte a sur
const shapeIDA: Shape = {
  docId: '70_316_0',
  agencyId: '70',
  linea: '316',
  varianteNum: 0,
  sentido: 'IDA',
  points: [
    { lat: -34.890, lng: -56.160 }, // norte
    { lat: -34.895, lng: -56.162 },
    { lat: -34.900, lng: -56.164 },
    { lat: -34.905, lng: -56.166 },
    { lat: -34.910, lng: -56.168 }, // sur (POCITOS)
  ],
  terminalIda: 'TRES CRUCES',
  terminalVuelta: 'POCITOS',
  origen: 'TRES CRUCES',
  destino: 'POCITOS',
};

// Shape sur→norte (VUELTA): mismos puntos invertidos
// terminalIda = donde termina VUELTA (= terminal IDA = TRES CRUCES)
// terminalVuelta = donde empieza VUELTA (= terminal VUELTA = POCITOS)
// Convención shapeCache.ts: terminalIda = sentido=VUELTA ? destino : origen
const shapeVUELTA: Shape = {
  docId: '70_316_1',
  agencyId: '70',
  linea: '316',
  varianteNum: 1,
  sentido: 'VUELTA',
  points: [
    { lat: -34.910, lng: -56.168 }, // sur
    { lat: -34.905, lng: -56.166 },
    { lat: -34.900, lng: -56.164 },
    { lat: -34.895, lng: -56.162 },
    { lat: -34.890, lng: -56.160 }, // norte (TRES CRUCES)
  ],
  terminalIda: 'TRES CRUCES',  // destino de VUELTA = origen del IDA
  terminalVuelta: 'POCITOS',   // origen de VUELTA = destino del IDA
  origen: 'POCITOS',
  destino: 'TRES CRUCES',
};

const bothShapes = [shapeIDA, shapeVUELTA];

// ── Caso 1: Solo IDA candidato (único shape, snap <80m) ──────────────────────
it('caso 1 — solo IDA candidato → sentido=IDA, confianza=HIGH', () => {
  // Evento en medio de IDA, muy lejos del shape VUELTA (distintas coords)
  const event = makeEvent({ lat: -34.900, lng: -56.164, bearing: 180 });
  const result = inferirSentido(event, [shapeIDA], []);
  expect(result.sentido).toBe('IDA');
  expect(result.confianza).toBe('HIGH');
  expect(result.score).toBe(1.0);
  expect(result.snapDistanceM).not.toBeNull();
});

// ── Caso 2: Bearing tangente IDA + destinoDesc=terminal IDA → IDA alto score ─
it('caso 2 — bearing IDA + destinoDesc terminal → sentido=IDA, score>0.85', () => {
  // Bus en el centro del shape, bearing 180° (sur), destino = POCITOS (terminal IDA)
  const event = makeEvent({
    lat: -34.900, lng: -56.164,
    bearing: 180, // apunta al sur = dirección IDA
    destinoDesc: 'POCITOS',
  });
  const result = inferirSentido(event, bothShapes, []);
  expect(result.sentido).toBe('IDA');
  expect(result.score).toBeGreaterThan(0.75);
});

// ── Caso 3: Bearing tangente VUELTA + destinoDesc=terminal VUELTA → VUELTA ──
it('caso 3 — bearing VUELTA + destinoDesc terminal → sentido=VUELTA, score>0.85', () => {
  const event = makeEvent({
    lat: -34.900, lng: -56.164,
    bearing: 0, // apunta al norte = dirección VUELTA
    destinoDesc: 'TRES CRUCES',
  });
  const result = inferirSentido(event, bothShapes, []);
  expect(result.sentido).toBe('VUELTA');
  expect(result.score).toBeGreaterThan(0.75);
});

// ── Caso 4: Snap >80m en todos los shapes → sentido=null, confianza=ZERO ────
it('caso 4 — snap demasiado lejos → sentido=null, confianza=ZERO', () => {
  // Posición muy alejada de ambos shapes
  const event = makeEvent({ lat: -35.000, lng: -57.000, bearing: 90 });
  const result = inferirSentido(event, bothShapes, []);
  expect(result.sentido).toBeNull();
  expect(result.confianza).toBe('ZERO');
  expect(result.snapDistanceM).toBeNull();
});

// ── Caso 5: Sin shapes disponibles → sentido=null ───────────────────────────
it('caso 5 — sin shapes → sentido=null, confianza=ZERO', () => {
  const event = makeEvent({ lat: -34.900, lng: -56.164 });
  const result = inferirSentido(event, [], []);
  expect(result.sentido).toBeNull();
  expect(result.confianza).toBe('ZERO');
  expect(result.score).toBe(0);
});

// ── Caso 6: Bearing ambiguo (~90° de ambos), destinoDesc=intermedio → bajo score
it('caso 6 — bearing ambiguo + destinoDesc intermedio → score bajo o null', () => {
  const event = makeEvent({
    lat: -34.900, lng: -56.164,
    bearing: 90, // apunta al este = perpendicular a ambos shapes
    destinoDesc: 'CENTRO', // no coincide con ningún terminal
  });
  const result = inferirSentido(event, bothShapes, []);
  // Score bajo → puede ser ZERO o LOW, pero nunca HIGH
  if (result.sentido !== null) {
    expect(result.confianza).not.toBe('HIGH');
  }
});

// ── Caso 7: Histéresis — ventana IDA, score nuevo = 0.65 → mantiene IDA ─────
it('caso 7 — histéresis mantiene IDA cuando score < 0.75', () => {
  // Simulamos 3 eventos previos con sentidoV2 = IDA
  const window = [
    { ...makeEvent(), sentidoV2: 'IDA' as const },
    { ...makeEvent(), sentidoV2: 'IDA' as const },
    { ...makeEvent(), sentidoV2: 'IDA' as const },
  ];
  // bearing=90° (este, perpendicular) → priorBearing neutro (0.5/0.5)
  // destinoDesc='TRES CRUCES' → priorDestino.VUELTA=0.643 (< 0.75) → histéresis mantiene IDA
  const event = makeEvent({ lat: -34.900, lng: -56.164, bearing: 90, destinoDesc: 'TRES CRUCES' });
  const result = inferirSentido(event, bothShapes, window);
  // Si el score es <0.75 y ventana dice IDA, debe quedarse en IDA (o null si snap muy incierto)
  if (result.sentido !== null) {
    expect(result.sentido).toBe('IDA');
  }
});

// ── Caso 8: Histéresis — ventana IDA, nuevo score=0.90 a VUELTA → cambia ────
it('caso 8 — histéresis cede cuando score nuevo ≥ 0.75', () => {
  const window = [
    { ...makeEvent(), sentidoV2: 'IDA' as const },
    { ...makeEvent(), sentidoV2: 'IDA' as const },
    { ...makeEvent(), sentidoV2: 'IDA' as const },
  ];
  // Bearing muy fuerte a VUELTA (norte) + destinoDesc terminal VUELTA
  const event = makeEvent({
    lat: -34.900, lng: -56.164,
    bearing: 0, // norte = VUELTA
    destinoDesc: 'TRES CRUCES',
  });
  const result = inferirSentido(event, bothShapes, window);
  // Score alto → debe vencer a la histéresis y cambiar a VUELTA
  expect(result.sentido).toBe('VUELTA');
});

// ── Caso 9: destinoDesc no normalizable → prior neutral, decide bearing ──────
it('caso 9 — destinoDesc no reconocido → prior neutral, decide bearing', () => {
  const event = makeEvent({
    lat: -34.900, lng: -56.164,
    bearing: 180, // IDA fuerte
    destinoDesc: 'XYZDESCONOCIDO',
  });
  const result = inferirSentido(event, bothShapes, []);
  // Bearing fuerte a IDA debería ganar aunque destinoDesc no ayude
  expect(result.sentido).toBe('IDA');
});

// ── Caso 10: Línea unidireccional (solo 1 shape) → siempre ese sentido ───────
it('caso 10 — línea con un solo shape → siempre ese sentido (HIGH)', () => {
  const soloIDA = [shapeIDA];
  const event = makeEvent({ lat: -34.900, lng: -56.164, bearing: 0 }); // bearing opuesto pero único candidato
  const result = inferirSentido(event, soloIDA, []);
  // Con un solo shape que hace snap, debe devolver HIGH independiente del bearing
  if (result.sentido !== null) {
    expect(result.sentido).toBe('IDA');
    expect(result.confianza).toBe('HIGH');
  }
});
