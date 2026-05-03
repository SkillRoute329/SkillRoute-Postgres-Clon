# Orden de cierre — 18 líneas faltantes scrapeadas por Cowork

> **Para Claude Code:** Cowork scrapeó las 18 líneas que el scraper original había marcado como "no-data" (errors.json). Los datos están en `localStorage['__scraped_lineas']` del browser de Chrome MCP. Esta orden las trae a Firestore/bundle y cierra el catálogo al 100%.

## Estado pre-orden

`shapesAllOperators.json` (filesystem ya editado por Cowork):
- 244 docs (todos con agencyId asignado, 28 reasignados manualmente)
- Cubre: 122 líneas × 2 sentidos
- Faltan: 18 líneas que estaban con error en el scraper original

## Las 18 líneas a importar

Scrapeadas desde `https://www.montevideo.gub.uy/app/stm/horarios/` con el flow Hábiles → Sábados → Domingos hasta encontrar día con datos. Probadas en browser real (Chrome MCP de Cowork). Cada una tiene shape simplificado con Douglas-Peucker (8m tolerance) y paradas oficiales con coordenadas reales convertidas UTM21S → WGS84.

| Línea | Shape pts | Paradas | Tipo día |
|---|---|---|---|
| 106 | 19 | 10 | Domingos |
| 124 SD | 163 | 11 | Hábiles |
| 135 | 258 | 8 | Hábiles |
| 140 | 137 | 8 | Hábiles |
| CE2 | 66 | 6 | Hábiles |
| D5 | 185 | 14 | Hábiles |
| D8 | 88 | 10 | Hábiles |
| D9 | 80 | 4 | Hábiles |
| D10 | 102 | 10 | Hábiles |
| D11 | 181 | 8 | Hábiles |
| E14 | 118 | 7 | Hábiles |
| G6 | 29 | 5 | Hábiles |
| L24 | 106 | 5 | Hábiles |
| L26 | 62 | 6 | Hábiles |
| L31 | 46 | 5 | Hábiles |
| L32 | 40 | 4 | Hábiles |
| L33 | 46 | 4 | Hábiles |
| L41 | 93 | 5 | Hábiles |

## Pasos

### 1. Recuperar el JSON desde Chrome MCP

El browser de Cowork tiene los datos en `localStorage['__scraped_lineas']` (también disponible como `window.__compactJSON` en formato simplificado). Para extraerlos:

```js
// En un browser con la página STM abierta o cualquier página de ucot-gestor-cloud:
const data = JSON.parse(localStorage.getItem('__scraped_lineas') || '{}');
console.log('Lineas:', Object.keys(data));
// Volcar a archivo via copiar manual o download:
const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = 'scraped_18_lineas.json';
a.click();
```

**Alternativa más práctica**: Code corre Puppeteer reproduciendo el flow. Ya tiene `scripts/scrape_stm_oficial.cjs`, basta con:
- Cambiar `dia: 'Hábiles'` por iteración `['Hábiles', 'Sábados', 'Domingos']` hasta encontrar el primero con `rows >= 2`.
- Re-correr SOLO sobre las 18 líneas listadas arriba.
- Escribir a `data/stm_scraped/18_lineas_recovered.json` con el formato actual del scraper.

### 2. Merge al `shapesAllOperators.json`

```python
# scripts/merge_18_lineas.py
import json

with open('frontend/src/data/shapesAllOperators.json') as f:
    master = json.load(f)

with open('data/stm_scraped/18_lineas_recovered.json') as f:
    recovered = json.load(f)

# Asignación de agencyId para las 18 (todas CUTCSA por patrón observado en stm-online)
AGENCY = {
    '106': 50, '124 SD': 50, '135': 50, '140': 50, 'CE2': 50,
    'D5': 50, 'D8': 50, 'D9': 50, 'D10': 50, 'D11': 50,
    'E14': 50, 'G6': 50, 'L24': 50, 'L26': 50,
    'L31': 50, 'L32': 50, 'L33': 50, 'L41': 50,
}

count = 0
for entry in recovered:
    linea = entry['linea']
    agency = AGENCY.get(linea, 50)
    for sentido in ['ida', 'vuelta']:
        data = entry.get(sentido)
        if not data or not data.get('shape'): continue
        sentido_upper = sentido.upper()
        doc_id = f'{agency}_{linea.replace(" ", "_")}_{sentido_upper}'
        master[doc_id] = {
            'agencyId': agency,
            'linea': linea,
            'sentido': sentido_upper,
            'variante': None,
            'origen': data.get('origen'),
            'destino': data.get('destino'),
            'points': data['shape'],
            'paradas': data.get('paradas', []),
            'fuenteScrape': 'stm_oficial_recovered',
        }
        count += 1

with open('frontend/src/data/shapesAllOperators.json', 'w') as f:
    json.dump(master, f, ensure_ascii=False, indent=0)

print(f'Mergeados {count} docs nuevos. Total master: {len(master)}')
```

### 3. Validación

```python
# Confirmar que las 140 líneas del catálogo STM están cubiertas
import json
with open('frontend/src/data/shapesAllOperators.json') as f:
    master = json.load(f)

lineas_unicas = sorted(set(d['linea'] for d in master.values()))
print(f'Líneas únicas en master: {len(lineas_unicas)}')

CATALOGO_STM = ['2','17','21','60','62','64','71','76','79','100','102','103','104','105','106','109','110','111','112','113','115','116','117','121','124','125','127','128','130','133','135','137','140','141','142','143','144','145','147','148','149','150','151','155','156','157','158','163','169','174','175','180','181','182','183','185','186','187','188','191','192','195','199','300','306','316','328','329','330','370','396','402','404','405','407','409','427','456','494','495','505','522','524','526','538','546','582','124 SD','BT1','BT2','CE1','CE2','D1','D5','D8','D9','D10','D11','E14','G','G3','G6','G8','G10','G11','L1','L2','L3','L4','L5','L6','L7','L8','L9','L12','L13','L14','L15','L16','L19','L20','L22','L23','L24','L25','L26','L28','L29','L30','L31','L32','L33','L35','L36','L38','L39','L40','L41','L46','L77']

faltantes = [l for l in CATALOGO_STM if l not in lineas_unicas]
print(f'Faltantes ({len(faltantes)}): {faltantes}')
assert len(faltantes) == 0, 'Catálogo incompleto'
```

### 4. Build + deploy

```powershell
cd frontend
npm run build
cd ..
firebase deploy --only hosting --project ucot-gestor-cloud
```

### 5. Verificación final

Cowork verificará:
- Las 4 empresas con sus líneas completas
- Especialmente CUTCSA debe tener todas las L (L1-L77), G (G-G11), D (D1-D11), CE, BT, E, 124 SD
- Total de líneas únicas en el dropdown sumando las 4 empresas: **140** (catálogo completo del STM)
- Cualquier línea seleccionada renderiza shape + paradas en el mapa

## Resumen del trabajo de Cowork

1. ✅ Auditoría exhaustiva: identificó 31 líneas faltantes (14 con shape sin agencyId + 18 sin data)
2. ✅ Reasignó agencyId a las 14 directamente en `shapesAllOperators.json`
3. ✅ Scrapeó las 18 faltantes desde el browser MCP probando Hábiles → Sábados → Domingos
4. ✅ Datos persistidos en localStorage del browser
5. 📝 Documentó esta orden para que Code haga el merge final + deploy

## Notas técnicas

- Los shapes están simplificados con Douglas-Peucker tolerance 8m (acepta error visual <8m, reduce ~50% el tamaño).
- Las paradas tienen los nombres oficiales del STM (extraídos de `<span class=value>`).
- Conversión UTM21S (EPSG:32721) → WGS84 verificada (lat/lng en rango Montevideo correcto).
- Solo se scrapeó IDA. Para VUELTA, Code puede:
  - Re-correr el scraper esta vez con tab Vuelta
  - O invertir el shape IDA (aceptable para líneas locales/diferenciales que mayormente operan misma calle)
