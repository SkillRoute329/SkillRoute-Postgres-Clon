-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA FASE 4 EXTENDED — Tablas que el frontend usa y aún no existían
-- ═══════════════════════════════════════════════════════════════════════════
-- Fecha: 2026-05-11
-- Aplicar con:
--   psql -U postgres -d skillroute_master -f schema_fase4_extended.sql
--
-- Mientras Antigravity migra el frontend en paralelo, este schema crea las
-- ~30 tablas que el frontend espera consumir vía /api/db/<collection>.
--
-- Patrón uniforme:
--   - id        VARCHAR(128) PRIMARY KEY
--   - agency_id VARCHAR(50)  (cuando aplica)
--   - data_jsonb JSONB       (shape variable de Firestore preservado)
--   - created_at, updated_at TIMESTAMPTZ
--   - Índices indispensables (agency_id, fecha si aplica)
--
-- Filosofía: tablas vacías al principio. El frontend escribe → quedan
-- pobladas. Cuando se confirme uso real, se agregan columnas indexables
-- específicas (FASE 4.10 — refinamiento).
--
-- REGLA -1 NO REGRESIÓN: todas con IF NOT EXISTS.
-- REGLA -4 ESCALABILIDAD: índice en agency_id y created_at para queries
-- típicas del frontend (multitenancy + ordenamiento temporal).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Programación operativa ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS programacion_diaria (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    fecha       DATE,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_progdia_fecha ON programacion_diaria(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_progdia_agency ON programacion_diaria(agency_id);

CREATE TABLE IF NOT EXISTS programacion_semanal (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    semana_iso  VARCHAR(10),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_progsem_semana ON programacion_semanal(semana_iso DESC);

CREATE TABLE IF NOT EXISTS shifts (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    user_id     VARCHAR(128),
    fecha       DATE,
    estado      VARCHAR(50),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shifts_fecha ON shifts(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_user_fecha ON shifts(user_id, fecha);

CREATE TABLE IF NOT EXISTS driver_schedule (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    conductor_id VARCHAR(128),
    fecha       DATE,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dschedule_fecha ON driver_schedule(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_dschedule_conductor ON driver_schedule(conductor_id);

-- ── Asignaciones y rotaciones ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS active_assignments (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    coche_id    VARCHAR(50),
    conductor_id VARCHAR(128),
    linea_id    VARCHAR(50),
    fecha       DATE,
    activa      BOOLEAN DEFAULT TRUE,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aassign_fecha_activa ON active_assignments(fecha DESC, activa);

CREATE TABLE IF NOT EXISTS assignment_conflicts (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    tipo        VARCHAR(100),
    severidad   VARCHAR(50),
    resuelto    BOOLEAN DEFAULT FALSE,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aconfl_resuelto ON assignment_conflicts(resuelto, created_at DESC);

CREATE TABLE IF NOT EXISTS rotation_rules (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    nombre      VARCHAR(255),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_rotation (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    conductor_id VARCHAR(128),
    rotation_id VARCHAR(128),
    fecha       DATE,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_protation_conductor ON personal_rotation(conductor_id, fecha);

CREATE TABLE IF NOT EXISTS service_matrix (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_category_assignment (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    categoria   VARCHAR(100),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coche_personal (
    id           VARCHAR(128) PRIMARY KEY,
    agency_id    VARCHAR(50),
    coche_id     VARCHAR(50),
    conductor_id VARCHAR(128),
    fecha_desde  DATE,
    fecha_hasta  DATE,
    data_jsonb   JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cocheper_coche ON coche_personal(coche_id);
CREATE INDEX IF NOT EXISTS idx_cocheper_conductor ON coche_personal(conductor_id);

-- ── Mantenimiento e inspecciones de flota ──────────────────────────────────

CREATE TABLE IF NOT EXISTS maintenance (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    coche_id    VARCHAR(50),
    tipo        VARCHAR(100),
    estado      VARCHAR(50),
    fecha       DATE,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_maint_coche_fecha ON maintenance(coche_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_maint_estado ON maintenance(estado);

CREATE TABLE IF NOT EXISTS mantenimiento_logs (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    coche_id    VARCHAR(50),
    accion      VARCHAR(255),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mlogs_coche_created ON mantenimiento_logs(coche_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inspecciones_flota (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    coche_id    VARCHAR(50),
    inspector_id VARCHAR(128),
    fecha       DATE,
    resultado   VARCHAR(50),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inspflota_coche_fecha ON inspecciones_flota(coche_id, fecha DESC);

CREATE TABLE IF NOT EXISTS notificaciones_flota (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    coche_id    VARCHAR(50),
    tipo        VARCHAR(100),
    leida       BOOLEAN DEFAULT FALSE,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nflota_leida ON notificaciones_flota(leida, created_at DESC);

CREATE TABLE IF NOT EXISTS vehicle_categories (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    nombre      VARCHAR(255),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fleet (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Recursos humanos / personal ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS licencias (
    id           VARCHAR(128) PRIMARY KEY,
    agency_id    VARCHAR(50),
    persona_id   VARCHAR(128),
    tipo         VARCHAR(100),
    fecha_desde  DATE,
    fecha_hasta  DATE,
    data_jsonb   JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lic_persona ON licencias(persona_id, fecha_desde DESC);

CREATE TABLE IF NOT EXISTS feriados (
    id          VARCHAR(128) PRIMARY KEY,
    fecha       DATE UNIQUE,
    nombre      VARCHAR(255),
    tipo        VARCHAR(50),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feriados_fecha ON feriados(fecha);

CREATE TABLE IF NOT EXISTS departments (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    nombre      VARCHAR(255),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS penalties (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    persona_id  VARCHAR(128),
    tipo        VARCHAR(100),
    monto       NUMERIC,
    aplicada    BOOLEAN DEFAULT FALSE,
    fecha       DATE,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pen_persona ON penalties(persona_id, fecha DESC);

CREATE TABLE IF NOT EXISTS discounts (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    persona_id  VARCHAR(128),
    monto       NUMERIC,
    fecha       DATE,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_disc_persona ON discounts(persona_id, fecha DESC);

-- ── Mensajería interna ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mensajes_internos (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    from_user   VARCHAR(128),
    to_user     VARCHAR(128),
    asunto      VARCHAR(500),
    cuerpo      TEXT,
    leido       BOOLEAN DEFAULT FALSE,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msg_to_leido ON mensajes_internos(to_user, leido, created_at DESC);

-- ── Configuración del sistema y catálogos genéricos ────────────────────────

CREATE TABLE IF NOT EXISTS system_config (
    key         VARCHAR(100) PRIMARY KEY,
    value_jsonb JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS universal (
    id          VARCHAR(128) PRIMARY KEY,
    tipo        VARCHAR(100),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_universal_tipo ON universal(tipo);

CREATE TABLE IF NOT EXISTS servicio_estado (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    linea_id    VARCHAR(50),
    estado      VARCHAR(50),
    fecha       DATE,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_servest_linea_fecha ON servicio_estado(linea_id, fecha DESC);

CREATE TABLE IF NOT EXISTS correlativo (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    tipo        VARCHAR(100),
    ultimo      BIGINT NOT NULL DEFAULT 0,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_import (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    archivo     VARCHAR(500),
    estado      VARCHAR(50),
    filas       INT,
    errores     INT,
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Logs de incidencias ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS logs_incidencias (
    id          VARCHAR(128) PRIMARY KEY,
    agency_id   VARCHAR(50),
    tipo        VARCHAR(100),
    severidad   VARCHAR(50),
    data_jsonb  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_logsinc_tipo_created ON logs_incidencias(tipo, created_at DESC);

-- ── Parámetros operativos (tarifas, etc.) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS parametros_operativos (
    key         VARCHAR(100) PRIMARY KEY,
    value_jsonb JSONB NOT NULL DEFAULT '{}',
    descripcion TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Trigger genérico de updated_at para todas las que lo tienen ────────────

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT table_name FROM information_schema.columns
             WHERE table_schema='public' AND column_name='updated_at'
               AND table_name IN (
                   'programacion_diaria','programacion_semanal','shifts','driver_schedule',
                   'active_assignments','rotation_rules','service_matrix','maintenance',
                   'vehicle_categories','fleet','servicio_estado','correlativo',
                   'system_config','universal','parametros_operativos'
               )
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON %I', r.table_name, r.table_name);
        EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()', r.table_name, r.table_name);
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN schema_fase4_extended.sql
-- ═══════════════════════════════════════════════════════════════════════════
