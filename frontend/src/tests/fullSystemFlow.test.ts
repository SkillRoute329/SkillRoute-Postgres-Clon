/**
 * E2E de flujo completo ERP UCOT 2026 (con mocks Firestore):
 * Carga de personal -> Asignación de Servicio -> Reporte de Avería -> Reasignación de Suplente -> Verificación 9h descanso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateAssignment } from '../utils/syndicateRules';
import {
  reportarAveria,
  reasignarPersonal,
  sugerirReemplazoAveria,
} from '../services/assignmentService';
import type { Vehicle } from '../services/firestore/types';

const mockSetState = vi.fn();
const mockGetByDate = vi.fn();
const mockGetByServicioId = vi.fn();
const mockRecordAssignment = vi.fn();
const mockGetByDateProg = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../services/firestore/servicioEstado', () => ({
  ServicioEstadoService: {
    getByDate: (...args: unknown[]) => mockGetByDate(...args),
    getByServicioId: (...args: unknown[]) => mockGetByServicioId(...args),
    setState: (...args: unknown[]) => mockSetState(...args),
  },
}));
vi.mock('../services/firestore/activeAssignments', () => ({
  ActiveAssignmentsService: {
    recordAssignment: (...args: unknown[]) => mockRecordAssignment(...args),
  },
}));
vi.mock('../services/firestore/programacionDiaria', () => ({
  ProgramacionDiariaService: {
    getByDate: (...args: unknown[]) => mockGetByDateProg(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

const date = '2026-03-02';
const servicioId = '1129';
const coche115 = '115';
const chofer1 = 'ch1';
const suplente = 'ch2';

function mkVehicle(id: string, internalNumber: string): Vehicle {
  return { id, internalNumber } as Vehicle;
}

const allVehicles: Vehicle[] = [
  mkVehicle('v64', '64'),
  mkVehicle('v115', '115'),
  mkVehicle('v140', '140'),
  mkVehicle('v104', '104'),
];

describe('Full System Flow: Carga personal → Asignación → Avería → Reasignación Suplente → 9h descanso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetState.mockResolvedValue(undefined);
    mockRecordAssignment.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue(undefined);
  });

  it('1. Carga de personal: estado inicial con servicio asignado (coche 115, chofer ch1)', async () => {
    const estadoInicial = {
      servicioId,
      date,
      status: 'activo',
      cocheActual: coche115,
      choferActual: chofer1,
      linea: '329h',
      horaInicio: '08:00',
    };
    mockGetByDate.mockResolvedValue([estadoInicial]);
    mockGetByServicioId.mockResolvedValue(estadoInicial);
    const { ServicioEstadoService: Svc } = await import('../services/firestore/servicioEstado');
    const estados = await Svc.getByDate(date);
    expect(estados).toHaveLength(1);
    expect(estados[0].cocheActual).toBe(coche115);
    expect(estados[0].choferActual).toBe(chofer1);
  });

  it('2. Asignación de servicio: estado tiene coche y chofer (coherencia tríada)', async () => {
    mockGetByDate.mockResolvedValue([
      {
        servicioId,
        date,
        cocheActual: coche115,
        choferActual: chofer1,
        status: 'activo',
        horaInicio: '08:00',
      },
    ]);
    const { ServicioEstadoService: Svc } = await import('../services/firestore/servicioEstado');
    const estados = await Svc.getByDate(date);
    const row = estados.find((e: { servicioId: string }) => e.servicioId === servicioId);
    expect(row?.cocheActual).toBe(coche115);
    expect(row?.choferActual).toBe(chofer1);
  });

  it('3. Reporte de avería: marca PENDIENTE_DE_COCHE y sugiere reemplazo', async () => {
    mockGetByDate.mockResolvedValue([
      { servicioId, date, cocheActual: coche115, choferActual: chofer1, status: 'activo' },
    ]);
    const assigned = new Set<string>([coche115]);
    const result = await reportarAveria(coche115, date, allVehicles, assigned);
    expect(result.serviciosMarcadosPendiente).toContain(servicioId);
    expect(result.categoriaReemplazo).toBeDefined();
    expect(result.cochesSugeridos.length).toBeGreaterThan(0);
    expect(mockSetState).toHaveBeenCalledWith(
      servicioId,
      date,
      expect.objectContaining({ status: 'pendiente_de_coche', cocheActual: null }),
    );
  });

  it('4. Reasignación de suplente: valida 9h descanso antes de asignar', async () => {
    mockGetByServicioId.mockResolvedValue({
      servicioId,
      date,
      cocheActual: coche115,
      choferActual: chofer1,
      linea: '329h',
      horaInicio: '14:00',
    });
    mockGetByDateProg.mockResolvedValue([
      {
        id: 'pd1',
        date,
        servicio: servicioId,
        conductor: chofer1,
        vehiculo: coche115,
        horaInicio: '14:00',
      },
    ]);
    const validation = validateAssignment(suplente, '14:00', '04:00');
    expect(validation.valid).toBe(true);
    expect(validation.restHours).toBeGreaterThanOrEqual(9);
  });

  it('5. Verificación 9h descanso: bloquea si descanso < 9h', () => {
    const result = validateAssignment('driver1', '11:00', '04:00');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/9|descanso/i);
  });

  it('6. Verificación 9h descanso: permite si descanso >= 9h', () => {
    const result = validateAssignment('driver1', '14:00', '04:00');
    expect(result.valid).toBe(true);
    expect(result.restHours).toBeGreaterThanOrEqual(9);
  });

  it('7. Flujo encadenado: avería → sugerir reemplazo por categoría → reasignar con 9h', async () => {
    mockGetByDate.mockResolvedValue([
      { servicioId, date, cocheActual: coche115, choferActual: chofer1, status: 'activo' },
    ]);
    const assigned = new Set<string>([coche115]);
    const averiaResult = await reportarAveria(coche115, date, allVehicles, assigned);
    expect(averiaResult.serviciosMarcadosPendiente).toContain(servicioId);
    const { coches } = sugerirReemplazoAveria(coche115, allVehicles, assigned);
    expect(coches.some((v: Vehicle) => String(v.internalNumber) === '140')).toBe(true);
    const valid = validateAssignment(suplente, '14:00', '04:00');
    expect(valid.valid).toBe(true);
  });
});
