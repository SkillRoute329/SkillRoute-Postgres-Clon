-- FASE 5.17 (2026-05-16): conteo vehicular IMM en avenidas principales.
--
-- Fuente: catalogodatos.gub.uy "conteo-vehicular-en-las-principales-
-- avenidas-de-montevideo". CSV mensual (~360 MB, muestras cada 5 min por
-- carril/detector, geolocalizado). Se AGREGA a granularidad horaria por
-- detector+carril para mantener la tabla chica y rápida — suficiente para
-- la narrativa de auditoría: "el bus llegó tarde por tráfico real en la
-- avenida X a esa hora, no por mala operación".

CREATE TABLE IF NOT EXISTS conteo_vehicular (
  id            BIGSERIAL PRIMARY KEY,
  cod_detector  INTEGER NOT NULL,
  id_carril     SMALLINT,
  fecha         DATE NOT NULL,
  hora          SMALLINT NOT NULL,            -- 0-23 (agregado horario)
  dsc_avenida   VARCHAR(120),
  dsc_int_anterior  VARCHAR(120),
  dsc_int_siguiente VARCHAR(120),
  latitud       DOUBLE PRECISION,
  longitud      DOUBLE PRECISION,
  volumen_hora_prom NUMERIC(8,1),             -- promedio de volumen_hora
  volumen_hora_max  INTEGER,
  muestras      INTEGER,                      -- nº de lecturas 5-min agregadas
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conteo_det_ts
  ON conteo_vehicular (cod_detector, fecha, hora);
CREATE INDEX IF NOT EXISTS idx_conteo_avenida
  ON conteo_vehicular (dsc_avenida, fecha, hora);

CREATE TABLE IF NOT EXISTS conteo_vehicular_ingestados (
  archivo     VARCHAR(80) PRIMARY KEY,
  mes         DATE NOT NULL,
  filas       BIGINT,
  bytes_zip   BIGINT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
