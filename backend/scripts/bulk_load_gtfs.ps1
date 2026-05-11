$env:PGPASSWORD='I0SAv9zhoQDUfTPc7L+KmkAw';
$psql = 'C:\Program Files\PostgreSQL\15\bin\psql.exe';
$baseDir = 'C:\SkillRoute_Master\data_imports\gtfs_premium';

Write-Host "🏛️ Creando tablas GTFS...";
& $psql -U postgres -d skillroute_master -f 'C:\SkillRoute_Master\repo\backend\src\database\schema_gtfs.sql';

Write-Host "📦 Cargando Agency...";
& $psql -U postgres -d skillroute_master -c "\copy gtfs.agency FROM '$baseDir\agency.txt' WITH CSV HEADER ENCODING 'UTF-8'";

Write-Host "📦 Cargando Calendar...";
& $psql -U postgres -d skillroute_master -c "\copy gtfs.calendar FROM '$baseDir\calendar.txt' WITH CSV HEADER ENCODING 'UTF-8'";

Write-Host "📦 Cargando Routes...";
& $psql -U postgres -d skillroute_master -c "\copy gtfs.routes FROM '$baseDir\routes.txt' WITH CSV HEADER ENCODING 'UTF-8'";

Write-Host "📦 Cargando Trips...";
& $psql -U postgres -d skillroute_master -c "\copy gtfs.trips FROM '$baseDir\trips.txt' WITH CSV HEADER ENCODING 'UTF-8'";

Write-Host "📦 Cargando Stops...";
& $psql -U postgres -d skillroute_master -c "\copy gtfs.stops(stop_id,stop_name,stop_code,stop_lat,stop_lon,location_type,stop_url) FROM '$baseDir\stops.txt' WITH CSV HEADER ENCODING 'UTF-8'";

Write-Host "📦 Cargando Shapes (11MB)...";
& $psql -U postgres -d skillroute_master -c "\copy gtfs.shapes FROM '$baseDir\shapes.txt' WITH CSV HEADER ENCODING 'UTF-8'";

Write-Host "🔥 CARGANDO STOP TIMES (88MB - Este es el pesado!)...";
& $psql -U postgres -d skillroute_master -c "\copy gtfs.stop_times FROM '$baseDir\stop_times.txt' WITH CSV HEADER ENCODING 'UTF-8'";

Write-Host "⚡ Ejecutando Post-Procesamiento y Creación de Índices...";
$postSql = @"
UPDATE gtfs.stops SET geom = ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326) WHERE geom IS NULL;
CREATE INDEX IF NOT EXISTS idx_stops_geom ON gtfs.stops USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON gtfs.stop_times(trip_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON gtfs.stop_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_trips_route ON gtfs.trips(route_id);
CREATE INDEX IF NOT EXISTS idx_shapes_id ON gtfs.shapes(shape_id);
ANALYZE gtfs.stop_times;
ANALYZE gtfs.stops;
"@;
$postSql | Out-File -FilePath "C:\SkillRoute_Master\repo\backend\src\database\post_gtfs.sql" -Encoding utf8;
& $psql -U postgres -d skillroute_master -f 'C:\SkillRoute_Master\repo\backend\src\database\post_gtfs.sql';

Write-Host "✅ HIDRATACIÓN SUPREMA COMPLETADA.";
& $psql -U postgres -d skillroute_master -c "SELECT 'gtfs.stop_times' as tabla, count(*) FROM gtfs.stop_times UNION ALL SELECT 'gtfs.stops', count(*) FROM gtfs.stops UNION ALL SELECT 'gtfs.shapes', count(*) FROM gtfs.shapes;";
