-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA FASE 2.7 EXTENDED — Tablas para colecciones secundarias del original
-- ═══════════════════════════════════════════════════════════════════════════
-- Fecha: 2026-05-10
-- Aplicar con:
--   psql -U postgres -d skillroute_master -f schema_fase2_extended.sql
--
-- Cubre las colecciones del ORIGINAL CLOUD (ucot-gestor-cloud) que el
-- importador FASE 2.7 detectó como críticas pero que no estaban mapeadas
-- en schema_fase2.sql:
--
--   - alertas_regulacion   (frontend Dashboard CEO, Driver, Shadow)
--   - alertas_trafico      (DriverAlertOverlay, RoadAlerts)
--   - bus_delays           (otpService — cálculo OTP)
--   - bus_last_pos         (último GPS conocido por bus)
--   - boletines / bulletins (inspección y servicio)
--   - ai_orders            (sugerencias IA)
--   - auto_stats_diarios   (KPIs precalculados)
--
-- audit_log NO está acá: se mapea a la tabla `logs_auditoria` existente
-- en schema_inicial.sql (regla -1 NO REGRESIÓN: reusar lo que existe).
--
-- Todas las tablas usan data_jsonb para shape variable + columnas indexables
-- para queries rápidas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- 1. ALERTAS_REGULACION (corazón del flujo regulatorio IMM)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alertas_regulacion (
    id              VARCHAR(128) PRIMARY KEY,
    agency_id       VARCHAR(50),
    timestamp       TIMESTAMPTZ,
    tipo            VARCHAR(100),
    severidad       VARCHAR(50),
    coche_id        VARCHAR(50),
    linea_id        VARCHAR(50),
    conductor_id    VARCHAR(128),
    lat             DOUBLE PRECISION,
    lon             DOUBLE PRECISION,
    geom            GEOMETRY(Point, 4326),
    atendida        BOOLEAN DEFAULT FALSE,
    accion_tomada   TEXT,
    data_jsonb      JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ar_timestamp        ON alertas_regulacion(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ar_agency_timestamp ON alertas_regulacion(agency_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ar_coche            ON alertas_regulacion(coche_id);
CREATE INDEX IF NOT EXISTS idx_ar_linea            ON alertas_regulacion(linea_id);
CREATE INDEX IF NOT EXISTS idx_ar_atendida         ON alertas_regulacion(atendida);
CREATE INDEX IF NOT EXISTS idx_ar_geom             ON alertas_regulacion USING GIST(geom);

-- ───────────────────────────────────────────────────────────────────────
-- 2. ALERTAS_TRAFICO (desvíos, cortes de calle, eventos urbanos)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alertas_trafico (
    id              VARCHAR(128) PRIMARY KEY,
    agency_id       VARCHAR(50),
    tipo            VARCHAR(100),
    descripcion     TEXT,
    activa          BOOLEAN DEFAULT TRUE,
    lat             DOUBLE PRECISION,
    lon             DOUBLE PRECISION,
    geom            GEOMETRY(Point, 4326),
    radio_m         INT,
    creado_en       TIMESTAMPTZ,
    expira_en       TIMESTAMPTZ,
    data_jsonb      JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_at_activa     ON alertas_trafico(activa);
CREATE INDEX IF NOT EXISTS idx_at_creado     ON alertas_trafico(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_at_geom       ON alertas_trafico USING GIST(geom);

-- ───────────────────────────────────────────────────────────────────────
-- 3. BUS_DELAYS (cálculo OTP por bus/línea/fecha)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bus_delays (
    id                  VARCHAR(128) PRIMARY KEY,
    id_bus              VARCHAR(50),
    agency_id           VARCHAR(50),
    linea               VARCHAR(50),
    fecha               DATE,
    delay_min           DOUBLE PRECISION,
    estado_cumplimiento VARCHAR(50),
    calculado_en        TIMESTAMPTZ,
    data_jsonb          JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_bd_id_bus_fecha ON bus_delays(id_bus, fecha);
CREATE INDEX IF NOT EXISTS idx_bd_linea_fecha  ON bus_delays(linea, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_bd_agency_fecha ON bus_delays(agency_id, fecha DESC);

-- ───────────────────────────────────────────────────────────────────────
-- 4. BUS_LAST_POS (snapshot última posición de cada bus)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bus_last_pos (
    id_bus              VARCHAR(50) PRIMARY KEY,
    agency_id           VARCHAR(50),
    linea               VARCHAR(50),
    lat                 DOUBLE PRECISION,
    lon                 DOUBLE PRECISION,
    geom                GEOMETRY(Point, 4326),
    velocidad           DOUBLE PRECISION,
    estado_cumplimiento VARCHAR(50),
    timestamp_gps       TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    data_jsonb          JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_blp_agency ON bus_last_pos(agency_id);
CREATE INDEX IF NOT EXISTS idx_blp_linea  ON bus_last_pos(linea);
CREATE INDEX IF NOT EXISTS idx_blp_ts     ON bus_last_pos(timestamp_gps DESC);
CREATE INDEX IF NOT EXISTS idx_blp_geom   ON bus_last_pos USING GIST(geom);

-- ───────────────────────────────────────────────────────────────────────
-- 5. BOLETINES (boletines de inspección, servicio, comunicaciones)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boletines (
    id              VARCHAR(128) PRIMARY KEY,
    agency_id       VARCHAR(50),
    tipo            VARCHAR(100),       -- inspeccion | servicio | comunicacion | etc
    titulo          TEXT,
    contenido       TEXT,
    autor_id        VARCHAR(128),
    estado          VARCHAR(50),        -- borrador | publicado | archivado
    fecha           DATE,
    data_jsonb      JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bol_fecha    ON boletines(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_bol_estado   ON boletines(estado);
CREATE INDEX IF NOT EXISTS idx_bol_tipo     ON boletines(tipo);

-- bulletins (alias inglés de boletines): se importa a la misma tabla `boletines`
-- con un campo `data_jsonb.source = 'bulletins'` para trazabilidad.

-- ───────────────────────────────────────────────────────────────────────
-- 6. AI_ORDERS (sugerencias y órdenes generadas por IA al operador)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_orders (
    id              VARCHAR(128) PRIMARY KEY,
    agency_id       VARCHAR(50),
    tipo            VARCHAR(100),
    sugerencia      TEXT,
    contexto        JSONB DEFAULT '{}',
    estado          VARCHAR(50) DEFAULT 'pendiente',  -- pendiente | aprobada | rechazada | aplicada
    aprobada_por    VARCHAR(128),
    aprobada_en     TIMESTAMPTZ,
    data_jsonb      JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aio_estado     ON ai_orders(estado);
CREATE INDEX IF NOT EXISTS idx_aio_created    ON ai_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aio_tipo       ON ai_orders(tipo);

-- ───────────────────────────────────────────────────────────────────────
-- 7. AUTO_STATS_DIARIOS (KPIs precalculados por día)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_stats_diarios (
    id              VARCHAR(128) PRIMARY KEY,
    agency_id       VARCHAR(50),
    fecha           DATE,
    metric          VARCHAR(100),
    value           JSONB,
    data_jsonb      JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asd_fecha        ON auto_stats_diarios(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_asd_agency_fecha ON auto_stats_diarios(agency_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_asd_metric_fecha ON auto_stats_diarios(metric, fecha DESC);

-- ───────────────────────────────────────────────────────────────────────
-- 8. TRIGGERS de updated_at (DRY)
-- ───────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_boletines_updated     ON boletines;
CREATE TRIGGER trg_boletines_updated     BEFORE UPDATE ON boletines     FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_bus_last_pos_updated  ON bus_last_pos;
CREATE TRIGGER trg_bus_last_pos_updated  BEFORE UPDATE ON bus_last_pos  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN schema_fase2_extended.sql
-- ═══════════════════════════════════════════════════════════════════════════
