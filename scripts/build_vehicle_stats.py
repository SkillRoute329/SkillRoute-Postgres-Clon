"""
build_vehicle_stats.py
Construye estadísticas diarias por coche desde vehicle_events (GPS real IMM)
para las 4 empresas del sistema metropolitano.

Para UCOT (70): enriquece con conductor (interno, nombre, turno) cuando
hay distribuciones_diarias disponibles. Para el resto: datos de coche solo.

Colección destino: vehicle_stats/{agencyId}_{idBus}
  Ej: vehicle_stats/10_4521, vehicle_stats/70_1234

Uso:
  python scripts/build_vehicle_stats.py [--dry-run] [--days=14] [--agency=ALL|10|20|50|70]
"""
import sys
from datetime import datetime, timedelta, timezone
from collections import defaultdict

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("ERROR: firebase_admin no esta instalado. pip install firebase-admin")
    sys.exit(1)

DRY_RUN     = "--dry-run" in sys.argv
DAYS        = next((int(a.split("=")[1]) for a in sys.argv if a.startswith("--days=")), 14)
AGENCY_ARG  = next((a.split("=")[1] for a in sys.argv if a.startswith("--agency=")), "ALL")
AGENCIES    = ["10", "20", "50", "70"] if AGENCY_ARG == "ALL" else [AGENCY_ARG]
AGENCY_NAMES = {"10": "COETC", "20": "COME", "50": "CUTCSA", "70": "UCOT"}
MIN_EVENTOS_DIA = 3   # Mínimo de pings GPS para registrar un turno
# CUTCSA tiene ~1000+ buses activos; límite alto para no perder buses
LIMITE_DIA = {"10": 20000, "20": 15000, "50": 60000, "70": 25000}

def init_firebase():
    try:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, {"projectId": "ucot-gestor-cloud"})
        print("  Auth: Application Default Credentials (gcloud)")
        return firestore.client()
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

def pct(num, total):
    return round(num / total * 100, 1) if total > 0 else 0

def avg(lst):
    return round(sum(lst) / len(lst), 1) if lst else None

def cargar_eventos_por_dia(db, agency_id, fecha_dia):
    """Carga todos los vehicle_events de una empresa para un día dado."""
    dia_inicio = f"{fecha_dia}T00:00:00.000Z"
    dia_fin    = f"{fecha_dia}T23:59:59.999Z"
    limite     = LIMITE_DIA.get(agency_id, 25000)
    snap = (db.collection("vehicle_events")
              .where("agencyId", "==", agency_id)
              .where("timestampGPS", ">=", dia_inicio)
              .where("timestampGPS", "<=", dia_fin)
              .limit(limite)
              .get())
    return [d.to_dict() for d in snap]

def cargar_distribuciones(db, fecha):
    """Carga distribuciones del día (solo UCOT tiene esto).
    Un coche puede tener 1, 2 o 3 conductores (turnos distintos).
    Retorna dict {idBus: [reg1, reg2, ...]} — lista, nunca sobreescribe.
    """
    regs_snap = (db.collection("distribuciones_diarias")
                   .document(fecha)
                   .collection("registros")
                   .get())
    por_coche = defaultdict(list)
    for reg_doc in regs_snap:
        reg = reg_doc.to_dict()
        coche = reg.get("coche")
        if coche:
            por_coche[str(int(coche))].append(reg)
    return por_coche

def main():
    print(f"Modo: {'DRY RUN (sin escrituras)' if DRY_RUN else 'PRODUCCION'}")
    print(f"Empresas: {', '.join(AGENCIES)} | Periodo: ultimos {DAYS} dias")

    db = init_firebase()
    now = datetime.now(timezone.utc)

    # Fechas a procesar
    fechas = []
    cursor = now - timedelta(days=DAYS)
    while cursor.date() <= now.date():
        fechas.append(cursor.strftime("%Y-%m-%d"))
        cursor += timedelta(days=1)

    # Acumulador global: {(agencyId, idBus): datos}
    vehicle_data = {}

    for agency_id in AGENCIES:
        empresa = AGENCY_NAMES.get(agency_id, agency_id)
        print(f"\n=== {empresa} (agencyId={agency_id}) ===")

        for fecha in fechas:
            eventos_dia = cargar_eventos_por_dia(db, agency_id, fecha)
            if not eventos_dia:
                continue
            print(f"  {fecha}: {len(eventos_dia)} eventos GPS")

            # Distribuciones del día (solo UCOT)
            distrib = {}
            if agency_id == "70":
                distrib = cargar_distribuciones(db, fecha)

            # Agrupar por idBus
            por_bus = defaultdict(list)
            for ev in eventos_dia:
                idBus = str(ev.get("idBus") or "")
                if idBus:
                    por_bus[idBus].append(ev)

            for idBus, evs in por_bus.items():
                # Calcular métricas del día
                d_total = d_en_tiempo = d_atrasado = d_adelantado = 0
                d_desv, d_vels, d_lineas = [], [], set()

                for ev in evs:
                    d_total += 1
                    estado = ev.get("estadoCumplimiento", "")
                    if   estado == "EN_TIEMPO":    d_en_tiempo  += 1
                    elif estado == "ATRASADO":     d_atrasado   += 1
                    elif estado == "ADELANTADO":   d_adelantado += 1
                    if isinstance(ev.get("desviacionMin"), (int, float)):
                        d_desv.append(ev["desviacionMin"])
                    if isinstance(ev.get("velocidad"), (int, float)) and ev["velocidad"] > 0:
                        d_vels.append(ev["velocidad"])
                    if ev.get("linea"):
                        d_lineas.add(str(ev["linea"]))

                if d_total < MIN_EVENTOS_DIA:
                    continue

                d_con = d_en_tiempo + d_atrasado + d_adelantado

                # Enriquecimiento con conductores (UCOT): 1, 2 o 3 por coche
                regs = distrib.get(idBus, []) if agency_id == "70" else []
                conductores_dia = [
                    {
                        "interno":  r.get("interno"),
                        "nombre":   r.get("nombre"),
                        "turno":    r.get("turno"),
                        "servicio": r.get("servicio"),
                    }
                    for r in regs if r.get("interno")
                ]
                jornales_dia = len(conductores_dia)

                dia_stats = {
                    "fecha":           fecha,
                    "totalEventos":    d_total,
                    "pctEnTiempo":     pct(d_en_tiempo,  d_con),
                    "pctAtrasado":     pct(d_atrasado,   d_con),
                    "pctAdelantado":   pct(d_adelantado, d_con),
                    "velocidadMedia":  avg(d_vels) or 0,
                    "desviacionMediaMin": avg(d_desv),
                    "lineas":          sorted(d_lineas),
                    # Múltiples conductores por día
                    "conductoresDia": conductores_dia,
                    "jornalesDia":    jornales_dia,
                    # Backward compat: primer conductor
                    "interno":  conductores_dia[0]["interno"]  if conductores_dia else None,
                    "nombre":   conductores_dia[0]["nombre"]   if conductores_dia else None,
                    "turno":    conductores_dia[0]["turno"]    if conductores_dia else None,
                    "servicio": conductores_dia[0]["servicio"] if conductores_dia else None,
                }

                key = f"{agency_id}_{idBus}"
                if key not in vehicle_data:
                    vehicle_data[key] = {
                        "agencyId": agency_id,
                        "empresa":  empresa,
                        "idBus":    idBus,
                        "total":    0, "enTiempo": 0, "atrasado": 0, "adelantado": 0,
                        "desv": [], "vels": [],
                        "lineas": set(),
                        "ultimaActividad": fecha,
                        "conductoresKnown": set(),
                        "totalJornales": 0,
                        "historial": [],
                    }

                acc = vehicle_data[key]
                acc["total"]         += d_total
                acc["enTiempo"]      += d_en_tiempo
                acc["atrasado"]      += d_atrasado
                acc["adelantado"]    += d_adelantado
                acc["totalJornales"] += jornales_dia
                acc["desv"].extend(d_desv)
                acc["vels"].extend(d_vels)
                acc["lineas"].update(d_lineas)
                if fecha > acc["ultimaActividad"]:
                    acc["ultimaActividad"] = fecha
                for c in conductores_dia:
                    if c["interno"]:
                        acc["conductoresKnown"].add(c["interno"])
                        acc["ultimoInterno"] = c["interno"]
                        acc["ultimoNombre"]  = c["nombre"]
                acc["historial"].append(dia_stats)

    total_buses = len(vehicle_data)
    print(f"\nBuses con datos GPS: {total_buses}")

    if DRY_RUN:
        print("\n--- PREVIEW (primeros 5 buses) ---")
        for key, acc in list(vehicle_data.items())[:5]:
            con = acc["enTiempo"] + acc["atrasado"] + acc["adelantado"]
            conductor = acc.get("ultimoNombre") or "sin conductor asignado"
            print(f"  {key}: {acc['empresa']} | OTP={pct(acc['enTiempo'], con)}% | "
                  f"eventos={acc['total']} | lineas={sorted(acc['lineas'])} | {conductor}")
        print("\n(Para cargar, correr sin --dry-run)")
        return

    # Escribir a vehicle_stats
    col     = db.collection("vehicle_stats")
    escrito = 0

    for key, acc in vehicle_data.items():
        con = acc["enTiempo"] + acc["atrasado"] + acc["adelantado"]
        historial_ordenado = sorted(acc["historial"], key=lambda x: x["fecha"])

        # Último conductor conocido (más reciente)
        ultimo_interno = acc.get("ultimoInterno")
        ultimo_nombre  = acc.get("ultimoNombre")
        for h in reversed(historial_ordenado):
            if h.get("interno"):
                ultimo_interno = h["interno"]
                ultimo_nombre  = h["nombre"]
                break

        doc = {
            "agencyId":           acc["agencyId"],
            "empresa":            acc["empresa"],
            "idBus":              acc["idBus"],
            "diasActivos":        len(acc["historial"]),
            "totalEventos":       acc["total"],
            "totalJornales":      acc["totalJornales"],
            "pctEnTiempo":        pct(acc["enTiempo"],  con),
            "pctAtrasado":        pct(acc["atrasado"],  con),
            "pctAdelantado":      pct(acc["adelantado"], con),
            "pctSinHorario":      pct(acc["total"] - con, acc["total"]),
            "velocidadMedia":     avg(acc["vels"]) or 0,
            "desviacionMediaMin": avg(acc["desv"]),
            "lineasOperadas":     sorted(acc["lineas"]),
            "ultimaActividad":    acc["ultimaActividad"],
            "ultimoInterno":      ultimo_interno,
            "ultimoNombre":       ultimo_nombre,
            "conductoresConocidos": sorted(acc["conductoresKnown"]),
            "historial":          historial_ordenado,
            "updatedAt":          firestore.SERVER_TIMESTAMP,
        }
        col.document(key).set(doc, merge=True)
        escrito += 1

    print(f"\n=== COMPLETADO ===")
    print(f"Documentos escritos en vehicle_stats: {escrito}")
    by_agency = defaultdict(int)
    for key in vehicle_data:
        by_agency[key.split("_")[0]] += 1
    for ag, n in sorted(by_agency.items()):
        print(f"  {AGENCY_NAMES.get(ag, ag)}: {n} buses")

if __name__ == "__main__":
    main()
