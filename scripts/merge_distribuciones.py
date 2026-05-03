"""
merge_distribuciones.py
Fusiona los archivos batch_A.json ... batch_G.json en distribuciones_raw.json
Genera estadísticas del dataset y lo deja listo para cargar a Firestore.
"""
import json, os, glob
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path("C:/Users/jonat/Desktop/PROYECTOS/GestionUcot/data/ucot_distribuciones")
OUT_FILE  = DATA_DIR / "distribuciones_raw.json"
STATS_FILE = DATA_DIR / "merge_stats.json"

def main():
    # Recopilar todos los batch files
    batch_files = sorted(glob.glob(str(DATA_DIR / "batch_*.json")))
    print(f"Archivos batch encontrados: {len(batch_files)}")
    for f in batch_files:
        size = os.path.getsize(f)
        print(f"  {os.path.basename(f)}: {size:,} bytes")

    if not batch_files:
        print("ERROR: No se encontraron archivos batch_*.json")
        return

    # Cargar y consolidar todos los resultados
    all_results = []
    for bf in batch_files:
        with open(bf, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"  {os.path.basename(bf)}: {len(data)} imágenes")
        all_results.extend(data)

    print(f"\nTotal de imágenes procesadas: {len(all_results)}")

    # Deduplicar por nombre de archivo (en caso de que haya solapamiento entre batches)
    seen_archivos = set()
    unique_results = []
    duplicados = 0
    for r in all_results:
        nombre = r.get("_archivo", "")
        if nombre in seen_archivos:
            duplicados += 1
            continue
        seen_archivos.add(nombre)
        unique_results.append(r)

    print(f"Imágenes únicas: {len(unique_results)} ({duplicados} duplicadas eliminadas)")

    # Calcular estadísticas
    stats = {
        "total_imagenes": len(unique_results),
        "por_tipo": defaultdict(int),
        "por_fecha": defaultdict(int),
        "errores": 0,
        "tipo_A_registros": 0,
        "tipo_B_registros": 0,
    }

    all_records = []  # Registros planos para Firestore

    for r in unique_results:
        if not r.get("_ok"):
            stats["errores"] += 1
            continue

        tipo = r.get("tipo", "?")
        stats["por_tipo"][tipo] += 1
        fecha = r.get("fecha")

        if tipo == "A":
            # Distribución de personal: registros de conductores/guardas
            regs = r.get("registros", [])
            stats["tipo_A_registros"] += len(regs)
            if fecha and regs:
                stats["por_fecha"][fecha] = stats["por_fecha"].get(fecha, 0) + len(regs)

            for reg in regs:
                if reg.get("interno") or reg.get("nombre"):  # Filtrar registros vacíos
                    all_records.append({
                        "fecha": fecha,
                        "interno": reg.get("interno"),
                        "nombre": reg.get("nombre"),
                        "coche": reg.get("coche"),
                        "turno": reg.get("turno"),
                        "servicio": reg.get("servicio"),
                        "rol": reg.get("rol", "conductor"),
                        "observaciones": reg.get("observaciones", ""),
                        "_tipo_doc": "A",
                        "_fuente": r["_archivo"]
                    })

            # Ausentes — acepta [{internos:[123], estado:"..."}] o [123, 456] directamente
            for aus in r.get("ausentes", []):
                if isinstance(aus, int):
                    internos_list = [aus]
                    estado = ""
                elif isinstance(aus, dict):
                    internos_list = aus.get("internos") or []
                    estado = aus.get("estado", "")
                else:
                    continue
                for interno in internos_list:
                    all_records.append({
                        "fecha": fecha,
                        "interno": interno,
                        "nombre": None,
                        "coche": None,
                        "turno": None,
                        "servicio": None,
                        "rol": "ausente",
                        "observaciones": estado,
                        "_tipo_doc": "A",
                        "_fuente": r["_archivo"]
                    })

        elif tipo == "B":
            # Informe de tránsito: pares coche-servicio
            regs = r.get("registros", [])
            stats["tipo_B_registros"] += len(regs)
            for reg in regs:
                if reg.get("coche") and reg.get("servicio"):  # Solo pares con datos útiles
                    all_records.append({
                        "fecha": fecha,
                        "interno": None,
                        "nombre": None,
                        "coche": reg.get("coche"),
                        "turno": None,
                        "servicio": reg.get("servicio"),
                        "rol": None,
                        "observaciones": reg.get("observaciones", ""),
                        "_tipo_doc": "B",
                        "_fuente": r["_archivo"]
                    })

    # Guardar archivo final
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_records, f, ensure_ascii=False, indent=2)

    # Guardar estadísticas
    stats_out = {
        "total_imagenes": stats["total_imagenes"],
        "errores": stats["errores"],
        "por_tipo": dict(stats["por_tipo"]),
        "tipo_A_registros_brutos": stats["tipo_A_registros"],
        "tipo_B_pares_coche_servicio": stats["tipo_B_registros"],
        "total_registros_finales": len(all_records),
        "por_fecha": dict(sorted(stats["por_fecha"].items())),
    }
    with open(STATS_FILE, "w", encoding="utf-8") as f:
        json.dump(stats_out, f, ensure_ascii=False, indent=2)

    # Imprimir resumen
    print("\n=== RESUMEN FINAL ===")
    print(f"Total registros en distribuciones_raw.json: {len(all_records)}")
    print(f"Por tipo de imagen:")
    for t, n in sorted(stats["por_tipo"].items()):
        print(f"  Tipo {t}: {n} imágenes")
    print(f"Errores de OCR: {stats['errores']}")
    print(f"\nRegistros TIPO A (conductores/guardas) por fecha:")
    for fecha, n in sorted(stats["por_fecha"].items()):
        print(f"  {fecha}: {n} registros")
    print(f"\nGuardado en: {OUT_FILE}")
    print(f"Estadísticas en: {STATS_FILE}")

if __name__ == "__main__":
    main()
