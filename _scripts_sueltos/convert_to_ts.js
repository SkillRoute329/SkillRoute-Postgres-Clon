/**
 * Convierte linea_17_real_coordinates.json a un módulo TypeScript
 * con los recorridos reales para inyectar en el sistema de navegación.
 */
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('linea_17_real_coordinates.json', 'utf8'));

// Variantes principales de la línea 17:
// 3783: Casabó → Punta Carretas (IDA parcial, destino P.Carretas)
// 3784: Punta Carretas → Casabó (VUELTA parcial, destino Casabó)
// 3786: Punta Carretas → Casabó por Terminal del Cerro
// 3839: Teatro de Verano → Casabó por Terminal del Cerro  
// 3854: Casabó → Parque Rodó
// 3857: Terminal del Cerro → Punta Carretas
// 3862: Punta Carretas → Terminal del Cerro
// 3865: Punta Carretas → Terminal del Cerro por Terminal del Cerro

let output = `/**
 * Recorridos REALES de la línea 17 — datos GPS oficiales.
 * Fuente: GeoServer Intendencia de Montevideo (v_uptu_sentido_variante)
 * Fecha de extracción: ${new Date().toISOString().split('T')[0]}
 * NUNCA modificar manualmente — regenerar desde download_line17_real.js
 */

export interface RouteGeoData {
  codVariante: number;
  descSublinea: string;
  origen: string;
  destino: string;
  totalPuntos: number;
  coordinates: Array<{ lat: number; lng: number }>;
}

/** Recorridos reales de todas las variantes de la línea 17. */
export const LINEA_17_ROUTES: Record<string, RouteGeoData> = {\n`;

for (const [codVar, varData] of Object.entries(data)) {
  const v = varData;
  // Simplificar coordenadas (reducir a ~100 puntos aprox para performance)
  // manteniendo puntos clave (cada N puntos + primero y último)
  const coords = v.coordinates;
  const maxPts = 150;
  const step = Math.max(1, Math.floor(coords.length / maxPts));
  const simplified = [];
  for (let i = 0; i < coords.length; i++) {
    if (i === 0 || i === coords.length - 1 || i % step === 0) {
      simplified.push(coords[i]);
    }
  }
  
  output += `  '${codVar}': {
    codVariante: ${v.cod_variante},
    descSublinea: '${(v.desc_sublinea || '').replace(/'/g, "\\'")}',
    origen: '${(v.origen || '').replace(/'/g, "\\'")}',
    destino: '${(v.destino || '').replace(/'/g, "\\'")}',
    totalPuntos: ${simplified.length},
    coordinates: [
${simplified.map(c => `      { lat: ${c.lat}, lng: ${c.lng} }`).join(',\n')}
    ],
  },\n`;
}

output += `};\n\n`;

// Mapeo de variantes a códigos del sistema (17a = IDA, 17b = VUELTA, etc.)
output += `/**
 * Mapeo de códigos de variante del sistema UCOT a códigos GeoServer.
 * '17a' = IDA principal (Casabó → Punta Carretas)
 * '17b' = VUELTA principal (Punta Carretas → Casabó)
 * Variantes adicionales disponibles por cod_variante.
 */
export const LINEA_17_VARIANT_MAP: Record<string, string> = {
  '17a': '3783',   // Casabó → Punta Carretas
  '17b': '3784',   // Punta Carretas → Casabó
  '17': '3783',    // Default = IDA
};\n\n`;

// Funciones de lookup generales  
output += `/**
 * Obtiene las coordenadas reales del recorrido de una línea por código de variante.
 * @param lineaCode - Código de línea + variante (ej: '17a', '17b')
 * @returns Array de coordenadas GPS o null si no hay datos
 */
export function getRealRouteCoordinates(lineaCode: string): Array<{ lat: number; lng: number }> | null {
  // Primero buscar mapeo directo
  const varCode = LINEA_17_VARIANT_MAP[lineaCode];
  if (varCode && LINEA_17_ROUTES[varCode]) {
    return LINEA_17_ROUTES[varCode].coordinates;
  }
  // Buscar en rutas directamente por cod_variante
  if (LINEA_17_ROUTES[lineaCode]) {
    return LINEA_17_ROUTES[lineaCode].coordinates;
  }
  return null;
}

/**
 * Obtiene los destinos disponibles para una línea dada.
 */
export function getAvailableDestinations(baseLine: string): Array<{
  codVariante: string;
  destino: string;
  origen: string;
}> {
  if (baseLine.replace(/[ab]$/i, '') !== '17') return [];
  
  return Object.entries(LINEA_17_ROUTES).map(([code, data]) => ({
    codVariante: code,
    destino: data.destino,
    origen: data.origen,
  }));
}
`;

fs.writeFileSync('frontend/src/data/routesGeoData.ts', output);
console.log(`✓ Generado frontend/src/data/routesGeoData.ts`);
console.log(`  Total variantes: ${Object.keys(data).length}`);

// Stats
for (const [codVar, varData] of Object.entries(data)) {
  const coords = varData.coordinates;
  const maxPts = 150;
  const step = Math.max(1, Math.floor(coords.length / maxPts));
  let count = 0;
  for (let i = 0; i < coords.length; i++) {
    if (i === 0 || i === coords.length - 1 || i % step === 0) count++;
  }
  console.log(`  ${codVar}: ${varData.origen} → ${varData.destino} (${coords.length} → ${count} pts)`);
}
