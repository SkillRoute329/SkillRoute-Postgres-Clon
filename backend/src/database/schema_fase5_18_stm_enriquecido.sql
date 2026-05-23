-- FASE 5.18 (2026-05-16): aprovechamiento COMPLETO del documento mensual STM.
--
-- El ingest previo descartaba cantidad_pasajeros (demanda real), sevar_codigo
-- (variante/recorrido) e id_viaje (cadena de transbordos = matriz OD real).
-- Estas tablas las recuperan SIN nueva fuente, solo aprovechando lo que ya
-- bajamos. Agregadas (no fila-a-fila) para mantener tamaño manejable.

-- 1. Demanda enriquecida por línea/variante/parada/hora con PASAJEROS reales.
CREATE TABLE IF NOT EXISTS stm_demanda_mensual (
  id            BIGSERIAL PRIMARY KEY,
  mes           DATE NOT NULL,
  cod_empresa   SMALLINT NOT NULL,
  dsc_linea     VARCHAR(20) NOT NULL,
  sevar_codigo  VARCHAR(20),            -- variante/recorrido (antes ignorado)
  codigo_parada VARCHAR(20),
  hora          SMALLINT NOT NULL,
  dow           SMALLINT NOT NULL,
  grupo_usuario VARCHAR(60),
  tramo_ordinal SMALLINT,
  con_tarjeta   BOOLEAN,
  validaciones  INTEGER NOT NULL DEFAULT 0,  -- COUNT(*) (compat)
  pasajeros     BIGINT  NOT NULL DEFAULT 0,  -- SUM(cantidad_pasajeros) REAL
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sdm_mes_op   ON stm_demanda_mensual (mes, cod_empresa);
CREATE INDEX IF NOT EXISTS idx_sdm_linea    ON stm_demanda_mensual (dsc_linea, mes);
CREATE INDEX IF NOT EXISTS idx_sdm_variante ON stm_demanda_mensual (sevar_codigo, mes);

-- 2. Matriz OD / transbordos: cadena de líneas dentro de un mismo id_viaje
--    (un pasajero validó línea A en el tramo N y línea B en el tramo N+1).
--    Es la primera matriz Origen-Destino REAL derivada del propio STM.
CREATE TABLE IF NOT EXISTS stm_transbordos_mensual (
  id              BIGSERIAL PRIMARY KEY,
  mes             DATE NOT NULL,
  cod_empresa_o   SMALLINT,
  linea_origen    VARCHAR(20) NOT NULL,
  cod_empresa_d   SMALLINT,
  linea_destino   VARCHAR(20) NOT NULL,
  hora            SMALLINT,
  transbordos     BIGINT NOT NULL DEFAULT 0,   -- nº de viajes con ese encadenamiento
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stb_mes      ON stm_transbordos_mensual (mes);
CREATE INDEX IF NOT EXISTS idx_stb_origen   ON stm_transbordos_mensual (linea_origen, mes);
CREATE INDEX IF NOT EXISTS idx_stb_destino  ON stm_transbordos_mensual (linea_destino, mes);

-- 3. Tracking idempotente de la ingesta enriquecida.
CREATE TABLE IF NOT EXISTS stm_enriquecido_ingestados (
  archivo     VARCHAR(80) PRIMARY KEY,
  mes         DATE NOT NULL,
  filas_demanda     BIGINT,
  filas_transbordos BIGINT,
  pasajeros_total   BIGINT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
