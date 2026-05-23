#!/bin/bash
# ingest_velocidad.sh — Ingesta velocidad vehicular IMM (agregado horario).
# FASE 5.18 (2026-05-16). Mismo patrón que ingest_conteo_vehicular.sh.
# CSV mensual ~360 MB, 5-min por detector. Idempotente. Transaccional.
# Uso: ./ingest_velocidad.sh <resource_url> [<url2> ...]  (sin args = mayo 2026)
set -euo pipefail

PSQL='/c/Program Files/PostgreSQL/15/bin/psql.exe'
export PGPASSWORD='I0SAv9zhoQDUfTPc7L+KmkAw'
PG=(-U postgres -d skillroute_master -h 127.0.0.1 -v ON_ERROR_STOP=1)
DEF='https://ckan-data.montevideo.gub.uy/dataset/d1f03efc-cf65-40cb-9426-9f5f63798648/resource/68bf211c-a0a4-4b94-b0a9-d3dac9600d9a/download/velocidad_promedio_mayo_2026.zip'

urls=("$@"); [ ${#urls[@]} -eq 0 ] && urls=("$DEF")

for URL in "${urls[@]}"; do
  TMP="$(mktemp -d)"
  fname="$(basename "$URL")"
  echo "[velocidad] $fname — descargando…"
  curl -s -m300 -L -o "$TMP/v.zip" "$URL"
  BYTES=$(stat -c%s "$TMP/v.zip" 2>/dev/null || echo 0)
  EXISTE=$("$PSQL" "${PG[@]}" -tAc "SELECT 1 FROM velocidad_vehicular_ingestados WHERE archivo='$fname'" 2>/dev/null || true)
  if [ "$EXISTE" = "1" ]; then echo "[velocidad] $fname ya ingestado, saltando."; rm -rf "$TMP"; continue; fi

  MES=$(echo "$fname" | grep -oiE 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre' || echo '')
  YYYY=$(echo "$fname" | grep -oE '20[0-9]{2}' | head -1)
  declare -A M=( [enero]=01 [febrero]=02 [marzo]=03 [abril]=04 [mayo]=05 [junio]=06 [julio]=07 [agosto]=08 [septiembre]=09 [setiembre]=09 [octubre]=10 [noviembre]=11 [diciembre]=12 )
  MES_ISO="${YYYY:-2026}-${M[$MES]:-01}-01"

  "$PSQL" "${PG[@]}" -c "DROP TABLE IF EXISTS vv_raw;
    CREATE UNLOGGED TABLE vv_raw (
      cod_detector text, id_carril text, fecha text, hora text,
      dsc_avenida text, dsc_int_anterior text, dsc_int_siguiente text,
      latitud text, longitud text, velocidad text);"
  unzip -p "$TMP/v.zip" | "$PSQL" "${PG[@]}" -c "\copy vv_raw FROM STDIN WITH (FORMAT csv, HEADER true)"
  "$PSQL" "${PG[@]}" <<SQL
BEGIN;
SET work_mem='256MB';
DELETE FROM velocidad_vehicular vv USING velocidad_vehicular_ingestados i WHERE i.archivo='$fname';
INSERT INTO velocidad_vehicular
 (cod_detector,id_carril,fecha,hora,dsc_avenida,dsc_int_anterior,dsc_int_siguiente,
  latitud,longitud,velocidad_prom,velocidad_min,muestras)
SELECT cod_detector::int, NULLIF(id_carril,'')::smallint, fecha::date,
       split_part(hora,':',1)::smallint,
       dsc_avenida, dsc_int_anterior, dsc_int_siguiente,
       NULLIF(latitud,'')::float8, NULLIF(longitud,'')::float8,
       round(avg(NULLIF(velocidad,'')::numeric),1),
       round(min(NULLIF(velocidad,'')::numeric),1), count(*)
FROM vv_raw
WHERE cod_detector ~ '^[0-9]+\$' AND fecha ~ '^[0-9]{4}-'
GROUP BY 1,2,3,4,5,6,7,8,9;
DROP TABLE vv_raw;
INSERT INTO velocidad_vehicular_ingestados (archivo,mes,filas,bytes_zip)
VALUES ('$fname','$MES_ISO',
        (SELECT count(*) FROM velocidad_vehicular WHERE fecha >= '$MES_ISO'::date
           AND fecha < ('$MES_ISO'::date + interval '1 month')), $BYTES)
ON CONFLICT (archivo) DO UPDATE SET filas=EXCLUDED.filas, ingested_at=NOW();
COMMIT;
SQL
  "$PSQL" "${PG[@]}" -c "SELECT '$fname' archivo, count(*) filas_horarias, round(avg(velocidad_prom),1) vel_media FROM velocidad_vehicular WHERE fecha >= '$MES_ISO'::date AND fecha < ('$MES_ISO'::date + interval '1 month');"
  rm -rf "$TMP"
  echo "[velocidad] OK — $fname (mes $MES_ISO)."
done
