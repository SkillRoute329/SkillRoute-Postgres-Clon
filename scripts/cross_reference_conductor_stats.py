"""
cross_reference_conductor_stats.py
Cruza vehicle_events (GPS real IMM) con distribuciones_diarias (quién manejó
qué coche) para producir estadísticas de OTP por conductor.

Colección destino: conductor_stats/{agencyId}_{interno}

Uso:
  python scripts/cross_reference_conductor_stats.py [--dry-run] [--days=7]
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

DRY_RUN   = "--dry-run" in sys.argv
DAYS      = next((int(a.split("=")[1]) for a in sys.argv if a.startswith("--days=")), 14)
AGENCY_ID = "70"
MIN_EVENTOS_DIA = 5  # Minimo de pings GPS para considerar un turno real
LIMIT_POR_DIA   = 20000  # Máximo de eventos por día (1 día UCOT ~ 7000-10000)

def init_firebase():
    try:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, {"projectId": "ucot-gestor-cloud"})
        print("  Auth: Application Default Credentials (gcloud)")
        return firestore.client()
    except Exception as e:
        print(f"ERROR autenticando con Firestore: {e}")
        print("  Ejecutar: gcloud auth application-default login")
        sys.exit(1)

def pct(num, total):
    return round(num / total * 100, 1) if total > 0 else 0

def avg(lst):
    return round(sum(lst) / len(lst), 1) if lst else None

def main():
    print(f"Modo: {'DRY RUN (sin escrituras)' if DRY_RUN else 'PRODUCCION'}")
    print(f"Agencia: {AGENCY_ID} (UCOT) | Periodo: ultimos {DAYS} dias")

    db = init_firebase()

    now   = datetime.now(timezone.utc)
    since = (now - timedelta(days=DAYS)).isoformat()

    # ── 1. Cargar vehicle_events día por día (evita el límite global) ────────
    print(f"\nConsultando vehicle_events desde {since[:10]}...")
    eventos = []
    fechas_iter = []
    cursor = now - timedelta(days=DAYS)
    while cursor.date() <= now.date():
        fechas_iter.append(cursor.strftime("%Y-%m-%d"))
        cursor += timedelta(days=1)

    for fecha_dia in fechas_iter:
        dia_inicio = f"{fecha_dia}T00:00:00.000Z"
        dia_fin    = f"{fecha_dia}T23:59:59.999Z"
        snap = (db.collection("vehicle_events")
                  .where("agencyId", "==", AGENCY_ID)
                  .where("timestampGPS", ">=", dia_inicio)
                  .where("timestampGPS", "<=", dia_fin)
                  .limit(LIMIT_POR_DIA)
                  .get())
        dia_evs = [d.to_dict() for d in snap]
        if dia_evs:
            eventos.extend(dia_evs)
            print(f"  {fecha_dia}: {len(dia_evs)} eventos GPS")

    print(f"  Total eventos GPS: {len(eventos)}")

    if not eventos:
        print("  Sin eventos en el periodo. Verificar que autoStatsCollector esta activo.")
        return

    # ── 2. Agrupar eventos por (fecha, idBus) ────────────────────────────────
    por_fecha_bus = defaultdict(list)
    for ev in eventos:
        fecha = (ev.get("timestampGPS") or "")[:10]
        idBus = str(ev.get("idBus") or "")
        if fecha and idBus:
            por_fecha_bus[(fecha, idBus)].append(ev)

    fechas = sorted({k[0] for k in por_fecha_bus})
    print(f"  Fechas con datos: {fechas}")
    print(f"  Buses unicos: {len({k[1] for k in por_fecha_bus})}")

    # ── 3. Cargar distribuciones para esas fechas ────────────────────────────
    print("\nCruzando con distribuciones_diarias...")
    distrib = {}  # fecha -> {coche_str: reg}

    for fecha in fechas:
        regs_snap = (db.collection("distribuciones_diarias")
                       .document(fecha)
                       .collection("registros")
                       .get())
        distrib[fecha] = {}
        for reg_doc in regs_snap:
            reg = reg_doc.to_dict()
            coche = reg.get("coche")
            if coche:
                distrib[fecha][str(int(coche))] = reg
        print(f"  {fecha}: {len(distrib[fecha])} coches con conductor asignado")

    # ── 4. Construir estadisticas por conductor ───────────────────────────────
    conductores = {}  # key "{AGENCY_ID}_{interno}" -> acumulador

    for (fecha, idBus), evs in por_fecha_bus.items():
        reg = distrib.get(fecha, {}).get(idBus)
        if not reg:
            continue

        interno = reg.get("interno")
        nombre  = reg.get("nombre") or ""
        if not interno:
            continue

        # Metricas del dia para este coche
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

        dia_stats = {
            "fecha":           fecha,
            "coche":           idBus,
            "turno":           reg.get("turno"),
            "servicio":        reg.get("servicio"),
            "totalEventos":    d_total,
            "pctEnTiempo":     pct(d_en_tiempo,  d_con),
            "pctAtrasado":     pct(d_atrasado,   d_con),
            "pctAdelantado":   pct(d_adelantado, d_con),
            "velocidadMedia":  avg(d_vels) or 0,
            "desviacionMediaMin": avg(d_desv),
            "lineas":          sorted(d_lineas),
        }

        key = f"{AGENCY_ID}_{interno}"
        if key not in conductores:
            conductores[key] = {
                "agencyId": AGENCY_ID,
                "interno":  interno,
                "nombre":   nombre,
                "total":    0, "enTiempo": 0, "atrasado": 0, "adelantado": 0,
                "desv": [], "vels": [],
                "coches": set(), "lineas": set(),
                "ultimaActividad": fecha,
                "historial": [],
            }

        acc = conductores[key]
        acc["total"]     += d_total
        acc["enTiempo"]  += d_en_tiempo
        acc["atrasado"]  += d_atrasado
        acc["adelantado"]+= d_adelantado
        acc["desv"].extend(d_desv)
        acc["vels"].extend(d_vels)
        acc["coches"].add(idBus)
        acc["lineas"].update(d_lineas)
        if fecha > acc["ultimaActividad"]:
            acc["ultimaActividad"] = fecha
        acc["historial"].append(dia_stats)

    print(f"\nConductores con datos GPS cruzados: {len(conductores)}")

    if not conductores:
        print("  Sin cruces encontrados. Verificar que las fechas de vehicle_events")
        print("  coinciden con fechas en distribuciones_diarias.")
        return

    if DRY_RUN:
        print("\n--- PREVIEW (primeros 5 conductores) ---")
        for key, acc in list(conductores.items())[:5]:
            con = acc["enTiempo"] + acc["atrasado"] + acc["adelantado"]
            print(f"  {key}: {acc['nombre']}")
            print(f"    OTP={pct(acc['enTiempo'], con)}% | eventos={acc['total']} | dias={len(acc['historial'])}")
            for h in acc["historial"]:
                print(f"    {h['fecha']} coche={h['coche']} otp={h['pctEnTiempo']}% ({h['totalEventos']} eventos)")
        print("\n(Para cargar, correr sin --dry-run)")
        return

    # ── 5. Escribir a conductor_stats ─────────────────────────────────────────
    col     = db.collection("conductor_stats")
    escrito = 0

    for key, acc in conductores.items():
        con = acc["enTiempo"] + acc["atrasado"] + acc["adelantado"]
        doc = {
            "agencyId":           acc["agencyId"],
            "interno":            acc["interno"],
            "nombre":             acc["nombre"],
            "diasActivos":        len(acc["historial"]),
            "totalEventos":       acc["total"],
            "pctEnTiempo":        pct(acc["enTiempo"],  con),
            "pctAtrasado":        pct(acc["atrasado"],  con),
            "pctAdelantado":      pct(acc["adelantado"], con),
            "pctSinHorario":      pct(acc["total"] - con, acc["total"]),
            "velocidadMedia":     avg(acc["vels"]) or 0,
            "desviacionMediaMin": avg(acc["desv"]),
            "cochesOperados":     sorted(acc["coches"]),
            "lineasOperadas":     sorted(acc["lineas"]),
            "ultimaActividad":    acc["ultimaActividad"],
            "historial":          sorted(acc["historial"], key=lambda x: x["fecha"]),
            "updatedAt":          firestore.SERVER_TIMESTAMP,
        }
        col.document(key).set(doc, merge=True)
        print(f"  {key}: {acc['nombre']} -> {len(acc['historial'])} dias, OTP={pct(acc['enTiempo'], con)}%")
        escrito += 1

    print(f"\n=== COMPLETADO ===")
    print(f"Documentos escritos en conductor_stats: {escrito}")

if __name__ == "__main__":
    main()
