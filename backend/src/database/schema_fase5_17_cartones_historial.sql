-- FASE 5.17 (2026-05-16): historial append-only coche→servicio.
--
-- cartones_completados hace UPSERT (1 fila por coche×servicio, sólo
-- last-seen) → no permite contar "cuántas veces / con qué frecuencia el
-- coche hizo cada servicio". Esta tabla acumula un snapshot DIARIO
-- (append, 1 fila por coche×servicio×día) para análisis de distribución
-- y rotación: qué servicios suele realizar cada coche y cómo le va.

CREATE TABLE IF NOT EXISTS cartones_historial (
  id            BIGSERIAL PRIMARY KEY,
  fecha         DATE NOT NULL,
  agency_id     VARCHAR(10) NOT NULL,
  vehiculo_id   VARCHAR(20) NOT NULL,
  service_number VARCHAR(20),
  service_manana VARCHAR(20),
  line          VARCHAR(20),
  tipo_dia      VARCHAR(10),          -- habil|sabado|festivo
  capturado_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fecha, agency_id, vehiculo_id, service_number)
);

CREATE INDEX IF NOT EXISTS idx_chist_coche
  ON cartones_historial (agency_id, vehiculo_id, fecha);
CREATE INDEX IF NOT EXISTS idx_chist_servicio
  ON cartones_historial (agency_id, service_number, fecha);
