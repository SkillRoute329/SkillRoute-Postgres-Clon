-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA FASE 2 — Migración de servicios operacionales Firestore → Postgres
-- ═══════════════════════════════════════════════════════════════════════════
-- Fecha: 2026-05-10
-- Aplicar con:
--   psql -U postgres -d skillroute_master -f schema_fase2.sql
--
-- Crea las tablas que reemplazan colecciones Firestore:
--   - cartones_completados  (cartonService)
--   - personal              (listeroService — conductores)
--   - turnos_dia            (listeroService)
--   - alertas_operativas    (cascadeEngineService + listeroService)
--   - vehicle_events        (vehicleHistoryService — compliance GPS)
--   - system_status         (vehicleHistoryService — key-value health)
--
-- Todas las tablas usan data_jsonb para preservar la estructura Firestore
-- original, además de columnas indexables para queries rápidas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- 1. CARTONES COMPLETADOS (cartones de servicio digital)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cartones_completados (
    id              VARCHAR(128) PRIMARY KEY,           -- Firestore doc id (ej: "<service>_<line>")
    agency_id       VARCHAR(50) REFERENCES empresas(agency_id),
    service_number  VARCHAR(50),
    line            VARCHAR(50),
    vehiculo_id     VARCHAR(128),
    conductor_id    VARCHAR(128),
    data_jsonb      JSONB NOT NULL DEFAULT '{}',
    updated_by      VARCHAR(128),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cartones_agency ON cartones_completados(agency_id);
CREATE INDEX IF NOT EXISTS idx_cartones_service_line ON cartones_completados(service_number, line);
CREATE INDEX IF NOT EXISTS idx_cartones_updated ON cartones_completados(updated_at DESC);

-- ───────────────────────────────────────────────────────────────────────
-- 2. PERSONAL (conductores, inspectores, listeros)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS personal (
    id                  VARCHAR(128) PRIMARY KEY,
    agency_id           VARCHAR(50) REFERENCES empresas(agency_id),
    internal_number     VARCHAR(50),
    full_name           VARCHAR(255),
    role                VARCHAR(50),                    -- conductor, driver, chofer, micrero, guarda, inspector, listero
    estado_hoy          VARCHAR(50) DEFAULT 'disponible', -- disponible | en_servicio | ausente | reserva | franco | licencia | enfermo
    motivo_ausencia     TEXT,
    ausencia_fecha      DATE,
    ausencia_registrada_por VARCHAR(128),
    hora_ultimo_servicio VARCHAR(8),                    -- HH:MM
    es_conductor_reserva BOOLEAN DEFAULT FALSE,
    telefono            VARCHAR(50),
    data_jsonb          JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_agency ON personal(agency_id);
CREATE INDEX IF NOT EXISTS idx_personal_role ON personal(role);
CREATE INDEX IF NOT EXISTS idx_personal_estado ON personal(estado_hoy);
CREATE INDEX IF NOT EXISTS idx_personal_internal ON personal(internal_number);

-- ───────────────────────────────────────────────────────────────────────
-- 3. TURNOS DIA (programación operativa diaria)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS turnos_dia (
    id                  VARCHAR(128) PRIMARY KEY,
    agency_id           VARCHAR(50) REFERENCES empresas(agency_id),
    fecha               DATE NOT NULL,                  -- YYYY-MM-DD
    conductor_id        VARCHAR(128) REFERENCES personal(id),
    conductor_nombre    VARCHAR(255),
    conductor_interno   VARCHAR(50),
    vehiculo_id         VARCHAR(128) REFERENCES vehiculos(id),
    vehiculo_interno    VARCHAR(50),
    linea_id            VARCHAR(50),
    variante_key        VARCHAR(100),
    turno               VARCHAR(20),                    -- madrugada | mañana | tarde | noche
    hora_salida         VARCHAR(8),                     -- HH:MM
    hora_llegada_estimada VARCHAR(8),
    terminal            VARCHAR(255),
    estado              VARCHAR(30) DEFAULT 'programado', -- programado | activo | completado | cancelado | sin_conductor | cubierto_reserva
    reserva_activada    BOOLEAN DEFAULT FALSE,
    conductor_reserva_id VARCHAR(128) REFERENCES personal(id),
    conductor_reserva_nombre VARCHAR(255),
    importancia_linea   INT DEFAULT 2,
    impacto_ingresos_estimado NUMERIC,
    observaciones       TEXT,
    firma_conductor     BOOLEAN DEFAULT FALSE,
    hora_firma          VARCHAR(8),
    data_jsonb          JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos_dia(fecha);
CREATE INDEX IF NOT EXISTS idx_turnos_agency_fecha ON turnos_dia(agency_id, fecha);
CREATE INDEX IF NOT EXISTS idx_turnos_conductor_fecha ON turnos_dia(conductor_id, fecha);
CREATE INDEX IF NOT EXISTS idx_turnos_vehiculo_fecha ON turnos_dia(vehiculo_id, fecha);
CREATE INDEX IF NOT EXISTS idx_turnos_estado ON turnos_dia(estado);
CREATE INDEX IF NOT EXISTS idx_turnos_linea ON turnos_dia(linea_id);

-- ───────────────────────────────────────────────────────────────────────
-- 4. ALERTAS OPERATIVAS (cascade engine + listero)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alertas_operativas (
    id                      VARCHAR(128) PRIMARY KEY,
    agency_id               VARCHAR(50) REFERENCES empresas(agency_id),
    fecha                   DATE NOT NULL,
    tipo                    VARCHAR(50) NOT NULL,       -- ausencia_conductor | vehiculo_en_taller | gap_frecuencia | bunching | rival_cercano | infraccion_imminente | reserva_disponible | cobertura_critica
    urgencia                VARCHAR(20) NOT NULL,       -- baja | media | alta | critica
    linea_id                VARCHAR(50),
    conductor_id            VARCHAR(128),
    vehiculo_id             VARCHAR(128),
    turno_id                VARCHAR(128),
    titulo                  TEXT,
    mensaje                 TEXT,
    accion_sugerida         TEXT,
    datos_extra             JSONB DEFAULT '{}',
    atendida                BOOLEAN DEFAULT FALSE,
    atendida_por            VARCHAR(128),
    hora_atendida           VARCHAR(8),
    impacto_ingresos_usd    NUMERIC,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_fecha ON alertas_operativas(fecha);
CREATE INDEX IF NOT EXISTS idx_alertas_atendida_fecha ON alertas_operativas(fecha, atendida);
CREATE INDEX IF NOT EXISTS idx_alertas_tipo_linea_created ON alertas_operativas(tipo, linea_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_urgencia ON alertas_operativas(urgencia);

-- ───────────────────────────────────────────────────────────────────────
-- 5. VEHICLE EVENTS (telemetría GPS + compliance, TTL 30 días)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_events (
    id                  BIGSERIAL PRIMARY KEY,
    id_bus              VARCHAR(50) NOT NULL,
    agency_id           VARCHAR(50) NOT NULL,
    empresa             VARCHAR(50),
    linea               VARCHAR(50),
    lat                 DOUBLE PRECISION,
    lon                 DOUBLE PRECISION,
    geom                GEOMETRY(Point, 4326),
    velocidad           DOUBLE PRECISION,
    estado_cumplimiento VARCHAR(50),                    -- EN_TIEMPO | ATRASADO | ADELANTADO | SIN_HORARIO | FUERA_DE_SERVICIO
    desviacion_min      DOUBLE PRECISION,
    trip_id             VARCHAR(100),
    proxima_parada      TEXT,
    timestamp_gps       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    expires_at          TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_ve_id_bus_created ON vehicle_events(id_bus, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ve_agency_created ON vehicle_events(agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ve_linea_created ON vehicle_events(linea, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ve_geom ON vehicle_events USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_ve_expires ON vehicle_events(expires_at);

-- Función para limpieza automática de eventos expirados (TTL).
-- Llamar manualmente con: SELECT vehicle_events_purge();
-- O agendar con pg_cron / pgAgent / Windows Task cada 24h.
CREATE OR REPLACE FUNCTION vehicle_events_purge() RETURNS INTEGER AS $$
DECLARE
    deleted INTEGER;
BEGIN
    DELETE FROM vehicle_events WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────
-- 6. SYSTEM STATUS (key-value para health/metadata, ej: stm_gps endpoint)
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_status (
    key             VARCHAR(100) PRIMARY KEY,           -- ej: 'stm_gps', 'last_compliance_run'
    value_jsonb     JSONB NOT NULL DEFAULT '{}',
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ───────────────────────────────────────────────────────────────────────
-- 7. SEED MÍNIMO PARA TESTS
-- ───────────────────────────────────────────────────────────────────────
-- Personal de prueba (3 conductores)
INSERT INTO personal (id, agency_id, internal_number, full_name, role, estado_hoy, es_conductor_reserva, data_jsonb)
VALUES
    ('seed-cond-001', '70', '0001', 'Juan Demo Pérez', 'conductor', 'disponible', false, '{"seed":true}'::jsonb),
    ('seed-cond-002', '70', '0002', 'Marta Demo Suárez', 'conductor', 'reserva', true,  '{"seed":true}'::jsonb),
    ('seed-cond-003', '70', '0003', 'Diego Demo Rojas', 'inspector', 'disponible', false, '{"seed":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────
-- 8. TRIGGER de updated_at automático (DRY)
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cartones_updated     ON cartones_completados;
CREATE TRIGGER trg_cartones_updated     BEFORE UPDATE ON cartones_completados FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_personal_updated     ON personal;
CREATE TRIGGER trg_personal_updated     BEFORE UPDATE ON personal             FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_turnos_updated       ON turnos_dia;
CREATE TRIGGER trg_turnos_updated       BEFORE UPDATE ON turnos_dia           FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_system_status_updated ON system_status;
CREATE TRIGGER trg_system_status_updated BEFORE UPDATE ON system_status        FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN schema_fase2.sql
-- ═══════════════════════════════════════════════════════════════════════════
