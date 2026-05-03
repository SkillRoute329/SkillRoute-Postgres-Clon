"""
seed_config_salarial.py
Carga la configuración salarial inicial en Firestore.

Colección: config_salarial
  Documento: turnos_vigentes  — valores de jornal por categoría (editables desde UI)
  Documento: descuentos       — reglas de descuento inyectables (editables desde UI)

Vigencia: 01/01/2026 (valores confirmados por UCOT)

Uso:
  python scripts/seed_config_salarial.py [--dry-run]
"""
import sys
from datetime import datetime, timezone

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("ERROR: firebase_admin no instalado. pip install firebase-admin")
    sys.exit(1)

DRY_RUN = "--dry-run" in sys.argv

# ─── Valores de turno vigentes desde 1/1/2026 ────────────────────────────────
# Fuente: foto proporcionada por UCOT
# jornal = valor nominal del turno completo
# recargo = adicional (nocturno, feriado o turno partido según convenio)
TURNOS_VIGENTES = {
    "vigenciaDesde": "2026-01-01",
    "moneda": "UYU",
    "nota": "Valores nominales sin descuentos. Editables desde RRHH > Configuración Salarial.",
    "categorias": {
        "micrero": {
            "label":    "Micrero",
            "jornal":   3550,
            "recargo":  900,
            "descripcion": "Conductor cobrador. Categoría micro.",
        },
        "maniobra": {
            "label":    "Maniobra",
            "jornal":   2800,
            "recargo":  0,
            "descripcion": "Maniobrista.",
        },
        "conductor": {
            "label":    "Conductor",
            "jornal":   2700,
            "recargo":  700,
            "descripcion": "Conductor sin cobro.",
        },
        "guarda": {
            "label":    "Guarda",
            "jornal":   2500,
            "recargo":  650,
            "descripcion": "Guardia / cobrador.",
        },
    },
}

# ─── Reglas de descuento inyectables ─────────────────────────────────────────
# Cada ítem tiene: id, nombre, tipo, valor/franjas, activo, descripcion
# tipos: "porcentaje" | "monto_fijo" | "progresivo"
# Para tipo "progresivo": franjas = [{limiteSuperior: X, tasa: Y}, ...]
#   La última franja no tiene limiteSuperior (aplica al resto)
#
# Nota: los % de BPS/IRPF son aproximaciones Uruguay 2026.
# Editables en producción desde la UI de RRHH.
DESCUENTOS = {
    "vigenciaDesde": "2026-01-01",
    "nota": "Reglas inyectables. Editar desde RRHH > Configuración Salarial > Descuentos.",
    "items": [
        {
            "id":          "bps_empleado",
            "nombre":      "BPS (empleado)",
            "tipo":        "porcentaje",
            "valor":       15.0,
            "activo":      True,
            "orden":       1,
            "descripcion": "Aporte personal a Banco de Previsión Social. Se aplica sobre el jornal bruto.",
        },
        {
            "id":          "frl",
            "nombre":      "FRL",
            "tipo":        "porcentaje",
            "valor":       0.25,
            "activo":      True,
            "orden":       2,
            "descripcion": "Fondo de Reconversión Laboral. Aporte sobre jornal bruto.",
        },
        {
            "id":          "irpf",
            "nombre":      "IRPF",
            "tipo":        "progresivo",
            "activo":      True,
            "orden":       3,
            "descripcion": "Impuesto a la Renta de las Personas Físicas. Tasas progresivas sobre ingreso mensual.",
            # Franjas IRPF aproximadas 2026 (en UYU/mes, 1 BPC ≈ 1800 UYU)
            # Ajustar desde UI cuando se actualicen los BPC
            "franjas": [
                {"limiteSuperior": 45000,  "tasa": 0.0,  "descripcion": "Hasta 25 BPC: exonerado"},
                {"limiteSuperior": 90000,  "tasa": 10.0, "descripcion": "25-50 BPC: 10%"},
                {"limiteSuperior": 126000, "tasa": 15.0, "descripcion": "50-70 BPC: 15%"},
                {"limiteSuperior": 216000, "tasa": 20.0, "descripcion": "70-120 BPC: 20%"},
                {"limiteSuperior": 360000, "tasa": 22.0, "descripcion": "120-200 BPC: 22%"},
                {                          "tasa": 25.0, "descripcion": "Más de 200 BPC: 25%"},
            ],
        },
        {
            "id":          "sindicato",
            "nombre":      "Sindicato",
            "tipo":        "porcentaje",
            "valor":       2.0,
            "activo":      False,
            "orden":       4,
            "descripcion": "Cuota sindical. Activar y ajustar según convenio colectivo vigente.",
        },
        {
            "id":          "anticipos",
            "nombre":      "Anticipos",
            "tipo":        "monto_fijo",
            "valor":       0,
            "activo":      False,
            "orden":       5,
            "descripcion": "Descuento de anticipos otorgados. Ingresar monto en UYU.",
        },
    ],
}

def init_firebase():
    try:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, {"projectId": "ucot-gestor-cloud"})
        print("  Auth: Application Default Credentials (gcloud)")
        return firestore.client()
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

def main():
    print(f"Modo: {'DRY RUN' if DRY_RUN else 'PRODUCCION'}")
    print(f"Seeding config_salarial en Firestore...")

    if DRY_RUN:
        print("\n--- PREVIEW ---")
        print("Turnos vigentes desde:", TURNOS_VIGENTES["vigenciaDesde"])
        for cat, vals in TURNOS_VIGENTES["categorias"].items():
            print(f"  {vals['label']}: jornal=${vals['jornal']} + recargo=${vals['recargo']}")
        print(f"\nDescuentos: {len(DESCUENTOS['items'])} reglas")
        for d in DESCUENTOS["items"]:
            estado = "ACTIVO" if d["activo"] else "inactivo"
            print(f"  [{estado}] {d['nombre']} ({d['tipo']})")
        print("\n(Para cargar, correr sin --dry-run)")
        return

    db = init_firebase()
    col = db.collection("config_salarial")

    # Turnos vigentes
    col.document("turnos_vigentes").set({
        **TURNOS_VIGENTES,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })
    print("-> Escrito: config_salarial/turnos_vigentes")

    # Descuentos
    col.document("descuentos").set({
        **DESCUENTOS,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })
    print("-> Escrito: config_salarial/descuentos")

    print("\n=== COMPLETADO ===")
    print("Editar desde: RRHH > Configuración Salarial (en la UI de SkillRoute)")

if __name__ == "__main__":
    main()
