-- FASE 5.18 (2026-05-16): velocidad vehicular IMM en avenidas principales.
-- Fuente: catalogodatos "velocidad-promedio-vehicular...". CSV mensual
-- (~360 MB, muestras c/5 min por carril/detector geolocalizado, mismo
-- esquema que conteo_vehicular). Agregado horario. Junto a conteo_vehicular
-- da el CONTEXTO DE TRÁFICO para predecir atrasos de buses por corredor.
CREATE TABLE IF NOT EXISTS velocidad_vehicular (
  id            BIGSERIAL PRIMARY KEY,
  cod_detector  INTEGER NOT NULL,
  id_carril     SMALLINT,
  fecha         DATE NOT NULL,
  hora          SMALLINT NOT NULL,         -- 0-23 (agregado)
  dsc_avenida   VARCHAR(120),
  dsc_int_anterior  VARCHAR(120),
  dsc_int_siguiente VARCHAR(120),
  latitud       DOUBLE PRECISION,
  longitud      DOUBLE PRECISION,
  velocidad_prom NUMERIC(6,1),             -- km/h promedio
  velocidad_min  NUMERIC(6,1),             -- km/h mínimo (peor congestión)
  muestras      INTEGER,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vel_det_ts  ON velocidad_vehicular (cod_detector, fecha, hora);
CREATE INDEX IF NOT EXISTS idx_vel_avenida ON velocidad_vehicular (dsc_avenida, fecha, hora);

CREATE TABLE IF NOT EXISTS velocidad_vehicular_ingestados (
  archivo     VARCHAR(80) PRIMARY KEY,
  mes         DATE NOT NULL,
  filas       BIGINT,
  bytes_zip   BIGINT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
