#!/bin/bash
# ingest_conteo_vehicular.sh — Ingesta conteo vehicular IMM (agregado horario).
#
# FASE 5.17 (2026-05-16). CSV mensual ~360 MB, muestras 5-min. Pipeline:
#   curl zip → unzip -p → \copy a UNLOGGED temp → INSERT...SELECT GROUP BY
#   (fecha, hora, detector, carril) → conteo_vehicular. Idempotente por
#   nombre de archivo. Transaccional.
#
# Uso: ./ingest_conteo_vehicular.sh <resource_url> [<url2> ...]
#   URLs en el research (mar/abr/may 2026). Sin args usa mayo 2026.
set -euo pipefail

PSQL='/c/Program Files/PostgreSQL/15/bin/psql.exe'
export PGPASSWORD='I0SAv9zhoQDUfTPc7L+KmkAw'
PG=(-U postgres -d skillroute_master -h 127.0.0.1 -v ON_ERROR_STOP=1)
DEF='https://ckan-data.montevideo.gub.uy/dataset/a2b2243b-358f-4f03-b7bc-0a32c25ed10c/resource/557d51ee-a67f-477e-8450-d908bc0e87d8/download/conteo_mayo_2026.zip'

urls=("$@"); [ ${#urls[@]} -eq 0 ] && urls=("$DEF")

for URL in "${urls[@]}"; do
  TMP="$(mktemp -d)"
  fname="$(basename "$URL")"
  echo "[conteo] $fname — descargando…"
  curl -s -m300 -L -o "$TMP/c.zip" "$URL"
  BYTES=$(stat -c%s "$TMP/c.zip" 2>/dev/null || echo 0)
  EXISTE=$("$PSQL" "${PG[@]}" -tAc "SELECT 1 FROM conteo_vehicular_ingestados WHERE archivo='$fname'" 2>/dev/null || true)
  if [ "$EXISTE" = "1" ]; then echo "[conteo] $fname ya ingestado, saltando."; rm -rf "$TMP"; continue; fi

  CSV="$(unzip -Z1 "$TMP/c.zip" | head -1)"
  MES=$(echo "$fname" | grep -oiE 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre' || echo '')
  YYYY=$(echo "$fname" | grep -oE '20[0-9]{2}' | head -1)
  declare -A M=( [enero]=01 [febrero]=02 [marzo]=03 [abril]=04 [mayo]=05 [junio]=06 [julio]=07 [agosto]=08 [septiembre]=09 [setiembre]=09 [octubre]=10 [noviembre]=11 [diciembre]=12 )
  MES_ISO="${YYYY:-2026}-${M[$MES]:-01}-01"

  # cv_raw debe persistir entre conexiones psql separadas → tabla normal
  # (no temp, no dentro de tx sin commit). Se dropea al final.
  "$PSQL" "${PG[@]}" -c "DROP TABLE IF EXISTS cv_raw;
    CREATE UNLOGGED TABLE cv_raw (
      cod_detector text, id_carril text, fecha text, hora text,
      dsc_avenida text, dsc_int_anterior text, dsc_int_siguiente text,
      latitud text, longitud text, volumen_hora text);"
  unzip -p "$TMP/c.zip" | "$PSQL" "${PG[@]}" -c "\copy cv_raw FROM STDIN WITH (FORMAT csv, HEADER true)"
  "$PSQL" "${PG[@]}" <<SQL
BEGIN;
SET work_mem='256MB';
DELETE FROM conteo_vehicular cv USING conteo_vehicular_ingestados i
  WHERE i.archivo='$fname';  -- no-op si nunca se cargó
INSERT INTO conteo_vehicular
 (cod_detector,id_carril,fecha,hora,dsc_avenida,dsc_int_anterior,
  dsc_int_siguiente,latitud,longitud,volumen_hora_prom,volumen_hora_max,muestras)
SELECT cod_detector::int, NULLIF(id_carril,'')::smallint, fecha::date,
       split_part(hora,':',1)::smallint,
       dsc_avenida, dsc_int_anterior, dsc_int_siguiente,
       NULLIF(latitud,'')::float8, NULLIF(longitud,'')::float8,
       round(avg(NULLIF(volumen_hora,'')::numeric),1),
       max(NULLIF(volumen_hora,'')::int), count(*)
FROM cv_raw
WHERE cod_detector ~ '^[0-9]+\$' AND fecha ~ '^[0-9]{4}-'
GROUP BY 1,2,3,4,5,6,7,8,9;
DROP TABLE cv_raw;
INSERT INTO conteo_vehicular_ingestados (archivo,mes,filas,bytes_zip)
VALUES ('$fname','$MES_ISO',
        (SELECT count(*) FROM conteo_vehicular WHERE fecha >= '$MES_ISO'::date
           AND fecha < ('$MES_ISO'::date + interval '1 month')), $BYTES)
ON CONFLICT (archivo) DO UPDATE SET filas=EXCLUDED.filas, ingested_at=NOW();
COMMIT;
SQL
  "$PSQL" "${PG[@]}" -c "SELECT '$fname' archivo, count(*) filas_horarias FROM conteo_vehicular WHERE fecha >= '$MES_ISO'::date AND fecha < ('$MES_ISO'::date + interval '1 month');"
  rm -rf "$TMP"
  echo "[conteo] OK — $fname (mes $MES_ISO)."
done
