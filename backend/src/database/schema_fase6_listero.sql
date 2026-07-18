-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEMA FASE 6 — Rediseño del Módulo Listero y Distribución
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Ampliación de la tabla personal (Micreros vs En Lista, y descansos)
ALTER TABLE personal
ADD COLUMN IF NOT EXISTS regimen_rotacion VARCHAR(50) DEFAULT 'semanal', -- semanal, fijo_manana, fijo_tarde
ADD COLUMN IF NOT EXISTS is_en_lista BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS patron_descanso VARCHAR(50) DEFAULT 'sab_dom_alterno';

-- 2. Tabla de Solicitudes ("Papelitos Digitales")
CREATE TABLE IF NOT EXISTS solicitudes_listero (
    id                  VARCHAR(128) PRIMARY KEY,
    agency_id           VARCHAR(50),
    conductor_id        VARCHAR(128) REFERENCES personal(id),
    tipo_solicitud      VARCHAR(50) NOT NULL, -- correlativo, cambio_turno, cambio_descanso
    fecha_objetivo      DATE NOT NULL,
    turno_objetivo      VARCHAR(20),
    coche_objetivo      VARCHAR(50),
    estado              VARCHAR(30) DEFAULT 'pendiente', -- pendiente, emparejado, aprobado, rechazado
    notas               TEXT,
    fecha_creacion      TIMESTAMPTZ DEFAULT NOW(),
    fecha_actualizacion TIMESTAMPTZ DEFAULT NOW(),
    resuelto_por        VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_listero_agency ON solicitudes_listero(agency_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_listero_conductor ON solicitudes_listero(conductor_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_listero_estado ON solicitudes_listero(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_listero_fecha ON solicitudes_listero(fecha_objetivo);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS trg_solicitudes_listero_updated ON solicitudes_listero;
CREATE TRIGGER trg_solicitudes_listero_updated
BEFORE UPDATE ON solicitudes_listero
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
