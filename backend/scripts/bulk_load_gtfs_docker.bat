@echo off
set DB_NAME=skillroute_soberano
set BASEDIR=C:\Users\jonat\Desktop\PROYECTOS\SkillRoute-Postgres-Remoto\gtfs_data
set REPO=C:\Users\jonat\Desktop\PROYECTOS\SkillRoute-Postgres-Remoto

echo Creando tablas GTFS...
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% < "%REPO%\backend\src\database\schema_gtfs.sql"

echo Cargando Agency...
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "\copy gtfs.agency(agency_id,agency_name,agency_url,agency_timezone) FROM stdin WITH CSV HEADER ENCODING 'UTF-8'" < "%BASEDIR%\agency.txt"

echo Cargando Calendar...
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "\copy gtfs.calendar(service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date) FROM stdin WITH CSV HEADER ENCODING 'UTF-8'" < "%BASEDIR%\calendar.txt"

echo Cargando Routes...
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "\copy gtfs.routes(route_id,agency_id,route_short_name,route_long_name,route_type) FROM stdin WITH CSV HEADER ENCODING 'UTF-8'" < "%BASEDIR%\routes.txt"

echo Cargando Trips...
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "\copy gtfs.trips(route_id,service_id,trip_id) FROM stdin WITH CSV HEADER ENCODING 'UTF-8'" < "%BASEDIR%\trips.txt"

echo Cargando Stops...
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "\copy gtfs.stops(stop_id,stop_code,stop_name,stop_desc,stop_lat,stop_lon) FROM stdin WITH CSV HEADER ENCODING 'UTF-8'" < "%BASEDIR%\stops.txt"

echo Cargando Stop Times...
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "\copy gtfs.stop_times(trip_id,arrival_time,departure_time,stop_id,stop_sequence) FROM stdin WITH CSV HEADER ENCODING 'UTF-8'" < "%BASEDIR%\stop_times.txt"

echo Ejecutando Post-Procesamiento...
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "UPDATE gtfs.stops SET geom = ST_SetSRID(ST_MakePoint(stop_lon, stop_lat), 4326) WHERE geom IS NULL;"
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "CREATE INDEX IF NOT EXISTS idx_stops_geom ON gtfs.stops USING GIST(geom);"
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON gtfs.stop_times(trip_id);"
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON gtfs.stop_times(stop_id);"
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "CREATE INDEX IF NOT EXISTS idx_trips_route ON gtfs.trips(route_id);"
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "ANALYZE gtfs.stop_times;"
docker exec -i skillroute_db psql -U postgres -d %DB_NAME% -c "ANALYZE gtfs.stops;"

echo DONE.
