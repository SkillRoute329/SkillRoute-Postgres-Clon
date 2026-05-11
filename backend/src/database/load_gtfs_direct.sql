-- Load GTFS DIRECT WITHOUT POWERSHELL HASSLES
\echo '--- 1. Creando Esquema GTFS ---'
\i 'C:/SkillRoute_Master/repo/backend/src/database/schema_gtfs.sql'

\echo '--- 2. Cargando Datos ---'
\copy gtfs.agency FROM 'C:/SkillRoute_Master/data_imports/gtfs_premium/agency.txt' WITH CSV HEADER ENCODING 'UTF-8';
\copy gtfs.calendar FROM 'C:/SkillRoute_Master/data_imports/gtfs_premium/calendar.txt' WITH CSV HEADER ENCODING 'UTF-8';
\copy gtfs.routes FROM 'C:/SkillRoute_Master/data_imports/gtfs_premium/routes.txt' WITH CSV HEADER ENCODING 'UTF-8';
\copy gtfs.trips FROM 'C:/SkillRoute_Master/data_imports/gtfs_premium/trips.txt' WITH CSV HEADER ENCODING 'UTF-8';
\copy gtfs.stops(stop_id,stop_name,stop_code,stop_lat,stop_lon,location_type,stop_url) FROM 'C:/SkillRoute_Master/data_imports/gtfs_premium/stops.txt' WITH CSV HEADER ENCODING 'UTF-8';
\copy gtfs.shapes FROM 'C:/SkillRoute_Master/data_imports/gtfs_premium/shapes.txt' WITH CSV HEADER ENCODING 'UTF-8';
\copy gtfs.stop_times FROM 'C:/SkillRoute_Master/data_imports/gtfs_premium/stop_times.txt' WITH CSV HEADER ENCODING 'UTF-8';

\echo '--- 3. Optimizando Geometrias e Indices ---'
UPDATE gtfs.stops SET geom = ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326) WHERE geom IS NULL;
CREATE INDEX IF NOT EXISTS idx_stops_geom ON gtfs.stops USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON gtfs.stop_times(trip_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON gtfs.stop_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_trips_route ON gtfs.trips(route_id);
CREATE INDEX IF NOT EXISTS idx_shapes_id ON gtfs.shapes(shape_id);

ANALYZE gtfs.stop_times;
ANALYZE gtfs.stops;

\echo '--- 4. Conteos Finales ---'
SELECT 'gtfs.stop_times' as tabla, count(*) FROM gtfs.stop_times
UNION ALL
SELECT 'gtfs.stops', count(*) FROM gtfs.stops
UNION ALL
SELECT 'gtfs.shapes', count(*) FROM gtfs.shapes;
