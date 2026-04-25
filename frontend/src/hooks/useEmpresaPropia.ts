/**
 * useEmpresaPropia — Hook unificado para selector de operador propio
 * ====================================================================
 * Cualquier módulo cross-operador (Operaciones Diarias, CEO V7, ShadowRadar,
 * etc.) usa este hook para conocer y cambiar el operador "propio" sobre el
 * que el usuario está trabajando.
 *
 * Persiste en localStorage `skillroute.empresaPropia` para que la elección
 * sobreviva entre vistas y sesiones. Default: UCOT (70).
 *
 * Uso:
 *   const { empresaPropia, setEmpresaPropia, empresaCfg } = useEmpresaPropia();
 *   // empresaPropia: 70 | 50 | 20 | 10
 *   // empresaCfg: { codigo, label, agencyId, color }
 */
import { useState, useEffect, useCallback, useMemo } from 'react';

export interface EmpresaConfig {
  codigo: number;
  label: string;
  agencyId: string; // string version for queries (shapes_cross_operator etc)
  color: string;
}

export const EMPRESAS_OPCIONES: ReadonlyArray<EmpresaConfig> = [
  { codigo: 70, label: 'UCOT', agencyId: '70', color: '#eab308' },
  { codigo: 50, label: 'CUTCSA', agencyId: '50', color: '#3b82f6' },
  { codigo: 20, label: 'COME', agencyId: '20', color: '#22c55e' },
  { codigo: 10, label: 'COETC', agencyId: '10', color: '#ef4444' },
];

const STORAGE_KEY = 'skillroute.empresaPropia';
const DEFAULT_CODIGO = 70;

function readStorage(): number {
  if (typeof window === 'undefined') return DEFAULT_CODIGO;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CODIGO;
    const n = Number(raw);
    if (EMPRESAS_OPCIONES.some((e) => e.codigo === n)) return n;
    return DEFAULT_CODIGO;
  } catch {
    return DEFAULT_CODIGO;
  }
}

export function useEmpresaPropia() {
  const [empresaPropia, setEmpresaPropiaState] = useState<number>(readStorage);

  const setEmpresaPropia = useCallback((codigo: number) => {
    if (!EMPRESAS_OPCIONES.some((e) => e.codigo === codigo)) return;
    setEmpresaPropiaState(codigo);
    try {
      localStorage.setItem(STORAGE_KEY, String(codigo));
    } catch {
      /* localStorage puede fallar en modo incógnito */
    }
    // Notificar a otras pestañas/instancias del mismo origen
    try {
      window.dispatchEvent(
        new CustomEvent('skillroute:empresaPropia-change', { detail: codigo }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  // Sincronizar entre tabs/instancias (usuario cambia operador en otra pestaña)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const n = Number(e.newValue);
        if (EMPRESAS_OPCIONES.some((emp) => emp.codigo === n)) {
          setEmpresaPropiaState(n);
        }
      }
    };
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<number>;
      if (typeof ce.detail === 'number') {
        setEmpresaPropiaState(ce.detail);
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('skillroute:empresaPropia-change', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('skillroute:empresaPropia-change', onCustom as EventListener);
    };
  }, []);

  const empresaCfg = useMemo(
    () => EMPRESAS_OPCIONES.find((e) => e.codigo === empresaPropia) ?? EMPRESAS_OPCIONES[0]!,
    [empresaPropia],
  );

  return { empresaPropia, setEmpresaPropia, empresaCfg };
}
