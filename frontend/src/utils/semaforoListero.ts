/**
 * Lógica pura del semáforo del Dashboard Listero (Vínculo Coche-Servicio-Chofer).
 * Verde / Naranja / Rojo / Amarillo según estado del servicio.
 */

export type SemaforoStatus = 'verde' | 'naranja' | 'rojo' | 'amarillo';
export type ServicioEstadoStatus = 'activo' | 'pendiente' | 'incidencia' | 'pendiente_de_coche';

/**
 * @param toleranciaMinutos Opcional. Si se pasa, atraso <= tolerancia se considera puntual (no amarillo).
 */
export function computeSemaforo(
  hasCoche: boolean,
  hasChofer: boolean,
  status: ServicioEstadoStatus | undefined,
  atrasoMinutos: number,
  toleranciaMinutos?: number,
): SemaforoStatus {
  const effectiveAtraso =
    toleranciaMinutos != null && atrasoMinutos <= toleranciaMinutos ? 0 : atrasoMinutos;
  if (effectiveAtraso > 0) return 'amarillo';
  if (status === 'incidencia' || status === 'pendiente_de_coche') return 'rojo';
  if (!hasCoche && !hasChofer) return 'rojo';
  if ((hasCoche && !hasChofer) || (!hasCoche && hasChofer)) return 'naranja';
  return 'verde';
}
