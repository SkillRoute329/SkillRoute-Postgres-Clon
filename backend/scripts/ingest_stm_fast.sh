#!/bin/bash
# ingest_stm_fast.sh — Ingesta turbo de validaciones STM al clon Postgres.
#
# FASE 5.15 v3 (2026-05-14): Node parseando 25M filas vía JS demora 15+ min.
# Con awk + psql \copy bajamos a <2 min/mes. Pipeline:
#   unzip -p <zip>  →  awk (parse y normaliza fecha/hora/dow)  →
#   psql \copy stm_raw_temp FROM STDIN  →
#   psql INSERT...SELECT GROUP BY  →  stm_validaciones_mensual
#
# Uso:  ./ingest_stm_fast.sh <archivo.zip> [<archivo2.zip> ...]
set -euo pipefail

PSQL='/c/Program Files/PostgreSQL/15/bin/psql.exe'
export PGPASSWORD='I0SAv9zhoQDUfTPc7L+KmkAw'
PG_OPTS=(-U postgres -d skillroute_master -h 127.0.0.1)

ensure_temp() {
  "$PSQL" "${PG_OPTS[@]}" -c "
    DROP TABLE IF EXISTS stm_raw_temp;
    CREATE UNLOGGED TABLE stm_raw_temp (
      mes DATE, cod_empresa SMALLINT, dsc_linea VARCHAR(20),
      codigo_parada VARCHAR(20), hora SMALLINT, dow SMALLINT,
      grupo_usuario VARCHAR(60), tramo_ordinal SMALLINT, con_tarjeta BOOLEAN,
      pasajeros INTEGER
    );
    SET work_mem = '256MB';
  " >/dev/null
}

ingest_one() {
  local zip="$1"
  local fname; fname=$(basename "$zip")
  local mes_part; mes_part=$(echo "$fname" | grep -oE '[0-9]{6}')
  local mm="${mes_part:0:2}" yyyy="${mes_part:2:4}"
  local mes_iso="${yyyy}-${mm}-01"

  echo "[fast-ingest] $fname (mes=$mes_iso)"

  # Idempotente. FORCE_REINGEST=1 reprocesa aunque ya esté (la corrección de
  # métrica COUNT→SUM(cantidad_pasajeros) exige re-ingerir lo ya cargado).
  local existe; existe=$("$PSQL" "${PG_OPTS[@]}" -tAc "SELECT 1 FROM stm_validaciones_ingestados WHERE archivo='$fname'")
  if [ "$existe" = "1" ] && [ "${FORCE_REINGEST:-0}" != "1" ]; then
    echo "  ya ingestado, saltando (FORCE_REINGEST=1 para reprocesar)."; return
  fi

  ensure_temp
  local t0=$(date +%s)

  # awk extrae las columnas relevantes y produce CSV listo para COPY:
  #   mes, cod_empresa, dsc_linea, codigo_parada, hora, dow, grupo, tramo, con_tarjeta
  # Calcula dow desde la fecha YYYY-MM-DD via función de Zeller.
  unzip -p "$zip" | awk -F',' -v mes="$mes_iso" '
    BEGIN { OFS="," }
    NR==1 { for (i=1; i<=NF; i++) { col[$i]=i } next }
    {
      ce=$col["cod_empresa"]; if (ce=="" || ce ~ /[^0-9]/) next
      fe=$col["fecha_evento"]; if (length(fe) < 13) next
      hora=substr(fe, 12, 2)+0
      y=substr(fe, 1, 4)+0; mo=substr(fe, 6, 2)+0; da=substr(fe, 9, 2)+0
      # Zellers congruence para dow (Sun=0..Sat=6)
      if (mo < 3) { mo+=12; y-=1 }
      k=y%100; j=int(y/100)
      h=(da + int((13*(mo+1))/5) + k + int(k/4) + int(j/4) + 5*j) % 7
      dow=(h+6)%7  # h=0 Sat → dow=6; ajustamos a Sun=0
      ln=$col["dsc_linea"]; gsub(/[",]/, " ", ln)
      par=$col["codigo_parada_origen"]
      gu=$col["descripcion_grupo_usuario"]; gsub(/[",]/, " ", gu)
      tr=$col["ordinal_de_tramo"]; if (tr=="" || tr ~ /[^0-9]/) tr="0"
      ct=$col["con_tarjeta"]; ct=(ct=="1" ? "t" : "f")
      # cantidad_pasajeros = personas que realizan el tramo (def. oficial).
      # La métrica real de demanda es SUM(cantidad_pasajeros), NO COUNT(*).
      # Si viene vacío/no numérico/0, un tramo representa al menos 1 persona.
      pj=$col["cantidad_pasajeros"]; if (pj=="" || pj ~ /[^0-9]/ || pj+0 < 1) pj=1
      if (par=="") par="\\N"
      print mes, ce, ln, par, hora, dow, gu, tr, ct, pj
    }
  ' | "$PSQL" "${PG_OPTS[@]}" -c "\\copy stm_raw_temp (mes, cod_empresa, dsc_linea, codigo_parada, hora, dow, grupo_usuario, tramo_ordinal, con_tarjeta, pasajeros) FROM STDIN WITH (FORMAT csv, NULL '\\N')" >/dev/null

  local t1=$(date +%s)
  local cuentaRaw; cuentaRaw=$("$PSQL" "${PG_OPTS[@]}" -tAc "SELECT COUNT(*) FROM stm_raw_temp")
  echo "  $cuentaRaw filas cargadas en $((t1-t0))s — agregando..."

  "$PSQL" "${PG_OPTS[@]}" -c "
    DELETE FROM stm_validaciones_mensual WHERE mes='$mes_iso';
    INSERT INTO stm_validaciones_mensual
      (mes, cod_empresa, dsc_linea, codigo_parada, hora, dow, grupo_usuario, tramo_ordinal, con_tarjeta, validaciones)
    SELECT mes, cod_empresa, dsc_linea, codigo_parada, hora, dow, grupo_usuario, tramo_ordinal, con_tarjeta, SUM(pasajeros)
    FROM stm_raw_temp
    GROUP BY mes, cod_empresa, dsc_linea, codigo_parada, hora, dow, grupo_usuario, tramo_ordinal, con_tarjeta;
  " >/dev/null

  local t2=$(date +%s)
  local cuentaAg; cuentaAg=$("$PSQL" "${PG_OPTS[@]}" -tAc "SELECT COUNT(*) FROM stm_validaciones_mensual WHERE mes='$mes_iso'")
  local bytes; bytes=$(stat -c '%s' "$zip" 2>/dev/null || stat -f '%z' "$zip")
  local dur=$((($(date +%s)-t0)*1000))

  "$PSQL" "${PG_OPTS[@]}" -c "
    INSERT INTO stm_validaciones_ingestados (archivo, mes, filas_origen, filas_agregadas, bytes_zip, duracion_ms)
    VALUES ('$fname', '$mes_iso', $cuentaRaw, $cuentaAg, $bytes, $dur)
    ON CONFLICT (archivo) DO UPDATE SET filas_origen=EXCLUDED.filas_origen, filas_agregadas=EXCLUDED.filas_agregadas, duracion_ms=EXCLUDED.duracion_ms, ingested_at=NOW();
  " >/dev/null

  echo "  OK: $cuentaRaw filas → $cuentaAg agregadas en $((t2-t0))s total"
}

if [ $# -eq 0 ]; then echo "Uso: $0 <zip1> [zip2 ...]"; exit 1; fi
for z in "$@"; do ingest_one "$z"; done

# Limpieza
"$PSQL" "${PG_OPTS[@]}" -c "DROP TABLE IF EXISTS stm_raw_temp;" >/dev/null

# FASE 5.15: refrescar materialized views agregadas (el dashboard las usa
# para responder en <300ms en vez de escanear 33M filas crudas).
echo "[fast-ingest] refrescando materialized views..."
"$PSQL" "${PG_OPTS[@]}" -c "
  REFRESH MATERIALIZED VIEW mv_stm_linea_resumen;
  REFRESH MATERIALIZED VIEW mv_stm_operador_mes;
" >/dev/null && echo "  MVs refrescadas OK"

# FASE 5.24: tras cada ingesta, reconstruir+verificar el AGREGADO que sirve
# el informe (mv_stm_linea_mes/_hora) contra el crudo oficial y sellar
# (estrategia proceso→documento). Así el endpoint nunca toca el crudo.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# SKIP_DOC_REFRESH=1 difiere el refresh+verify (re-ingesta masiva: se corre
# UNA vez al final, no tras cada mes — el verify es un FULL JOIN pesado).
if [ "${SKIP_DOC_REFRESH:-0}" != "1" ] && [ -f "$SELF_DIR/refresh_verify_stm_doc.sh" ]; then
  echo "[fast-ingest] refresh+verify del documento STM..."
  bash "$SELF_DIR/refresh_verify_stm_doc.sh" 2>&1 | tail -3 || \
    echo "  [warn] refresh_verify falló (revisar); el informe seguirá con el sello previo"
fi

echo "[fast-ingest] todo OK"
