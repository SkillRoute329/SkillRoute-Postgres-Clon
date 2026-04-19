/**
 * Descarga TODOS los recorridos de líneas UCOT desde el GeoServer de la IMM.
 * Fuente: montevideo.gub.uy/app/geoserver/wfs
 * Capa: mapstore-tematicas:vyt_v_uptu_lsv
 * 
 * Uso: node scripts/download_all_ucot_routes.js
 * Salida: frontend/src/data/routesGeoData.ts (reemplaza el archivo completo)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const proj4 = require('proj4');

// ────── Definición de proyección UTM Zone 21S (EPSG:31981) ──────
// El GeoServer de Montevideo devuelve coordenadas en este CRS (metros).
// Necesitamos convertirlas a WGS84 (EPSG:4326, grados lat/lng) para Leaflet.
proj4.defs('EPSG:31981', '+proj=utm +zone=21 +south +datum=WGS84 +units=m +no_defs');
const utmToWgs84 = proj4('EPSG:31981', 'EPSG:4326');

// Líneas UCOT confirmadas
const UCOT_LINES = ['17', '71', '79', '300', '306', '316', '328', '329', '330', '370', '396'];
// Líneas con sufijo alfanumérico
const UCOT_LINES_ALPHA = ['11A', '221', '8SR'];
const ALL_UCOT = [...UCOT_LINES, ...UCOT_LINES_ALPHA];

const WFS_BASE = 'https://montevideo.gub.uy/app/geoserver/wfs';
const LAYER = 'mapstore-tematicas:vyt_v_uptu_lsv';
const OUTPUT_FILE = path.join(__dirname, '..', 'frontend', 'src', 'data', 'routesGeoData.ts');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'TransformaFacil-UCOT/1.0' },
      timeout: 30000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}\nBody: ${body.substring(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Convierte coordenadas UTM (EPSG:31981) a WGS84 (lat/lng).
 * Si las coordenadas ya parecen ser WGS84 (valores absolutos < 180), no se convierten.
 */
function convertCoord(easting, northing) {
  // Detectar si ya son WGS84 (valores de lat/lng en grados)
  if (Math.abs(easting) < 180 && Math.abs(northing) < 90) {
    return { lng: easting, lat: northing };
  }
  // Conversión UTM → WGS84
  const [lng, lat] = utmToWgs84.forward([easting, northing]);
  return { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
}

async function downloadAllRoutes() {
  console.log('📡 Descargando TODOS los recorridos de líneas UCOT...');
  console.log(`   Fuente: ${WFS_BASE}`);
  console.log(`   Capa: ${LAYER}`);
  console.log(`   Conversión: EPSG:31981 (UTM 21S) → EPSG:4326 (WGS84)`);
  console.log(`   Líneas: ${ALL_UCOT.join(', ')}\n`);

  // Descargar todas las features de la capa
  const url = `${WFS_BASE}?service=WFS&version=1.1.0&request=GetFeature&typeName=${LAYER}&outputFormat=application/json&maxFeatures=5000`;
  
  console.log('⏳ Descargando desde WFS (puede tardar ~30s)...');
  const data = await fetchJSON(url);
  console.log(`✅ Descargados ${data.features?.length || 0} features totales`);
  
  // Detectar CRS
  const crs = data.crs?.properties?.name || 'desconocido';
  console.log(`   CRS origen: ${crs}\n`);

  if (!data.features || data.features.length === 0) {
    console.error('❌ No se encontraron features. Verificar disponibilidad del servicio.');
    process.exit(1);
  }

  // Filtrar solo las líneas UCOT
  const ucotFeatures = data.features.filter(f => {
    const descLinea = String(f.properties.desc_linea || '').trim();
    return ALL_UCOT.includes(descLinea);
  });

  console.log(`🔍 Líneas UCOT encontradas: ${ucotFeatures.length} variantes\n`);

  // Agrupar por línea
  const routesByLine = {};
  
  for (const feature of ucotFeatures) {
    const props = feature.properties;
    const lineNumber = String(props.desc_linea).trim();
    const sublinea = String(props.desc_sublinea || '').trim();
    const codVariante = props.cod_variante;
    const descVariante = String(props.desc_variante || '').trim();
    
    if (!feature.geometry || !feature.geometry.coordinates || feature.geometry.coordinates.length < 2) {
      console.log(`  ⚠ Variante ${codVariante} de línea ${lineNumber} sin geometría — saltando`);
      continue;
    }

    // Convertir coordenadas UTM (EPSG:31981) → WGS84 (EPSG:4326)
    const coordinates = feature.geometry.coordinates.map(coord => {
      return convertCoord(coord[0], coord[1]);
    });

    // Extraer origen y destino del desc_sublinea (formato: "ORIGEN - DESTINO")
    let origen = '', destino = '';
    if (sublinea.includes(' - ')) {
      const parts = sublinea.split(' - ').map(s => s.trim());
      if (descVariante === 'A' || descVariante === '1') {
        origen = parts[0];
        destino = parts[parts.length - 1];
      } else {
        origen = parts[parts.length - 1];
        destino = parts[0];
      }
    } else {
      origen = sublinea;
      destino = sublinea;
    }

    if (!routesByLine[lineNumber]) {
      routesByLine[lineNumber] = {};
    }

    routesByLine[lineNumber][String(codVariante)] = {
      codVariante,
      descSublinea: sublinea,
      descVariante,
      origen,
      destino,
      totalPuntos: coordinates.length,
      coordinates,
    };

    console.log(`  ✓ Línea ${lineNumber} variante ${codVariante} (${descVariante}): ${sublinea} — ${coordinates.length} puntos GPS`);
  }

  // Reportar líneas no encontradas
  const foundLines = Object.keys(routesByLine);
  const missingLines = ALL_UCOT.filter(l => !foundLines.includes(l));
  if (missingLines.length > 0) {
    console.log(`\n⚠ Líneas NO encontradas en GeoServer: ${missingLines.join(', ')}`);
    console.log('  (Estas líneas pueden no estar registradas con ese código en el sistema STM)');
  }

  // Generar el archivo TypeScript
  console.log('\n📝 Generando archivo TypeScript...');
  
  let ts = `/**
 * Recorridos REALES de líneas UCOT — datos GPS oficiales.
 * Fuente: GeoServer Intendencia de Montevideo (mapstore-tematicas:vyt_v_uptu_lsv)
 * Fecha de extracción: ${new Date().toISOString().split('T')[0]}
 * NUNCA modificar manualmente — regenerar con: node scripts/download_all_ucot_routes.js
 */

export interface RouteGeoData {
  codVariante: number;
  descSublinea: string;
  descVariante: string;
  origen: string;
  destino: string;
  totalPuntos: number;
  coordinates: Array<{ lat: number; lng: number }>;
}

/** Todas las rutas UCOT indexadas por número de línea y código de variante. */
export const ALL_UCOT_ROUTES: Record<string, Record<string, RouteGeoData>> = {\n`;

  for (const [lineNumber, variants] of Object.entries(routesByLine).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    ts += `  '${lineNumber}': {\n`;
    for (const [codVar, routeData] of Object.entries(variants)) {
      ts += `    '${codVar}': {\n`;
      ts += `      codVariante: ${routeData.codVariante},\n`;
      ts += `      descSublinea: '${routeData.descSublinea.replace(/'/g, "\\'")}',\n`;
      ts += `      descVariante: '${routeData.descVariante}',\n`;
      ts += `      origen: '${routeData.origen.replace(/'/g, "\\'")}',\n`;
      ts += `      destino: '${routeData.destino.replace(/'/g, "\\'")}',\n`;
      ts += `      totalPuntos: ${routeData.totalPuntos},\n`;
      ts += `      coordinates: [\n`;
      for (const coord of routeData.coordinates) {
        ts += `        { lat: ${coord.lat}, lng: ${coord.lng} },\n`;
      }
      ts += `      ],\n`;
      ts += `    },\n`;
    }
    ts += `  },\n`;
  }

  ts += `};\n\n`;

  // Generar mapeo de variantes por línea (para los selectors)
  ts += `/**
 * Mapeo de códigos de variante UCOT a códigos GeoServer, por línea.
 * Formato: LINEA_VARIANT_MAP[lineNumber][ucotCode] = geoServerCodVariante
 * 'Xa' = IDA principal, 'Xb' = VUELTA principal
 */
export const LINEA_VARIANT_MAP: Record<string, Record<string, string>> = {\n`;

  for (const [lineNumber, variants] of Object.entries(routesByLine).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    const varEntries = Object.entries(variants);
    ts += `  '${lineNumber}': {\n`;
    
    // Asignar IDA y VUELTA basado en desc_variante
    const varA = varEntries.find(([, v]) => v.descVariante === 'A' || v.descVariante === '1');
    const varB = varEntries.find(([, v]) => v.descVariante === 'B' || v.descVariante === '2');
    
    if (varA) {
      ts += `    '${lineNumber}a': '${varA[0]}',  // IDA: ${varA[1].descSublinea}\n`;
      ts += `    '${lineNumber}': '${varA[0]}',    // Default = IDA\n`;
    } else if (varEntries.length > 0) {
      ts += `    '${lineNumber}a': '${varEntries[0][0]}',  // IDA\n`;
      ts += `    '${lineNumber}': '${varEntries[0][0]}',    // Default\n`;
    }
    if (varB) {
      ts += `    '${lineNumber}b': '${varB[0]}',  // VUELTA: ${varB[1].descSublinea}\n`;
    } else if (varEntries.length > 1) {
      ts += `    '${lineNumber}b': '${varEntries[1][0]}',  // VUELTA\n`;
    }
    
    ts += `  },\n`;
  }

  ts += `};\n\n`;

  // Mantener compatibilidad con la API existente (LINEA_17_ROUTES)
  ts += `/** Compatibilidad: alias para Línea 17 */
export const LINEA_17_ROUTES = ALL_UCOT_ROUTES['17'] || {};

/**
 * Obtiene las coordenadas reales del recorrido de una línea por código.
 * @param lineaCode - Código de línea + variante (ej: '17a', '17b', '300a')
 * @returns Array de coordenadas GPS o null si no hay datos
 */
export function getRealRouteCoordinates(lineaCode: string): Array<{ lat: number; lng: number }> | null {
  const baseLine = lineaCode.replace(/[ab]$/i, '');
  const suffix = lineaCode.match(/[ab]$/i)?.[0]?.toLowerCase() || '';
  
  // 1. Buscar en ALL_UCOT_ROUTES por línea
  const lineRoutes = ALL_UCOT_ROUTES[baseLine];
  if (!lineRoutes) return null;

  // 2. Buscar mapeo de variante
  const variantMap = LINEA_VARIANT_MAP[baseLine];
  if (variantMap) {
    const mappedCode = variantMap[lineaCode] || variantMap[baseLine + suffix] || variantMap[baseLine];
    if (mappedCode && lineRoutes[mappedCode]) {
      return lineRoutes[mappedCode].coordinates;
    }
  }

  // 3. Fallback: primera variante disponible
  const firstVariant = Object.values(lineRoutes)[0];
  return firstVariant?.coordinates || null;
}

/**
 * Obtiene los destinos disponibles para una línea dada.
 */
export function getAvailableDestinations(baseLine: string): Array<{
  codVariante: string;
  destino: string;
  origen: string;
}> {
  const cleanLine = baseLine.replace(/[ab]$/i, '');
  const lineRoutes = ALL_UCOT_ROUTES[cleanLine];
  if (!lineRoutes) return [];

  return Object.entries(lineRoutes).map(([code, data]) => ({
    codVariante: code,
    destino: data.destino,
    origen: data.origen,
  }));
}

/**
 * Lista todas las líneas UCOT que tienen datos GPS reales.
 */
export function getAvailableLines(): string[] {
  return Object.keys(ALL_UCOT_ROUTES).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
`;

  fs.writeFileSync(OUTPUT_FILE, ts, 'utf8');
  
  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`\n✅ Archivo generado: ${OUTPUT_FILE}`);
  console.log(`   Tamaño: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`   Líneas UCOT con datos: ${foundLines.length}`);
  
  let totalPoints = 0;
  let totalVariants = 0;
  for (const variants of Object.values(routesByLine)) {
    for (const route of Object.values(variants)) {
      totalPoints += route.totalPuntos;
      totalVariants++;
    }
  }
  console.log(`   Total variantes: ${totalVariants}`);
  console.log(`   Total puntos GPS: ${totalPoints}`);
  console.log(`\n🎉 ¡Descarga completa!`);
}

downloadAllRoutes().catch(err => {
  console.error('\n❌ Error fatal:', err.message);
  process.exit(1);
});
