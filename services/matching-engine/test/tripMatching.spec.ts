// Tests básicos de tripMatching — mocked Firestore
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de firestore antes de importar el módulo
vi.mock('../src/lib/firestore', () => ({
  db: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
      }),
    }),
  },
  admin: {},
}));

import { matchPasadaToTrip } from '../src/lib/tripMatching';
import { GpsEvent } from '../src/types';

function makeEvent(overrides: Partial<GpsEvent> = {}): GpsEvent {
  return {
    idBus: 'BUS_1',
    agencyId: '70',
    linea: '316',
    lat: -34.9011,
    lng: -56.1645,
    bearing: 180,
    velocidad: 25,
    destinoDesc: 'POCITOS',
    variante: '316',
    timestampGPS: '2026-05-07T14:00:00.000Z',
    ...overrides,
  };
}

it('retorna null cuando no hay timetable en Firestore', async () => {
  const result = await matchPasadaToTrip([makeEvent()], '70', '316', 'IDA', 'TRES CRUCES');
  expect(result).toBeNull();
});

it('retorna null para array de eventos vacío', async () => {
  const result = await matchPasadaToTrip([], '70', '316', 'IDA', null);
  expect(result).toBeNull();
});

it('usa agencyId y linea correctamente en la consulta Firestore', async () => {
  const { db } = await import('../src/lib/firestore');
  const mockGet = vi.fn().mockResolvedValue({ exists: false, data: () => undefined });
  const mockDoc = vi.fn().mockReturnValue({ get: mockGet });
  const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });
  (db as any).collection = mockCollection;

  await matchPasadaToTrip([makeEvent()], '50', '141', 'VUELTA', null);

  expect(mockCollection).toHaveBeenCalledWith('gtfs_timetable');
  // Doc ID: {agencyId}_{linea}_{directionId}_{serviceType}
  expect(mockDoc).toHaveBeenCalledWith(expect.stringContaining('50_141_1'));
});
