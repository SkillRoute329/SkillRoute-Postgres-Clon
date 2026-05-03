"""
load_distribuciones_firestore.py
Carga distribuciones_raw.json a Firestore en la colección distribuciones_diarias.

Estructura en Firestore:
  distribuciones_diarias/{fecha}  → documento resumen del día
  distribuciones_diarias/{fecha}/registros/{id}  → subcolección con cada fila

Uso:
  python scripts/load_distribuciones_firestore.py [--dry-run]
"""
import json, sys, os
from pathlib import Path
from collections import defaultdict

# Intentar importar firebase_admin
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("ERROR: firebase_admin no está instalado.")
    print("  pip install firebase-admin")
    sys.exit(1)

RAW_FILE    = Path("C:/Users/jonat/Desktop/PROYECTOS/GestionUcot/data/ucot_distribuciones/distribuciones_raw.json")
CREDS_FILE  = Path("C:/Users/jonat/Desktop/PROYECTOS/GestionUcot/backend_legacy/serviceAccountKey.json")
DRY_RUN     = "--dry-run" in sys.argv

def init_firebase():
    # Usar Application Default Credentials (gcloud auth application-default login)
    try:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, {"projectId": "ucot-gestor-cloud"})
        print("  Auth: Application Default Credentials (gcloud)")
        return firestore.client()
    except Exception as e:
        print(f"ERROR: No se pudo autenticar con Firestore: {e}")
        print("  Ejecutar: gcloud auth application-default login")
        sys.exit(1)

def main():
    print(f"Modo: {'DRY RUN (sin escrituras)' if DRY_RUN else 'PRODUCCIÓN'}")

    if not RAW_FILE.exists():
        print(f"ERROR: {RAW_FILE} no existe. Corrér merge_distribuciones.py primero.")
        sys.exit(1)

    with open(RAW_FILE, "r", encoding="utf-8") as f:
        registros = json.load(f)

    print(f"Registros a cargar: {len(registros)}")

    # Agrupar por fecha
    por_fecha = defaultdict(list)
    sin_fecha = []
    for r in registros:
        fecha = r.get("fecha")
        if fecha:
            por_fecha[fecha].append(r)
        else:
            sin_fecha.append(r)

    print(f"Fechas únicas: {len(por_fecha)}")
    print(f"Registros sin fecha: {len(sin_fecha)}")

    if DRY_RUN:
        print("\n--- PREVIEW (primeras 3 fechas) ---")
        for fecha in sorted(por_fecha.keys())[:3]:
            regs = por_fecha[fecha]
            tipo_A = [r for r in regs if r.get("_tipo_doc") == "A"]
            tipo_B = [r for r in regs if r.get("_tipo_doc") == "B"]
            print(f"  {fecha}: {len(tipo_A)} personal + {len(tipo_B)} coche-servicio")
        print("\n(Para cargar real, correr sin --dry-run)")
        return

    db = init_firebase()
    col = db.collection("distribuciones_diarias")

    loaded = 0
    errors = 0

    for fecha in sorted(por_fecha.keys()):
        regs = por_fecha[fecha]
        tipo_A = [r for r in regs if r.get("_tipo_doc") == "A"]
        tipo_B = [r for r in regs if r.get("_tipo_doc") == "B"]

        # Documento raíz del día
        doc_ref = col.document(fecha)
        doc_ref.set({
            "fecha": fecha,
            "totalRegistros": len(regs),
            "conductoresActivos": len([r for r in tipo_A if r.get("rol") in ("conductor", "guarda") and r.get("coche")]),
            "guardiasActivos": len([r for r in tipo_A if r.get("rol") == "guardia"]),
            "ausentes": len([r for r in tipo_A if r.get("rol") == "ausente"]),
            "cochesServicio": len(tipo_B),
            "fuentes": list(set(r["_fuente"] for r in regs)),
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)

        # Subcolección de registros individuales (tipo A únicamente — los con nombre/interno)
        batch = db.batch()
        count_in_batch = 0
        for reg in tipo_A:
            if reg.get("interno") or reg.get("nombre"):
                doc_id = f"{reg.get('interno', 'x')}-{reg.get('coche', 'x')}-{reg.get('servicio', 'x')}"
                ref = doc_ref.collection("registros").document(doc_id)
                batch.set(ref, reg, merge=True)
                count_in_batch += 1
                if count_in_batch >= 499:
                    batch.commit()
                    loaded += count_in_batch
                    batch = db.batch()
                    count_in_batch = 0

        if count_in_batch > 0:
            batch.commit()
            loaded += count_in_batch

        print(f"  {fecha}: {len(tipo_A)} personal + {len(tipo_B)} coche-servicio -> OK")

    print(f"\n=== CARGA COMPLETADA ===")
    print(f"Registros cargados: {loaded}")
    print(f"Errores: {errors}")
    print(f"Colección: distribuciones_diarias ({len(por_fecha)} documentos raíz)")

if __name__ == "__main__":
    main()
