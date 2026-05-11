-- Creación de esquema GTFS SOBERANO
CREATE SCHEMA IF NOT EXISTS gtfs;

-- 1. Agencias
DROP TABLE IF EXISTS gtfs.agency CASCADE;
CREATE TABLE gtfs.agency (
    agency_id varchar(50) PRIMARY KEY,
    agency_name varchar(255),
    agency_url varchar(255),
    agency_timezone varchar(50),
    agency_phone varchar(50),
    agency_lang varchar(10)
);

-- 2. Calendario
DROP TABLE IF EXISTS gtfs.calendar CASCADE;
CREATE TABLE gtfs.calendar (
    service_id varchar(100) PRIMARY KEY,
    monday int,
    tuesday int,
    wednesday int,
    thursday int,
    friday int,
    saturday int,
    sunday int,
    start_date varchar(10),
    end_date varchar(10)
);

-- 3. Rutas
DROP TABLE IF EXISTS gtfs.routes CASCADE;
CREATE TABLE gtfs.routes (
    route_id varchar(100) PRIMARY KEY,
    agency_id varchar(50),
    route_short_name varchar(50),
    route_long_name varchar(255),
    route_desc text,
    route_type int
);

-- 4. Shapes (Geometría)
DROP TABLE IF EXISTS gtfs.shapes CASCADE;
CREATE TABLE gtfs.shapes (
    shape_id varchar(100),
    shape_pt_lat double precision,
    shape_pt_lon double precision,
    shape_pt_sequence int,
    PRIMARY KEY (shape_id, shape_pt_sequence)
);

-- 5. Viajes
DROP TABLE IF EXISTS gtfs.trips CASCADE;
CREATE TABLE gtfs.trips (
    route_id varchar(100),
    service_id varchar(100),
    trip_id varchar(100) PRIMARY KEY,
    trip_headsign varchar(255),
    direction_id int,
    block_id varchar(100),
    shape_id varchar(100),
    wheelchair_accessible int
);

-- 6. Paradas
DROP TABLE IF EXISTS gtfs.stops CASCADE;
CREATE TABLE gtfs.stops (
    stop_id varchar(100) PRIMARY KEY,
    stop_name varchar(255),
    stop_code varchar(50),
    stop_lat double precision,
    stop_lon double precision,
    location_type int,
    stop_url varchar(255),
    geom geometry(Point, 4326) -- Para PostGIS mágico!
);

-- 7. Horarios de Parada (El monstruo de 88MB)
DROP TABLE IF EXISTS gtfs.stop_times CASCADE;
CREATE TABLE gtfs.stop_times (
    trip_id varchar(100),
    arrival_time varchar(20),
    departure_time varchar(20),
    stop_id varchar(100),
    stop_sequence int,
    timepoint int
);

-- Limpieza y optimizaciones post-carga se ejecutan tras el COPY.
