-- FASE 5.38 (2026-05-22) — Tabla `tarifario_stm` real.
-- El frontend `tarifarioService.ts` esperaba esta tabla pero estaba mapeada
-- a `parametros_operativos` que no tiene `precio/categoria`. Cambiamos por
-- una tabla real para soportar GET/PUT con el shape original del shim.

CREATE TABLE IF NOT EXISTS tarifario_stm (
  id          VARCHAR(128) PRIMARY KEY,
  nombre      VARCHAR(255) NOT NULL,
  precio      NUMERIC(10,2),
  categoria   VARCHAR(50),                -- URBANO / SUBURBANO / ZONAL / DIFERENCIAL
  agency_id   VARCHAR(50),
  vigencia_desde DATE,
  data_jsonb  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tarifario_categoria ON tarifario_stm(categoria);

DROP TRIGGER IF EXISTS trg_tarifario_updated ON tarifario_stm;
CREATE TRIGGER trg_tarifario_updated BEFORE UPDATE ON tarifario_stm
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
