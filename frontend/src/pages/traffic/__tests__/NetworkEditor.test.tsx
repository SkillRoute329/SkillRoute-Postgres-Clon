import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import CompetitiveAnalysis from '../NetworkEditor';
import { useAuth } from '../../../context/AuthContext';
import * as navigationDataService from '../../../features/navigation/services/navigationDataService';

// Mock dependencias
vi.mock('../../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../features/navigation/services/navigationDataService', () => ({

  getNavigationLineas: vi.fn(),
  getNavigationLineaData: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
  }
}));

// Leaflet y sus componentes fallarán en Node env sin mock
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div />,
  Polyline: () => <div />,
  CircleMarker: () => <div />,
  Popup: () => <div />,
  useMap: () => ({ fitBounds: vi.fn() }),
}));

describe('NetworkEditor Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders and filters correctly for UCOT user (Multi-tenant check)', async () => {
    // Simulamos que el usuario logueado es de UCOT y rol operativo
    (useAuth as any).mockReturnValue({
      user: { role: 'OPERATOR', empresa: 'UCOT' }
    });

    const mockLines = [
      { id: '1', codigo: '17', nombre: '17 · Casabó', sentido: 'Ida', empresa: 'UCOT' },
      { id: '2', codigo: '125', nombre: '125 · Ciudadela', sentido: 'Ida', empresa: 'CUTCSA' },
    ];

    // Mock API call to return line catalogs
    (navigationDataService.getNavigationLineas as any).mockImplementation(async (agencyId: number) => {
      if (agencyId === 70) return [mockLines[0]]; // UCOT
      if (agencyId === 50) return [mockLines[1]]; // CUTCSA
      return [];
    });

    render(<CompetitiveAnalysis />);

    // Verificamos el título para confirmar coherencia visual
    expect(screen.getByText('Inteligencia Competitiva')).toBeInTheDocument();

    // Verificamos que la carga termine y muestre la opción en el dropdown
    await waitFor(() => {
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      // Solo debería mostrar la línea 17 (UCOT), NO la 125 (CUTCSA)
      expect(screen.getByText(/Línea 17/i)).toBeInTheDocument();
      expect(screen.queryByText(/Línea 125/i)).not.toBeInTheDocument();
    });
  });

  it('renders all lines for ADMIN user', async () => {
    // Simulamos un ADMIN que debe ver todo
    (useAuth as any).mockReturnValue({
      user: { role: 'ADMIN' }
    });

    const mockLines = [
      { id: '1', codigo: '17', nombre: '17 · Casabó', sentido: 'Ida', empresa: 'UCOT' },
      { id: '2', codigo: '125', nombre: '125 · Ciudadela', sentido: 'Ida', empresa: 'CUTCSA' },
    ];

    (navigationDataService.getNavigationLineas as any).mockImplementation(async (agencyId: number) => {
      if (agencyId === 70) return [mockLines[0]]; // UCOT
      if (agencyId === 50) return [mockLines[1]]; // CUTCSA
      return [];
    });

    render(<CompetitiveAnalysis />);

    await waitFor(() => {
      // Debería ver AMBAS líneas en el listado
      expect(screen.getByText(/Línea 17/i)).toBeInTheDocument();
      expect(screen.getByText(/Línea 125/i)).toBeInTheDocument();
    });
  });
});
