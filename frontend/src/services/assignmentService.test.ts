/**
 * Test de contingencia operativa: avería en cascada (sugerirReemplazoAveria por categoría),
 * reportarAveria marca PENDIENTE_DE_COCHE y sugiere reemplazo por categoría.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sugerirReemplazoAveria, reportarAveria } from './assignmentService';
import type { Vehicle } from './firestore/types';

const mockSetState = vi.fn();
const mockGetByDate = vi.fn();

vi.mock('./firestore/servicioEstado', () => ({
  ServicioEstadoService: {
    getByDate: (...args: unknown[]) => mockGetByDate(...args),
    setState: (...args: unknown[]) => mockSetState(...args),
  },
}));
vi.mock('./firestore/programacionDiaria', () => ({ ProgramacionDiariaService: {} }));
vi.mock('./firestore/activeAssignments', () => ({ ActiveAssignmentsService: {} }));

const mkVehicle = (id: string, internalNumber: string): Vehicle =>
  ({ id, internalNumber }) as Vehicle;

describe('Contingencia – sugerirReemplazoAveria por categoría', () => {
  const allVehicles: Vehicle[] = [
    mkVehicle('v64', '64'),
    mkVehicle('v115', '115'),
    mkVehicle('v140', '140'),
    mkVehicle('v104', '104'),
    mkVehicle('v163', '163'),
    mkVehicle('v123', '123'),
    mkVehicle('v262', '262'),
  ];

  it('sugiere solo coches de la misma categoría (LINEA_FIJA) para coche 64', () => {
    const assigned = new Set<string>(['64']);
    const { categoria, coches } = sugerirReemplazoAveria('64', allVehicles, assigned);
    expect(categoria).toBe('LINEA_FIJA');
    const nums = coches.map((v) => String(v.internalNumber ?? v.id));
    expect(nums).toContain('115');
    expect(nums).toContain('140');
    expect(nums).toContain('104');
    expect(nums).toContain('163');
    expect(nums).not.toContain('64');
    expect(nums).not.toContain('123');
    expect(nums).not.toContain('262');
  });

  it('para 5 coches distintos sugiere reemplazo por categoría correcta', () => {
    const cochesAveriados = ['64', '115', '104', '123', '262'];
    const assigned = new Set<string>(cochesAveriados);
    for (const cocheId of cochesAveriados) {
      const { categoria, coches } = sugerirReemplazoAveria(cocheId, allVehicles, assigned);
      expect(categoria).toBeDefined();
      coches.forEach((v) => {
        const id = String(v.internalNumber ?? v.id);
        expect(assigned.has(id)).toBe(false);
      });
    }
  });

  it('no sugiere coches ya asignados', () => {
    const assigned = new Set<string>(['64', '115', '140']);
    const { coches } = sugerirReemplazoAveria('104', allVehicles, assigned);
    const nums = coches.map((v) => String(v.internalNumber ?? v.id));
    expect(nums).not.toContain('64');
    expect(nums).not.toContain('115');
    expect(nums).not.toContain('140');
    expect(nums).toContain('163');
  });
});

describe('Contingencia – reportarAveria marca PENDIENTE_DE_COCHE y sugiere por categoría', () => {
  beforeEach(() => {
    mockSetState.mockResolvedValue(undefined);
    mockGetByDate.mockResolvedValue([
      { servicioId: '1129', cocheActual: '115', choferActual: 'ch1' },
    ]);
  });

  it('reportarAveria para coche 115 marca servicio como pendiente y sugiere reemplazo LINEA_FIJA', async () => {
    const vehicles: Vehicle[] = [
      mkVehicle('v64', '64'),
      mkVehicle('v115', '115'),
      mkVehicle('v140', '140'),
    ];
    const assigned = new Set<string>(['115']);
    const result = await reportarAveria('115', '2026-03-02', vehicles, assigned);
    expect(result.serviciosMarcadosPendiente).toContain('1129');
    expect(result.categoriaReemplazo).toBe('LINEA_FIJA');
    expect(result.cochesSugeridos.length).toBeGreaterThan(0);
    expect(mockSetState).toHaveBeenCalledWith(
      '1129',
      '2026-03-02',
      expect.objectContaining({
        status: 'pendiente_de_coche',
        cocheActual: null,
      }),
    );
  });
});
