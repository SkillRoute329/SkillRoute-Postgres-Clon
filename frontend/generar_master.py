"""
Genera ucot_master_intelligence_2026.json completo
Ejecutar desde: C:\Users\jonat\Desktop\PROYECTOS\TransformaFacil-2.0\frontend
Comando: python generar_master.py
"""
import json, os, sys

def excel_time(v):
    try:
        f = float(v)
        if f <= 0 or f >= 2: return None
        t = round(f * 24 * 3600)
        return f"{t//3600:02d}:{(t%3600)//60:02d}"
    except:
        return None

try:
    import xlrd
except ImportError:
    print("Instalando xlrd...")
    os.system("pip install xlrd")
    import xlrd

# Rutas de archivos
BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
CARTONES_FILE = os.path.join(ROOT, "CARTONES_Hábil_verano_2026_desde_26_12_2025.xls")
MATRIZ_FILE   = os.path.join(ROOT, "matriz_de_servcio.xls")
OUTPUT_FILE   = os.path.join(BASE, "src", "data", "ucot_master_intelligence_2026.json")

print(f"Leyendo cartones: {CARTONES_FILE}")
print(f"Leyendo matriz:   {MATRIZ_FILE}")

# ── PARSEAR CARTONES ──────────────────────────────────────────────────────────
wb_cartones = xlrd.open_workbook(CARTONES_FILE)
cartones = {}

for sheet_name in wb_cartones.sheet_names():
    sh = wb_cartones.sheet_by_name(sheet_name)
    if sh.nrows < 3:
        continue

    row1 = sh.row_values(1)
    row2 = sh.row_values(2)

    # Extraer linea
    linea = ''
    for v in row1:
        sv = str(v).strip()
        if sv:
            try:
                candidate = str(int(float(sv)))
                if 2 <= len(candidate) <= 4:
                    linea = candidate
                    break
            except:
                pass

    # Paradas
    paradas = []
    for i, v in enumerate(row2):
        nombre = str(v).strip()
        if nombre and nombre not in ['', ' ', 'None']:
            paradas.append({'col': i, 'nombre': nombre})

    # Instrucción especial
    instruccion = ''
    if sh.nrows > 3:
        for v in sh.row_values(3):
            sv = str(v).strip()
            if len(sv) > 10 and '0.' not in sv[:3]:
                instruccion = sv
                break

    # Filas de horarios
    filas_horarios = []
    for row_idx in range(3, sh.nrows):
        row = sh.row_values(row_idx)
        tiempos_fila = []
        tiene_tiempos = False

        for p in paradas:
            col = p['col']
            v = row[col] if col < len(row) else ''
            if 'ESPERA' in p['nombre'].upper():
                try:
                    ev = float(v)
                    tiempos_fila.append(str(int(ev)) if ev > 2 else '--')
                except:
                    tiempos_fila.append('--')
                continue
            t = excel_time(v)
            if t:
                tiene_tiempos = True
                tiempos_fila.append(t)
            else:
                sv = str(v).strip()
                tiempos_fila.append(sv if sv and sv not in ['', '0.0'] else '--:--')

        if tiene_tiempos:
            filas_horarios.append(tiempos_fila)

    headers = [{'id': f'stop-{i}', 'location': p['nombre']} for i, p in enumerate(paradas)]
    raw_matrix = [{'checkpoints': fila} for fila in filas_horarios]

    cartones[sheet_name] = {
        'id': sheet_name,
        'servicioId': sheet_name,
        'serviceNumber': sheet_name,
        'linea': linea,
        'temporada': 'VERANO',
        'tipo_dia': 'HABIL',
        'instruccionesEspeciales': instruccion,
        'headers': headers,
        'rawMatrix': raw_matrix,
        'paradas': [p['nombre'] for p in paradas],
        'horarios': [{'filas': f} for f in filas_horarios]
    }

print(f"Cartones procesados: {len(cartones)}")

# ── PARSEAR MATRIZ ────────────────────────────────────────────────────────────
wb_matriz = xlrd.open_workbook(MATRIZ_FILE)
lineas = {}
servicios_matriz = []
sids_vistos = set()

for sheet_name in wb_matriz.sheet_names():
    sh = wb_matriz.sheet_by_name(sheet_name)
    row1 = sh.row_values(1)
    paradas = [str(v).strip() for v in row1 if str(v).strip()]
    paradas = paradas[1:]

    linea_id = sheet_name[:-1] if sheet_name[-1] in 'ab' else sheet_name
    variante  = sheet_name[-1]  if sheet_name[-1] in 'ab' else ''

    if linea_id not in lineas:
        lineas[linea_id] = {'id': linea_id, 'nombre': f'Línea {linea_id}', 'activa': True}

    for row_idx in range(2, sh.nrows):
        row = sh.row_values(row_idx)
        if not row[0]: continue
        try:
            sid = str(int(float(row[0])))
        except:
            sid = str(row[0]).strip()
        if not sid: continue

        key = f"{linea_id}-{sid}"
        if key in sids_vistos: continue
        sids_vistos.add(key)

        filas = [excel_time(row[i+1]) or '--:--' for i in range(len(paradas)) if i+1 < len(row)]

        # Si existe cartón completo, usarlo; si no, usar datos de matriz
        if sid in cartones:
            s = cartones[sid].copy()
            s['lineaId'] = sheet_name
            s['variante'] = variante
            s['puntosControl'] = paradas
        else:
            s = {
                'servicioId': sid,
                'lineaId': sheet_name,
                'linea': linea_id,
                'variante': variante,
                'serviceNumber': sid,
                'puntosControl': paradas,
                'headers': [{'id': f'stop-{i}', 'location': p} for i, p in enumerate(paradas)],
                'rawMatrix': [{'checkpoints': filas}],
                'horarios': [{'filas': filas}],
                'temporada': 'VERANO',
                'tipo_dia': 'HABIL'
            }
        servicios_matriz.append(s)

# Agregar cartones que no estén en la matriz
sids_en_matriz = {s['servicioId'] for s in servicios_matriz}
for sid, c in cartones.items():
    if sid not in sids_en_matriz:
        s = c.copy()
        s['lineaId'] = f"{c['linea']}a"
        s['variante'] = 'a'
        s['puntosControl'] = c['paradas']
        servicios_matriz.append(s)
        if c['linea'] and c['linea'] not in lineas:
            lineas[c['linea']] = {'id': c['linea'], 'nombre': f"Línea {c['linea']}", 'activa': True}

# ── CONSTRUIR MASTER ──────────────────────────────────────────────────────────
todos_puntos = set()
for s in servicios_matriz:
    for p in s.get('puntosControl', []):
        todos_puntos.add(p)

master = {
    'version': '2026-verano',
    'source': 'CARTONES + Matriz Hábil Verano 2026 UCOT',
    'temporada': 'VERANO',
    'generado': '2026-03-08',
    'lineas': sorted(lineas.values(), key=lambda x: x['id']),
    'puntosControl': sorted(todos_puntos),
    'servicios': servicios_matriz
}

with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(master, f, ensure_ascii=False, indent=2)

size = os.path.getsize(OUTPUT_FILE)
print(f"\n✅ JSON generado exitosamente!")
print(f"   Archivo: {OUTPUT_FILE}")
print(f"   Tamaño:  {size/1024:.1f} KB")
print(f"   Líneas:  {len(master['lineas'])}")
print(f"   Servicios: {len(master['servicios'])}")
print(f"\nAhora ejecutá: npm run build")
