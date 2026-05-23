#!/bin/bash
# ingest_horarios_control.sh — Ingesta horarios STM por punto de control.
#
# FASE 5.17 (2026-05-16). Fuente diaria, sin auth:
#   https://datos-abiertos.montevideo.gub.uy/HORARIOS_OMNIBUS%20datos.zip
# CSV latin-1, delimitado por ';'. Reemplaza la tabla entera en cada
# snapshot (la fuente publica el dataset completo cada día). Transaccional:
# si falla, ROLLBACK y la tabla previa queda intacta.
set -euo pipefail

PSQL='/c/Program Files/PostgreSQL/15/bin/psql.exe'
export PGPASSWORD='I0SAv9zhoQDUfTPc7L+KmkAw'
PG=(-U postgres -d skillroute_master -h 127.0.0.1 -v ON_ERROR_STOP=1)
URL='https://datos-abiertos.montevideo.gub.uy/HORARIOS_OMNIBUS%20datos.zip'
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[horarios-control] descargando…"
curl -s -m120 -L -o "$TMP/h.zip" "$URL"
cd "$TMP" && unzip -o h.zip >/dev/null
CSV="$(ls *.csv | head -1)"
[ -n "$CSV" ] || { echo "no CSV en el zip"; exit 1; }
SNAP=$(date -r "$CSV" +%F 2>/dev/null || date +%F)
BYTES=$(stat -c%s h.zip 2>/dev/null || echo 0)

# Idempotente por fecha de snapshot.
EXISTE=$("$PSQL" "${PG[@]}" -tAc "SELECT 1 FROM stm_horarios_control_ingestados WHERE snapshot_fecha='$SNAP'" 2>/dev/null || true)
if [ "$EXISTE" = "1" ]; then echo "[horarios-control] snapshot $SNAP ya ingestado, saltando."; exit 0; fi

# Carga transaccional: temp text → transform → tabla final.
WINTMP="$(cygpath -w "$TMP/$CSV" 2>/dev/null || echo "$TMP/$CSV")"
"$PSQL" "${PG[@]}" <<SQL
BEGIN;
DROP TABLE IF EXISTS sthc_raw;
CREATE UNLOGGED TABLE sthc_raw (
  cod_linea text, linea text, cod_sublinea text, sublinea text,
  variante text, codigo_minuta text, nro_frecuencia text,
  codigo_punto text, hora text, fecha_desde text);
\copy sthc_raw FROM '$WINTMP' WITH (FORMAT csv, DELIMITER ';', HEADER true, ENCODING 'LATIN1')
TRUNCATE stm_horarios_control RESTART IDENTITY;
INSERT INTO stm_horarios_control
  (cod_linea, linea, cod_sublinea, sublinea, variante, codigo_minuta,
   tipo_dia, nro_frecuencia, codigo_punto, hora, fecha_desde)
SELECT cod_linea, linea, cod_sublinea, sublinea, variante,
       NULLIF(codigo_minuta,'')::smallint,
       CASE WHEN codigo_minuta IN ('1','2') THEN 'habil'
            WHEN codigo_minuta IN ('3','4') THEN 'sabado'
            WHEN codigo_minuta IN ('5','6') THEN 'festivo' END,
       NULLIF(nro_frecuencia,'')::int,
       codigo_punto,
       -- Hora viene como HMMSS/HHMMSS sin separador (ej. 94400 = 09:44:00).
       to_timestamp(lpad(hora,6,'0'),'HH24MISS')::time,
       NULLIF(fecha_desde,'')::date
FROM sthc_raw
WHERE cod_linea ~ '^[0-9]' AND hora ~ '^[0-9]+\$';
DROP TABLE sthc_raw;
INSERT INTO stm_horarios_control_ingestados (snapshot_fecha, filas, bytes_zip)
VALUES ('$SNAP', (SELECT count(*) FROM stm_horarios_control), $BYTES);
COMMIT;
SQL

"$PSQL" "${PG[@]}" -c "SELECT tipo_dia, count(*) FROM stm_horarios_control GROUP BY tipo_dia ORDER BY 1;"
echo "[horarios-control] OK — snapshot $SNAP."
