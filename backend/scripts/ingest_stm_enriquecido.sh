#!/bin/bash
# ingest_stm_enriquecido.sh — Ingesta ENRIQUECIDA del documento mensual STM.
#
# FASE 5.18 (2026-05-16): además de validaciones, recupera lo que el ingest
# previo descartaba, SIN nueva fuente:
#   - cantidad_pasajeros  → demanda REAL (no solo conteo de validaciones)
#   - sevar_codigo        → demanda por variante/recorrido
#   - id_viaje            → cadena de transbordos = matriz OD real
# Produce: stm_demanda_mensual (agregado) + stm_transbordos_mensual (OD).
# Idempotente por archivo. Uso: ./ingest_stm_enriquecido.sh <zip> [...]
set -euo pipefail

PSQL='/c/Program Files/PostgreSQL/15/bin/psql.exe'
export PGPASSWORD='I0SAv9zhoQDUfTPc7L+KmkAw'
PG=(-U postgres -d skillroute_master -h 127.0.0.1 -v ON_ERROR_STOP=1)

ensure_temp() {
  "$PSQL" "${PG[@]}" -c "
    DROP TABLE IF EXISTS stm_raw_e;
    CREATE UNLOGGED TABLE stm_raw_e (
      id_viaje BIGINT, mes DATE, cod_empresa SMALLINT, dsc_linea VARCHAR(20),
      sevar_codigo VARCHAR(20), codigo_parada VARCHAR(20), hora SMALLINT,
      dow SMALLINT, grupo_usuario VARCHAR(60), tramo_ordinal SMALLINT,
      con_tarjeta BOOLEAN, pasajeros INT
    );" >/dev/null
}

ingest_one() {
  local zip="$1"; local fname; fname=$(basename "$zip")
  local mp; mp=$(echo "$fname" | grep -oE '[0-9]{6}')
  local mes_iso="${mp:2:4}-${mp:0:2}-01"
  echo "[stm-enriq] $fname (mes=$mes_iso)"
  local existe; existe=$("$PSQL" "${PG[@]}" -tAc "SELECT 1 FROM stm_enriquecido_ingestados WHERE archivo='$fname'" || true)
  if [ "$existe" = "1" ]; then echo "  ya ingestado, saltando."; return; fi

  ensure_temp
  local t0; t0=$(date +%s)
  unzip -p "$zip" | awk -F',' -v mes="$mes_iso" '
    BEGIN { OFS="," }
    NR==1 { for (i=1;i<=NF;i++) col[$i]=i; next }
    {
      ce=$col["cod_empresa"]; if (ce=="" || ce ~ /[^0-9]/) next
      fe=$col["fecha_evento"]; if (length(fe) < 13) next
      iv=$col["id_viaje"]; if (iv=="" || iv ~ /[^0-9]/) iv="\\N"
      hora=substr(fe,12,2)+0
      y=substr(fe,1,4)+0; mo=substr(fe,6,2)+0; da=substr(fe,9,2)+0
      if (mo<3){mo+=12;y-=1}
      k=y%100; j=int(y/100)
      h=(da+int((13*(mo+1))/5)+k+int(k/4)+int(j/4)+5*j)%7
      dow=(h+6)%7
      ln=$col["dsc_linea"]; gsub(/[",]/," ",ln)
      sv=$col["sevar_codigo"]; gsub(/[",]/," ",sv)
      par=$col["codigo_parada_origen"]; if (par=="") par="\\N"
      gu=$col["descripcion_grupo_usuario"]; gsub(/[",]/," ",gu)
      tr=$col["ordinal_de_tramo"]; if (tr=="" || tr ~ /[^0-9]/) tr="0"
      ct=$col["con_tarjeta"]; ct=(ct=="1"?"t":"f")
      px=$col["cantidad_pasajeros"]; if (px=="" || px ~ /[^0-9]/) px="1"
      print iv, mes, ce, ln, sv, par, hora, dow, gu, tr, ct, px
    }
  ' | "$PSQL" "${PG[@]}" -c "\\copy stm_raw_e (id_viaje,mes,cod_empresa,dsc_linea,sevar_codigo,codigo_parada,hora,dow,grupo_usuario,tramo_ordinal,con_tarjeta,pasajeros) FROM STDIN WITH (FORMAT csv, NULL '\\N')" >/dev/null

  local raw; raw=$("$PSQL" "${PG[@]}" -tAc "SELECT COUNT(*) FROM stm_raw_e")
  echo "  $raw filas crudas en $(( $(date +%s)-t0 ))s — agregando demanda + OD…"

  # Demanda enriquecida (con PASAJEROS reales + variante).
  "$PSQL" "${PG[@]}" -c "
    SET work_mem='512MB';
    DELETE FROM stm_demanda_mensual WHERE mes='$mes_iso';
    INSERT INTO stm_demanda_mensual
      (mes,cod_empresa,dsc_linea,sevar_codigo,codigo_parada,hora,dow,grupo_usuario,tramo_ordinal,con_tarjeta,validaciones,pasajeros)
    SELECT mes,cod_empresa,dsc_linea,sevar_codigo,codigo_parada,hora,dow,grupo_usuario,tramo_ordinal,con_tarjeta,
           COUNT(*), SUM(pasajeros)
    FROM stm_raw_e
    GROUP BY mes,cod_empresa,dsc_linea,sevar_codigo,codigo_parada,hora,dow,grupo_usuario,tramo_ordinal,con_tarjeta;
  " >/dev/null

  # Transbordos / OD: cadena de líneas dentro del mismo id_viaje (lag por tramo).
  "$PSQL" "${PG[@]}" -c "
    SET work_mem='1GB';
    DELETE FROM stm_transbordos_mensual WHERE mes='$mes_iso';
    INSERT INTO stm_transbordos_mensual
      (mes,cod_empresa_o,linea_origen,cod_empresa_d,linea_destino,hora,transbordos)
    SELECT '$mes_iso'::date, prev_emp, prev_lin, cod_empresa, dsc_linea, hora, COUNT(*)
    FROM (
      SELECT id_viaje, tramo_ordinal, dsc_linea, cod_empresa, hora,
             lag(dsc_linea)   OVER w AS prev_lin,
             lag(cod_empresa) OVER w AS prev_emp
      FROM stm_raw_e
      WHERE id_viaje IS NOT NULL
      WINDOW w AS (PARTITION BY id_viaje ORDER BY tramo_ordinal)
    ) s
    WHERE prev_lin IS NOT NULL AND prev_lin <> dsc_linea
    GROUP BY prev_emp, prev_lin, cod_empresa, dsc_linea, hora;
  " >/dev/null

  local nd nt px
  nd=$("$PSQL" "${PG[@]}" -tAc "SELECT COUNT(*) FROM stm_demanda_mensual WHERE mes='$mes_iso'")
  nt=$("$PSQL" "${PG[@]}" -tAc "SELECT COUNT(*) FROM stm_transbordos_mensual WHERE mes='$mes_iso'")
  px=$("$PSQL" "${PG[@]}" -tAc "SELECT COALESCE(SUM(pasajeros),0) FROM stm_demanda_mensual WHERE mes='$mes_iso'")
  "$PSQL" "${PG[@]}" -c "
    INSERT INTO stm_enriquecido_ingestados (archivo,mes,filas_demanda,filas_transbordos,pasajeros_total)
    VALUES ('$fname','$mes_iso',$nd,$nt,$px)
    ON CONFLICT (archivo) DO UPDATE SET filas_demanda=EXCLUDED.filas_demanda,
      filas_transbordos=EXCLUDED.filas_transbordos, pasajeros_total=EXCLUDED.pasajeros_total, ingested_at=NOW();
  " >/dev/null
  echo "  OK: demanda=$nd · transbordos=$nt · pasajeros=$px · $(( $(date +%s)-t0 ))s"
}

if [ $# -eq 0 ]; then echo "Uso: $0 <zip1> [zip2 ...]"; exit 1; fi
for z in "$@"; do ingest_one "$z"; done
"$PSQL" "${PG[@]}" -c "DROP TABLE IF EXISTS stm_raw_e;" >/dev/null
echo "[stm-enriq] refrescando MV agregada…"
"$PSQL" "${PG[@]}" -c "REFRESH MATERIALIZED VIEW mv_stm_demanda_linea;" >/dev/null && echo "  mv_stm_demanda_linea OK"
echo "[stm-enriq] todo OK"
