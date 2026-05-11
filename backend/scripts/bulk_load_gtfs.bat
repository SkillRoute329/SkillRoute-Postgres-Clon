@echo off
set PGPASSWORD=I0SAv9zhoQDUfTPc7L+KmkAw
set PSQL="C:\Program Files\PostgreSQL\15\bin\psql.exe"
set BASEDIR=C:\SkillRoute_Master\data_imports\gtfs_premium

echo [1/8] Creando Esquema SQL...
%PSQL% -U postgres -d skillroute_master -f "C:\SkillRoute_Master\repo\backend\src\database\schema_gtfs.sql"

echo [2/8] Cargando Agency...
%PSQL% -U postgres -d skillroute_master -c "\copy gtfs.agency FROM '%BASEDIR%\agency.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo [3/8] Cargando Calendar...
%PSQL% -U postgres -d skillroute_master -c "\copy gtfs.calendar FROM '%BASEDIR%\calendar.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo [4/8] Cargando Routes...
%PSQL% -U postgres -d skillroute_master -c "\copy gtfs.routes FROM '%BASEDIR%\routes.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo [5/8] Cargando Trips...
%PSQL% -U postgres -d skillroute_master -c "\copy gtfs.trips FROM '%BASEDIR%\trips.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo [6/8] Cargando Stops...
%PSQL% -U postgres -d skillroute_master -c "\copy gtfs.stops(stop_id,stop_name,stop_code,stop_lat,stop_lon,location_type,stop_url) FROM '%BASEDIR%\stops.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo [7/8] Cargando Shapes (11MB)...
%PSQL% -U postgres -d skillroute_master -c "\copy gtfs.shapes FROM '%BASEDIR%\shapes.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo [8/8] Cargando Stop Times (88MB - Por favor espere)...
%PSQL% -U postgres -d skillroute_master -c "\copy gtfs.stop_times FROM '%BASEDIR%\stop_times.txt' WITH CSV HEADER ENCODING 'UTF-8'"

echo Ejecutando post-optimización...
%PSQL% -U postgres -d skillroute_master -c "UPDATE gtfs.stops SET geom = ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326); CREATE INDEX IF NOT EXISTS idx_stops_geom ON gtfs.stops USING GIST(geom); CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON gtfs.stop_times(trip_id); CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON gtfs.stop_times(stop_id); CREATE INDEX IF NOT EXISTS idx_trips_route ON gtfs.trips(route_id); CREATE INDEX IF NOT EXISTS idx_shapes_id ON gtfs.shapes(shape_id); ANALYZE gtfs.stop_times; ANALYZE gtfs.stops;"

echo VALIDANDO TOTALES...
%PSQL% -U postgres -d skillroute_master -c "SELECT 'stop_times' as t, count(*) FROM gtfs.stop_times UNION ALL SELECT 'stops', count(*) FROM gtfs.stops;"

echo PROCESO COMPLETADO.
