$env:PGPASSWORD='Skill329';
$psql = 'psql -p 5433';
$baseDir = 'C:\Users\jonat\Desktop\PROYECTOS\SkillRoute-Postgres-Remoto\gtfs_data';
$dbName = 'skillroute_soberano';
Write-Host "🏛️ Creando tablas GTFS...";
& cmd /c "$psql -U postgres -d $dbName -f 'C:\Users\jonat\Desktop\PROYECTOS\SkillRoute-Postgres-Remoto\backend\src\database\schema_gtfs.sql'"

Write-Host "📦 Cargando Agency...";
& cmd /c "$psql -U postgres -d $dbName -c `"\copy gtfs.agency FROM '$baseDir\agency.txt' WITH CSV HEADER ENCODING 'UTF-8'`""

Write-Host "📦 Cargando Calendar...";
& cmd /c "$psql -U postgres -d $dbName -c `"\copy gtfs.calendar FROM '$baseDir\calendar.txt' WITH CSV HEADER ENCODING 'UTF-8'`""

Write-Host "📦 Cargando Routes...";
& cmd /c "$psql -U postgres -d $dbName -c `"\copy gtfs.routes FROM '$baseDir\routes.txt' WITH CSV HEADER ENCODING 'UTF-8'`""

Write-Host "📦 Cargando Trips...";
& cmd /c "$psql -U postgres -d $dbName -c `"\copy gtfs.trips FROM '$baseDir\trips.txt' WITH CSV HEADER ENCODING 'UTF-8'`""

Write-Host "📦 Cargando Stops...";
& cmd /c "$psql -U postgres -d $dbName -c `"\copy gtfs.stops(stop_id,stop_name,stop_code,stop_lat,stop_lon,location_type,stop_url) FROM '$baseDir\stops.txt' WITH CSV HEADER ENCODING 'UTF-8'`""

Write-Host "📦 Cargando Shapes (11MB)...";
& cmd /c "$psql -U postgres -d $dbName -c `"\copy gtfs.shapes FROM '$baseDir\shapes.txt' WITH CSV HEADER ENCODING 'UTF-8'`""

Write-Host "🔥 CARGANDO STOP TIMES (88MB - Este es el pesado!)...";
& cmd /c "$psql -U postgres -d $dbName -c `"\copy gtfs.stop_times FROM '$baseDir\stop_times.txt' WITH CSV HEADER ENCODING 'UTF-8'`""

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
$postSql | Out-File -FilePath "C:\Users\jonat\Desktop\PROYECTOS\SkillRoute-Postgres-Remoto\backend\src\database\post_gtfs.sql" -Encoding utf8;
& cmd /c "$psql -U postgres -d $dbName -f 'C:\Users\jonat\Desktop\PROYECTOS\SkillRoute-Postgres-Remoto\backend\src\database\post_gtfs.sql'"

Write-Host "✅ HIDRATACIÓN SUPREMA COMPLETADA.";
& cmd /c "$psql -U postgres -d $dbName -c `"SELECT 'gtfs.stop_times' as tabla, count(*) FROM gtfs.stop_times UNION ALL SELECT 'gtfs.stops', count(*) FROM gtfs.stops UNION ALL SELECT 'gtfs.shapes', count(*) FROM gtfs.shapes;`""
