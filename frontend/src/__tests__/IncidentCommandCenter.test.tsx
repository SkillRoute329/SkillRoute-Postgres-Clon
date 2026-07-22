import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import IncidentCommandCenter from '../pages/traffic/IncidentCommandCenter';
import { useIncidencias } from '../hooks/useIncidencias';

// Mock del custom hook (TDD / BDD - Ingeniero QA)
vi.mock('../hooks/useIncidencias', () => ({
  useIncidencias: vi.fn(),
}));

describe('IncidentCommandCenter', () => {
  const mockCreateIncidencia = vi.fn();
  const mockUpdateIncidencia = vi.fn();
  const mockAnularIncidencia = vi.fn();
  const mockResolverIncidencia = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useIncidencias as any).mockReturnValue({
      incidencias: [
        {
          id: 'test-inc-1',
          type: 'MECANICA',
          status: 'ABIERTO',
          priority: 'ALTA',
          description: 'Falla de motor',
          source: 'DESPACHO',
        },
        {
          id: 'test-inc-2',
          type: 'ACCIDENTE',
          status: 'CERRADO',
          priority: 'MEDIA',
          description: 'Choque leve',
          source: 'DRIVER_APP',
        },
      ],
      loading: false,
      createIncidencia: mockCreateIncidencia,
      updateIncidencia: mockUpdateIncidencia,
      anularIncidencia: mockAnularIncidencia,
      resolverIncidencia: mockResolverIncidencia,
    });
  });

  it('renderiza correctamente el Centro de Mando', () => {
    render(<IncidentCommandCenter />);
    expect(screen.getByText('Centro de Mando — Incidencias')).toBeInTheDocument();
  });

  it('renderiza los KPIs correctamente basándose en los datos simulados', () => {
    render(<IncidentCommandCenter />);
    
    // Total abiertas = 1
    const abiertasKPI = screen.getByText('Abiertas');
    expect(abiertasKPI.previousSibling).toHaveTextContent('1');
    
    // Total cerradas = 1
    const cerradasKPI = screen.getByText('Cerradas hoy');
    expect(cerradasKPI.previousSibling).toHaveTextContent('1');

    // Alta prioridad (activa) = 1
    const altaPriKPI = screen.getByText('Alta prioridad');
    expect(altaPriKPI.previousSibling).toHaveTextContent('1');
  });

  it('muestra las incidencias en la lista', () => {
    render(<IncidentCommandCenter />);
    
    // Cambiamos a filtro TODOS para poder ver la cerrada
    const btnTodos = screen.getAllByText('TODOS')[0];
    fireEvent.click(btnTodos);

    expect(screen.getByText('Falla de motor')).toBeInTheDocument();
    expect(screen.getByText('Choque leve')).toBeInTheDocument();
  });

  it('abre el modal de creación al hacer clic en "Nueva Incidencia"', () => {
    render(<IncidentCommandCenter />);
    const btn = screen.getByText('Nueva Incidencia');
    fireEvent.click(btn);
    
    expect(screen.getByText('Crear Incidencia')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
    expect(screen.getByText('Guardar')).toBeInTheDocument();
  });

  it('filtra incidencias por estado ABIERTO', () => {
    render(<IncidentCommandCenter />);
    
    // Por defecto inicia en ABIERTO
    const btnAbierto = screen.getByText('ABIERTO');
    fireEvent.click(btnAbierto);

    expect(screen.getByText('Falla de motor')).toBeInTheDocument();
    // 'Choque leve' está cerrado, no debería aparecer en vista ABIERTO
    expect(screen.queryByText('Choque leve')).not.toBeInTheDocument();
  });
});
