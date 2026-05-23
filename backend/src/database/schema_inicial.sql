-- Extensión PostGIS (Ya activa, pero se garantiza para migraciones)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ===========================================================================
-- 1. TABLA MAESTRA DE EMPRESAS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    agency_id VARCHAR(50) UNIQUE NOT NULL, -- Identificador único STM (ej: 70=UCOT)
    nombre VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed inicial de operadores locales
INSERT INTO empresas (agency_id, nombre) VALUES 
('70', 'UCOT'), 
('50', 'CUTCSA'),
('20', 'COME'),
('10', 'COETC')
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 2. TABLA DE USUARIOS (RBAC LOCAL)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) PRIMARY KEY, -- UID extraído de Firebase o ID local
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL, -- SUPERADMIN, ADMIN, INSPECTOR, CONDUCTOR, TRAFFIC
    agency_id VARCHAR(50) REFERENCES empresas(agency_id),
    data_jsonb JSONB, -- Datos extendidos de Firebase originales
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ===========================================================================
-- 3. FLOTA Y VEHÍCULOS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS vehiculos (
    id VARCHAR(128) PRIMARY KEY,
    agency_id VARCHAR(50) REFERENCES empresas(agency_id),
    internal_number VARCHAR(50),
    plate VARCHAR(50),
    data_jsonb JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ===========================================================================
-- 4. REGISTROS TRANSACCIONALES E INSPECCIONES
-- ===========================================================================
CREATE TABLE IF NOT EXISTS inspecciones (
    id VARCHAR(128) PRIMARY KEY,
    agency_id VARCHAR(50) REFERENCES empresas(agency_id),
    vehiculo_id VARCHAR(128) REFERENCES vehiculos(id),
    fecha_inspeccion TIMESTAMP,
    inspector_id VARCHAR(128) REFERENCES users(id),
    data_jsonb JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ===========================================================================
-- 5. ALERTAS DE CUMPLIMIENTO Y TRÁFICO
-- ===========================================================================
CREATE TABLE IF NOT EXISTS alertas (
    id VARCHAR(128) PRIMARY KEY,
    agency_id VARCHAR(50) REFERENCES empresas(agency_id),
    tipo_alerta VARCHAR(100),
    severity VARCHAR(50), -- BAJA, MEDIA, CRÍTICA
    data_jsonb JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ===========================================================================
-- 6. HISTÓRICO TELEMETRÍA GPS (INFRAESTRUCTURA GEOGRÁFICA)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS gps_history (
    id SERIAL PRIMARY KEY,
    agency_id VARCHAR(50) REFERENCES empresas(agency_id),
    vehiculo_id VARCHAR(128) REFERENCES vehiculos(id),
    geom GEOMETRY(Point, 4326), -- Almacenamiento espacial nativo
    speed FLOAT,
    bearing FLOAT,
    timestamp TIMESTAMP NOT NULL,
    data_jsonb JSONB
);

-- ===========================================================================
-- 7. TABLA DE AUDITORÍA INMUTABLE (CUMPLIMIENTO LEY 18.331)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS logs_auditoria (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(128),
    agency_id VARCHAR(50),
    accion VARCHAR(255) NOT NULL, -- LOGIN, CONSULTA_DATOS, MODIFICACIÓN
    recurso VARCHAR(255), -- Nombre de la tabla o endpoint accedido
    detalles_jsonb JSONB, -- Metadatos del query
    client_ip VARCHAR(45),
    timestamp TIMESTAMP DEFAULT NOW()
);

-- ===========================================================================
-- 8. ÍNDICES DE ALTO RENDIMIENTO
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id);
CREATE INDEX IF NOT EXISTS idx_vehiculos_agency ON vehiculos(agency_id);
CREATE INDEX IF NOT EXISTS idx_inspecciones_agency ON inspecciones(agency_id);
CREATE INDEX IF NOT EXISTS idx_inspecciones_fecha ON inspecciones(fecha_inspeccion DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_agency ON alertas(agency_id);
CREATE INDEX IF NOT EXISTS idx_gps_agency_time ON gps_history(agency_id, timestamp DESC);

-- Índice Geográfico Espacial GIST para búsquedas de radar ultra-rápidas
CREATE INDEX IF NOT EXISTS idx_gps_geom ON gps_history USING GIST(geom);
