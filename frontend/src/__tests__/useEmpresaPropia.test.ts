/**
 * Tests para useEmpresaPropia — hook global de selector de operador.
 * Cubre: persistencia localStorage, default UCOT, switching entre operadores,
 * sincronización vía storage event y custom event entre tabs/instancias.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useEmpresaPropia,
  EMPRESAS_OPCIONES,
} from '../hooks/useEmpresaPropia';

const STORAGE_KEY = 'skillroute.empresaPropia';

describe('useEmpresaPropia', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('default es UCOT (70) cuando no hay nada en localStorage', () => {
    const { result } = renderHook(() => useEmpresaPropia());
    expect(result.current.empresaPropia).toBe(70);
    expect(result.current.empresaCfg.label).toBe('UCOT');
  });

  it('lee el valor persistido de localStorage', () => {
    localStorage.setItem(STORAGE_KEY, '50');
    const { result } = renderHook(() => useEmpresaPropia());
    expect(result.current.empresaPropia).toBe(50);
    expect(result.current.empresaCfg.label).toBe('CUTCSA');
  });

  it('setEmpresaPropia actualiza state y localStorage', () => {
    const { result } = renderHook(() => useEmpresaPropia());
    act(() => result.current.setEmpresaPropia(20));
    expect(result.current.empresaPropia).toBe(20);
    expect(result.current.empresaCfg.label).toBe('COME');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('20');
  });

  it('rechaza códigos no válidos (mantiene el actual)', () => {
    const { result } = renderHook(() => useEmpresaPropia());
    act(() => result.current.setEmpresaPropia(999));
    expect(result.current.empresaPropia).toBe(70); // default sigue
  });

  it('todos los operadores tienen label, agencyId y color', () => {
    expect(EMPRESAS_OPCIONES).toHaveLength(4);
    for (const op of EMPRESAS_OPCIONES) {
      expect(op.codigo).toBeTypeOf('number');
      expect(op.label).toBeTruthy();
      expect(op.agencyId).toBe(String(op.codigo));
      expect(op.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('agencyId es string para queries Firestore', () => {
    const { result } = renderHook(() => useEmpresaPropia());
    act(() => result.current.setEmpresaPropia(50));
    expect(result.current.empresaCfg.agencyId).toBe('50');
    expect(typeof result.current.empresaCfg.agencyId).toBe('string');
  });

  it('reacciona a storage event de otra tab', () => {
    const { result } = renderHook(() => useEmpresaPropia());
    expect(result.current.empresaPropia).toBe(70);

    // Simular cambio en otra pestaña
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: '10',
        }),
      );
    });
    expect(result.current.empresaPropia).toBe(10);
    expect(result.current.empresaCfg.label).toBe('COETC');
  });

  it('reacciona a custom event skillroute:empresaPropia-change', () => {
    const { result: hookA } = renderHook(() => useEmpresaPropia());
    const { result: hookB } = renderHook(() => useEmpresaPropia());

    // Hook A cambia → Hook B debe reaccionar
    act(() => hookA.current.setEmpresaPropia(50));
    expect(hookA.current.empresaPropia).toBe(50);
    expect(hookB.current.empresaPropia).toBe(50);
  });

  it('múltiples cambios consecutivos persisten el último', () => {
    const { result } = renderHook(() => useEmpresaPropia());
    act(() => {
      result.current.setEmpresaPropia(50);
      result.current.setEmpresaPropia(20);
      result.current.setEmpresaPropia(10);
    });
    expect(result.current.empresaPropia).toBe(10);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('10');
  });

  it('storage event con valor inválido es ignorado', () => {
    const { result } = renderHook(() => useEmpresaPropia());
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: '999',
        }),
      ),
    );
    expect(result.current.empresaPropia).toBe(70);
  });
});
