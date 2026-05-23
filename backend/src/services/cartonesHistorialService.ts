/**
 * cartonesHistorialService — snapshot append-only del historial coche→servicio.
 *
 * FASE 5.17 (2026-05-16): cartones_completados sólo guarda last-seen (UPSERT).
 * Para analizar distribución/rotación ("qué servicios suele hacer el coche y
 * cómo le va") se necesita historial. Esto copia el estado del día a
 * cartones_historial (1 fila por coche×servicio×día). Idempotente
 * (ON CONFLICT DO NOTHING) — se puede correr varias veces por día.
 */
import sqlDb from '../config/database';
import logger from '../config/logger';

export async function snapshotHistorial(agencyId = '70'): Promise<number> {
  // tipo_dia según día de la semana en Montevideo (0=dom festivo, 6=sáb).
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' });
  const dow = new Date(`${hoy}T12:00:00-03:00`).getDay();
  const tipoDia = dow === 0 ? 'festivo' : dow === 6 ? 'sabado' : 'habil';

  const r = await sqlDb.raw(
    `INSERT INTO cartones_historial
       (fecha, agency_id, vehiculo_id, service_number, service_manana, line, tipo_dia)
     SELECT ?::date, agency_id, vehiculo_id,
            CASE WHEN service_number ~ '^[0-9]+$' THEN service_number END,
            NULLIF(data_jsonb->>'servicioManana','') ,
            CASE WHEN line = chr(63) THEN NULL ELSE line END,
            ?
       FROM cartones_completados
      WHERE agency_id = ?
        AND vehiculo_id IS NOT NULL
        AND updated_at::date = ?::date
     ON CONFLICT (fecha, agency_id, vehiculo_id, service_number) DO NOTHING`,
    [hoy, tipoDia, agencyId, hoy],
  );
  const n = (r as { rowCount?: number }).rowCount ?? 0;
  logger.info(`[cartonesHistorial] snapshot ${hoy} (${tipoDia}): +${n} filas`);
  return n;
}
