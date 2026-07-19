-- schema_fase7_intelligence.sql
-- FASE 7: Inteligencia Competitiva y Censo de Carga (Agosto 2026)
-- Tablas para almacenar historial de carga y pre-cálculo de solapamiento de líneas.

SET statement_timeout = 0;

-- 1. Historial de Carga por Parada (Mensual)
-- Reemplaza los polígonos del censo con los boletos reales vendidos.
CREATE TABLE IF NOT EXISTS gtfs.stop_ridership_history (
    id SERIAL PRIMARY KEY,
    stop_id VARCHAR(50) NOT NULL,
    route_id VARCHAR(50) NOT NULL,
    direction_id INT, -- Sentido (Ida/Vuelta)
    agency_id INT,
    year_month VARCHAR(7) NOT NULL, -- Formato: YYYY-MM
    boarding_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stop_id, route_id, direction_id, year_month)
);

-- Índices para búsquedas rápidas al renderizar el mapa
CREATE INDEX IF NOT EXISTS idx_ridership_route ON gtfs.stop_ridership_history (route_id, direction_id, year_month);
CREATE INDEX IF NOT EXISTS idx_ridership_stop ON gtfs.stop_ridership_history (stop_id, year_month);


-- 2. Solapamiento de Competencia Espacial (Pre-calculado)
-- Tabla estática cruzada usando PostGIS/Lógica de Paradas para evitar colgar el servidor.
CREATE TABLE IF NOT EXISTS gtfs.competitor_overlap (
    id SERIAL PRIMARY KEY,
    base_route_id VARCHAR(50) NOT NULL,
    base_direction_id INT NOT NULL,
    competitor_route_id VARCHAR(50) NOT NULL,
    competitor_direction_id INT NOT NULL,
    shared_stops_count INT NOT NULL,
    overlap_score FLOAT, -- Peso algorítmico basado en carga
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(base_route_id, base_direction_id, competitor_route_id, competitor_direction_id)
);

-- Índice rápido para buscar competidores de una línea específica
CREATE INDEX IF NOT EXISTS idx_overlap_base ON gtfs.competitor_overlap (base_route_id, base_direction_id);
