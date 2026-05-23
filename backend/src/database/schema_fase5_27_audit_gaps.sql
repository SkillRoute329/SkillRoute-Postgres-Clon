-- FASE 5.27 (2026-05-19) — Cierre de gaps detectados en el mapa de auditoría
-- total. Crea las 5 tablas que el frontend referenciaba por su nombre legacy
-- Firestore pero que NO existían en Postgres. Tras esto:
--   - dbBridgeController whitelist deja de devolver 404 silencioso.
--   - Las pantallas que las consumen muestran "vacío" honesto en lugar de
--     "sin conexión" engañoso.
--   - Cada tabla soporta CRUD vía POST /api/db/<colección>, lo que permite
--     que su flujo (CreateShift, AlertasDocumentoConductor, RulesManager,
--     PenalizationsPage, StmScraperStatus) escriba dato real.
--
-- IMPORTANTE: no se siembra contenido demo. Las tablas nacen vacías y se
-- llenan desde la operación real. Conforme a la regla "feature da dato REAL
-- o no existe".

-- 1) shift_categories — usado por services/firestore/shifts.ts (CreateShift,
--    selector de categoría salarial al crear turno). Vacío → CreateShift no
--    puede crear turno hasta que ABL/Admin defina categorías.
CREATE TABLE IF NOT EXISTS shift_categories (
  id           VARCHAR(128) PRIMARY KEY,
  nombre       VARCHAR(255) NOT NULL,
  precio       NUMERIC(10,2),
  descripcion  TEXT,
  agency_id    VARCHAR(50) REFERENCES empresas(agency_id),
  data_jsonb   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shift_cat_agency ON shift_categories(agency_id);

-- 2) fichas_medicas — usado por AlertasDocumentoConductor (vencimiento de
--    documentos médicos de personal). Schema compatible con frontend que
--    espera `fecha_vencimiento` para alertar.
CREATE TABLE IF NOT EXISTS fichas_medicas (
  id                  VARCHAR(128) PRIMARY KEY,
  conductor_id        VARCHAR(128) REFERENCES users(id),
  agency_id           VARCHAR(50) REFERENCES empresas(agency_id),
  fecha_emision       DATE,
  fecha_vencimiento   DATE,
  estado              VARCHAR(50),
  data_jsonb          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fichas_conductor ON fichas_medicas(conductor_id);
CREATE INDEX IF NOT EXISTS idx_fichas_vencimiento ON fichas_medicas(fecha_vencimiento);

-- 3) penalty_rules — usado por PenalizationsPage y RulesManager (ABL).
--    Reglas de sanciones definibles por el área regulatoria.
CREATE TABLE IF NOT EXISTS penalty_rules (
  id           VARCHAR(128) PRIMARY KEY,
  nombre       VARCHAR(255) NOT NULL,
  codigo       VARCHAR(50),
  gravedad     VARCHAR(50),
  monto_base   NUMERIC(10,2),
  descripcion  TEXT,
  agency_id    VARCHAR(50) REFERENCES empresas(agency_id),
  activa       BOOLEAN NOT NULL DEFAULT TRUE,
  data_jsonb   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_penalty_rules_agency ON penalty_rules(agency_id);

-- 4) abl_red_numbers — usado por services/firestore/penalties.ts (números
--    rojos del área de Apoyo Bajo de Línea, conductores con sanciones
--    acumuladas).
CREATE TABLE IF NOT EXISTS abl_red_numbers (
  id                 VARCHAR(128) PRIMARY KEY,
  conductor_id       VARCHAR(128) REFERENCES users(id),
  agency_id          VARCHAR(50) REFERENCES empresas(agency_id),
  motivo             VARCHAR(255),
  fecha_apertura     DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_cierre       DATE,
  estado             VARCHAR(50) NOT NULL DEFAULT 'abierto',
  data_jsonb         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_abl_red_conductor ON abl_red_numbers(conductor_id);
CREATE INDEX IF NOT EXISTS idx_abl_red_estado ON abl_red_numbers(estado);

-- 5) scrapping_logs — usado por StmScraperStatus. Cada corrida de un scraper
--    deja un registro acá. Vacío → StmScraperStatus dice "Sin corridas aún"
--    en lugar de "DESCONECTADO".
CREATE TABLE IF NOT EXISTS scrapping_logs (
  id          VARCHAR(128) PRIMARY KEY,
  scraper     VARCHAR(100) NOT NULL,
  inicio      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin         TIMESTAMPTZ,
  estado      VARCHAR(50),
  registros   INTEGER,
  mensaje     TEXT,
  data_jsonb  JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_scrapping_inicio ON scrapping_logs(inicio DESC);
CREATE INDEX IF NOT EXISTS idx_scrapping_scraper ON scrapping_logs(scraper, inicio DESC);

-- Trigger genérico de updated_at (si no existe ya). Asumimos que la función
-- trigger_set_updated_at() ya está definida (la usan otras tablas como
-- maintenance). Si no, la creamos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_set_updated_at') THEN
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $f$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_shift_cat_updated ON shift_categories;
CREATE TRIGGER trg_shift_cat_updated BEFORE UPDATE ON shift_categories
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_fichas_medicas_updated ON fichas_medicas;
CREATE TRIGGER trg_fichas_medicas_updated BEFORE UPDATE ON fichas_medicas
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_penalty_rules_updated ON penalty_rules;
CREATE TRIGGER trg_penalty_rules_updated BEFORE UPDATE ON penalty_rules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_abl_red_updated ON abl_red_numbers;
CREATE TRIGGER trg_abl_red_updated BEFORE UPDATE ON abl_red_numbers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
