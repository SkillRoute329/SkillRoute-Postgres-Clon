-- FASE 5.17 (2026-05-16): horarios teóricos STM por punto de control.
--
-- Fuente: datos-abiertos.montevideo.gub.uy/HORARIOS_OMNIBUS datos.zip
-- (dataset catalogodatos "horarios-de-omnibus-urbanos-por-puntos-de-control-stm").
-- ACTUALIZACIÓN DIARIA. Es el horario regulador oficial IMM por punto de
-- control, por tipo de día (Codigo_minuta: 1-2 hábil, 3-4 sábado, 5-6
-- domingo/festivo) — cubre el DOMINGO/FESTIVO que el GTFS y el cartón no
-- resolvían, y sirve de validación cruzada independiente del GTFS (no
-- requiere OAuth).

CREATE TABLE IF NOT EXISTS stm_horarios_control (
  id              BIGSERIAL PRIMARY KEY,
  cod_linea       VARCHAR(20)  NOT NULL,
  linea           VARCHAR(40),
  cod_sublinea    VARCHAR(20),
  sublinea        VARCHAR(160),
  variante        VARCHAR(20),
  -- 1-2 hábil, 3-4 sábado, 5-6 domingo/festivo.
  codigo_minuta   SMALLINT,
  tipo_dia        VARCHAR(10),          -- derivado: habil|sabado|festivo
  nro_frecuencia  INTEGER,
  codigo_punto    VARCHAR(20)  NOT NULL,
  hora            TIME         NOT NULL,
  fecha_desde     DATE,
  ingested_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sthc_linea_min
  ON stm_horarios_control (cod_linea, codigo_minuta);
CREATE INDEX IF NOT EXISTS idx_sthc_punto
  ON stm_horarios_control (codigo_punto);
CREATE INDEX IF NOT EXISTS idx_sthc_tipodia
  ON stm_horarios_control (tipo_dia, cod_linea);

-- Idempotencia: 1 fila por snapshot diario (la fuente se reemplaza entera).
CREATE TABLE IF NOT EXISTS stm_horarios_control_ingestados (
  snapshot_fecha  DATE PRIMARY KEY,     -- fecha del archivo (mtime del CSV)
  filas           BIGINT,
  bytes_zip       BIGINT,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
