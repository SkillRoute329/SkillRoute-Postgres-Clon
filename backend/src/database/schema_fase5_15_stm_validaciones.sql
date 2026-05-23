-- FASE 5.15 (2026-05-14): tabla agregada de validaciones STM oficiales IMM.
--
-- Fuente: catalogodatos.gub.uy / "Viajes realizados en los ómnibus del STM".
-- Granularidad: 1 fila = (mes, operador, linea, parada_origen, hora, dow,
--                          tipo_usuario_grupo, tramo_ordinal)
-- Tamaño esperado: <50 M filas para 6 meses (138 M validaciones agregadas).
-- Indexada para responder consultas del tipo:
--   "viajes UCOT línea 306 marzo 2026 por hora"
--   "demanda de la parada 4836 todos los operadores"
--   "transbordos por operador y mes"

CREATE TABLE IF NOT EXISTS stm_validaciones_mensual (
  id              BIGSERIAL PRIMARY KEY,
  -- Periodo: el primer día del mes (ej. 2026-03-01).
  mes             DATE NOT NULL,
  -- Operador: 10 COETC, 20 COME, 50 CUTCSA, 70 UCOT.
  cod_empresa     SMALLINT NOT NULL,
  -- Línea según el STM público (dsc_linea del CSV).
  dsc_linea       VARCHAR(20) NOT NULL,
  -- Parada de origen (codigo_parada_origen).
  codigo_parada   VARCHAR(20),
  -- Hora del día 0-23.
  hora            SMALLINT NOT NULL,
  -- Día de la semana 0=Dom..6=Sab.
  dow             SMALLINT NOT NULL,
  -- Grupo de usuario (USUARIO CORRIENTE, JUBILADO, ESTUDIANTE, etc).
  grupo_usuario   VARCHAR(40),
  -- Ordinal de tramo: 1=primer viaje, 2/3=transbordo.
  tramo_ordinal   SMALLINT,
  -- Pago con tarjeta (true/false).
  con_tarjeta     BOOLEAN,
  -- Métrica agregada.
  validaciones   INTEGER NOT NULL DEFAULT 0,
  -- Auditoría
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices clave para las consultas más frecuentes del dashboard.
CREATE INDEX IF NOT EXISTS idx_stm_val_mes_op
  ON stm_validaciones_mensual (mes, cod_empresa);

CREATE INDEX IF NOT EXISTS idx_stm_val_linea_mes
  ON stm_validaciones_mensual (cod_empresa, dsc_linea, mes);

CREATE INDEX IF NOT EXISTS idx_stm_val_parada
  ON stm_validaciones_mensual (codigo_parada, mes);

CREATE INDEX IF NOT EXISTS idx_stm_val_mes_hora
  ON stm_validaciones_mensual (mes, hora);

-- Tracking de qué archivos ya se ingestaron (idempotencia).
CREATE TABLE IF NOT EXISTS stm_validaciones_ingestados (
  archivo        VARCHAR(80) PRIMARY KEY,
  mes            DATE NOT NULL,
  filas_origen   BIGINT,
  filas_agregadas INTEGER,
  bytes_zip      BIGINT,
  duracion_ms    INTEGER,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
