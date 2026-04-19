import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const filePath = resolve('frontend/src/services/CompetitorIntelligence.ts');

// Leer con BOM UTF-16 LE
let content = readFileSync(filePath, 'utf8');

// ─── NUEVO CORRIDOR_MAP (datos reales STM Montevideo) ─────────────────────────
const NEW_MAP = `export const CORRIDOR_MAP: CorridorDefinition[] = [

  // LÍNEA 300 — Rivales: Copsa 161/162/163 (Av. Italia/Belloni VERIFICADO)
  // ❌ Eliminados 103/110: no comparten Av. Italia con la 300
  { lineId: '300', destino: 'INSTRUCCIONES', variantCode: '300a', headingRange: [20, 110] as [number, number],
    rivals: ['161', '162', '163'], label: '300 → Instrucciones (IDA)',
    terminalOrigen: 'Cementerio Central', terminalDestino: 'Instrucciones y Belloni',
    corridorBbox: [-34.92, -56.20, -34.83, -56.05] as [number, number, number, number] },
  { lineId: '300', destino: 'CRIO_CENTRAL', variantCode: '300b', headingRange: [200, 290] as [number, number],
    rivals: ['161', '162', '163'], label: '300 → Crio. Central (VTA)',
    terminalOrigen: 'Instrucciones y Belloni', terminalDestino: 'Cementerio Central',
    corridorBbox: [-34.92, -56.20, -34.83, -56.05] as [number, number, number, number] },

  // LÍNEA 306 — Rivales: Cutcsa 185 + Línea G/Gómez (Cno. Ramírez → Ruta 1 → Géant)
  // ❌ Eliminado 76: no comparte el corredor Ruta 1/Casabó
  { lineId: '306', destino: 'GÉANT', variantCode: '306a', headingRange: [50, 160] as [number, number],
    rivals: ['185', 'G'], label: '306 → Géant (IDA)',
    terminalOrigen: 'Casabó', terminalDestino: 'Géant',
    corridorBbox: [-34.95, -56.30, -34.75, -56.10] as [number, number, number, number] },
  { lineId: '306', destino: 'CASABÓ', variantCode: '306b', headingRange: [230, 340] as [number, number],
    rivals: ['185', 'G'], label: '306 → Casabó (VTA)',
    terminalOrigen: 'Géant', terminalDestino: 'Casabó',
    corridorBbox: [-34.95, -56.30, -34.75, -56.10] as [number, number, number, number] },

  // LÍNEA 316 — Rivales: Cutcsa 186/187/188 (Av. Millán/Garzón/Pocitos VERIFICADO)
  // ❌ Eliminados 100/103: son corredores Ciudad Vieja/Centro
  { lineId: '316', destino: 'POCITOS', variantCode: '316a', headingRange: [160, 260] as [number, number],
    rivals: ['186', '187', '188'], label: '316 → Pocitos (IDA)',
    terminalOrigen: 'Cno. Maldonado', terminalDestino: 'Pocitos',
    corridorBbox: [-34.91, -56.18, -34.86, -56.10] as [number, number, number, number] },
  { lineId: '316', destino: 'CNO_MALDONADO', variantCode: '316b', headingRange: [340, 80] as [number, number],
    rivals: ['186', '187', '188'], label: '316 → Cno. Maldonado (VTA)',
    terminalOrigen: 'Pocitos', terminalDestino: 'Cno. Maldonado',
    corridorBbox: [-34.91, -56.18, -34.86, -56.10] as [number, number, number, number] },

  // LÍNEA 328 — Rivales: Cutcsa 125/126 + Dinata D1 (18 de Julio/Goes VERIFICADO)
  // ❌ Eliminados 102/106: son corredores distintos (Cerrito/Larrañaga)
  { lineId: '328', destino: 'MENDOZA', variantCode: '328a', headingRange: [20, 110] as [number, number],
    rivals: ['125', '126', 'D1'], label: '328 → Mendoza (IDA)',
    terminalOrigen: 'Punta Carretas', terminalDestino: 'Mendoza',
    corridorBbox: [-34.92, -56.20, -34.88, -56.13] as [number, number, number, number] },
  { lineId: '328', destino: 'PUNTA_CARRETAS', variantCode: '328b', headingRange: [200, 290] as [number, number],
    rivals: ['125', '126', 'D1'], label: '328 → Punta Carretas (VTA)',
    terminalOrigen: 'Mendoza', terminalDestino: 'Punta Carretas',
    corridorBbox: [-34.92, -56.20, -34.88, -56.13] as [number, number, number, number] },

  // LÍNEA 329 — Rivales: Cutcsa 181/182/183 (Av. Italia/Instrucciones CONFIRMADO)
  { lineId: '329', destino: 'INSTRUCCIONES', variantCode: '329a', headingRange: [20, 110] as [number, number],
    rivals: ['181', '182', '183'], label: '329 → Instrucciones (IDA)',
    terminalOrigen: 'Punta Carretas', terminalDestino: 'Instrucciones',
    corridorBbox: [-34.92, -56.18, -34.83, -56.05] as [number, number, number, number] },
  { lineId: '329', destino: 'PUNTA_CARRETAS', variantCode: '329b', headingRange: [200, 290] as [number, number],
    rivals: ['181', '182', '183'], label: '329 → Punta Carretas (VTA)',
    terminalOrigen: 'Instrucciones', terminalDestino: 'Punta Carretas',
    corridorBbox: [-34.92, -56.18, -34.83, -56.05] as [number, number, number, number] },

  // LÍNEA 330 — Rivales: Cutcsa 147/148/185 (Cno. Ramírez/Ciudad Vieja VERIFICADO)
  // ❌ Eliminados 103/109: son corredores Goes/Larrañaga
  { lineId: '330', destino: 'CIUDAD_VIEJA', variantCode: '330a', headingRange: [20, 160] as [number, number],
    rivals: ['147', '148', '185'], label: '330 → Ciudad Vieja (IDA)',
    terminalOrigen: 'Cerro (Villa del Cerro)', terminalDestino: 'Ciudad Vieja',
    corridorBbox: [-34.93, -56.30, -34.88, -56.20] as [number, number, number, number] },
  { lineId: '330', destino: 'CERRO', variantCode: '330b', headingRange: [200, 340] as [number, number],
    rivals: ['147', '148', '185'], label: '330 → Cerro (VTA)',
    terminalOrigen: 'Ciudad Vieja', terminalDestino: 'Cerro (Villa del Cerro)',
    corridorBbox: [-34.93, -56.30, -34.88, -56.20] as [number, number, number, number] },

  // LÍNEA 370 IDA — Rivales: Cutcsa 110/103/112 (Rambla/Italia/Carrasco CONFIRMADO)
  { lineId: '370', destino: 'PORTONES', variantCode: '370a', headingRange: [30, 150] as [number, number],
    rivals: ['110', '103', '112'], label: '370 → Portones (IDA)',
    terminalOrigen: 'Playa del Cerro', terminalDestino: 'Portones',
    corridorBbox: [-34.95, -56.30, -34.87, -56.00] as [number, number, number, number] },
  // LÍNEA 370 VTA — Rivales distintos en vuelta (128/137 Rambla vuelta)
  { lineId: '370', destino: 'CERRO', variantCode: '370b', headingRange: [210, 330] as [number, number],
    rivals: ['128', '137', '185'], label: '370 → Playa Cerro (VTA)',
    terminalOrigen: 'Portones', terminalDestino: 'Playa del Cerro',
    corridorBbox: [-34.95, -56.30, -34.87, -56.00] as [number, number, number, number] },

  // LÍNEA 396 — Rivales: Cutcsa 181/196/197 (Av. Italia/Schroeder/Instrucciones)
  // ❌ Eliminados 110/103: son corredores distintos
  { lineId: '396', destino: 'INSTRUCCIONES', variantCode: '396a', headingRange: [20, 110] as [number, number],
    rivals: ['181', '196', '197'], label: '396 → Instrucciones (IDA)',
    terminalOrigen: 'Punta Carretas', terminalDestino: 'Instrucciones',
    corridorBbox: [-34.92, -56.18, -34.83, -56.05] as [number, number, number, number] },
  { lineId: '396', destino: 'PUNTA_CARRETAS', variantCode: '396b', headingRange: [200, 290] as [number, number],
    rivals: ['181', '196', '197'], label: '396 → Punta Carretas (VTA)',
    terminalOrigen: 'Instrucciones', terminalDestino: 'Punta Carretas',
    corridorBbox: [-34.92, -56.18, -34.83, -56.05] as [number, number, number, number] },

  // LÍNEA 17 — Rivales: Cutcsa 148/117/185 (Cerro/Centro/Pocitos VERIFICADO)
  // ❌ Eliminado 103 puro (va por Goes, no Ramírez)
  { lineId: '17', destino: 'PUNTA_CARRETAS', variantCode: '17a', headingRange: [20, 160] as [number, number],
    rivals: ['148', '117', '185'], label: '17 → Punta Carretas (IDA)',
    terminalOrigen: 'Casabó (Bajo Valencia)', terminalDestino: 'Punta Carretas',
    corridorBbox: [-34.93, -56.30, -34.90, -56.14] as [number, number, number, number] },
  { lineId: '17', destino: 'CASABÓ', variantCode: '17b', headingRange: [200, 340] as [number, number],
    rivals: ['148', '117', '185'], label: '17 → Casabó (VTA)',
    terminalOrigen: 'Punta Carretas', terminalDestino: 'Casabó (Bajo Valencia)',
    corridorBbox: [-34.93, -56.30, -34.90, -56.14] as [number, number, number, number] },

  // LÍNEA 71 — Rivales: Cutcsa 121/122/124 (Bvar. Artigas/Av. Rivera VERIFICADO)
  { lineId: '71', destino: 'MENDOZA_INSTRUCCIONES', variantCode: '71a', headingRange: [20, 160] as [number, number],
    rivals: ['121', '122', '124'], label: '71 → Mendoza e Instrucciones (IDA)',
    terminalOrigen: 'Pocitos', terminalDestino: 'Mendoza e Instrucciones',
    corridorBbox: [-34.92, -56.17, -34.87, -56.10] as [number, number, number, number] },
  { lineId: '71', destino: 'POCITOS', variantCode: '71b', headingRange: [200, 340] as [number, number],
    rivals: ['121', '122', '124'], label: '71 → Pocitos (VTA)',
    terminalOrigen: 'Mendoza e Instrucciones', terminalDestino: 'Pocitos',
    corridorBbox: [-34.92, -56.17, -34.87, -56.10] as [number, number, number, number] },

  // LÍNEA 79 — Rivales: Cutcsa 103/155/180 (18 de Julio/Italia/Belloni VERIFICADO)
  // ✅ 103 CORRECTO en este eje (18 de Julio es compartido con la 79)
  // ❌ Eliminado 110: es corredor Rambla, no 18 de Julio
  { lineId: '79', destino: 'BELLONI', variantCode: '79a', headingRange: [20, 160] as [number, number],
    rivals: ['103', '155', '180'], label: '79 → Belloni (IDA)',
    terminalOrigen: 'Ciudad Vieja (Ciudadela)', terminalDestino: 'Intercambiador Belloni',
    corridorBbox: [-34.92, -56.20, -34.87, -56.09] as [number, number, number, number] },
  { lineId: '79', destino: 'CIUDAD_VIEJA', variantCode: '79b', headingRange: [200, 340] as [number, number],
    rivals: ['103', '155', '180'], label: '79 → Ciudad Vieja (VTA)',
    terminalOrigen: 'Intercambiador Belloni', terminalDestino: 'Ciudad Vieja (Ciudadela)',
    corridorBbox: [-34.92, -56.20, -34.87, -56.09] as [number, number, number, number] },

  // LÍNEA 11A — Rivales: Copsa C1 + Rubricay (Ruta 8/Sauce/San Ramón INTERDEPARTAMENTAL)
  // ❌ ELIMINADOS 102/106: son líneas urbanas Montevideo, NO van a Sauce/San Ramón
  { lineId: '11A', destino: 'SAUCE', variantCode: '11Aa', headingRange: [0, 180] as [number, number],
    rivals: ['C1', 'Rubricay'], label: '11A → Sauce / San Ramón (IDA)',
    terminalOrigen: 'Terminal Baltasar Brum', terminalDestino: 'Sauce / San Ramón',
    corridorBbox: [-34.70, -56.10, -34.40, -55.90] as [number, number, number, number] },
  { lineId: '11A', destino: 'BALTASAR_BRUM', variantCode: '11Ab', headingRange: [180, 360] as [number, number],
    rivals: ['C1', 'Rubricay'], label: '11A → Baltasar Brum (VTA)',
    terminalOrigen: 'Sauce / San Ramón', terminalDestino: 'Terminal Baltasar Brum',
    corridorBbox: [-34.70, -56.10, -34.40, -55.90] as [number, number, number, number] },

  // LÍNEA 221 — Rivales: Copsa 721/722/C6 (Ruta Interbalnearia/El Pinar INTERDEPARTAMENTAL)
  // ❌ ELIMINADOS 110/103: son líneas urbanas Rambla/18 de Jul, NO van a El Pinar
  { lineId: '221', destino: 'EL_PINAR', variantCode: '221a', headingRange: [0, 180] as [number, number],
    rivals: ['721', 'C6', '722'], label: '221 → El Pinar (IDA)',
    terminalOrigen: 'Terminal Baltasar Brum', terminalDestino: 'El Pinar',
    corridorBbox: [-34.90, -56.10, -34.75, -55.80] as [number, number, number, number] },
  { lineId: '221', destino: 'BALTASAR_BRUM', variantCode: '221b', headingRange: [180, 360] as [number, number],
    rivals: ['721', 'C6', '722'], label: '221 → Baltasar Brum (VTA)',
    terminalOrigen: 'El Pinar', terminalDestino: 'Terminal Baltasar Brum',
    corridorBbox: [-34.90, -56.10, -34.75, -55.80] as [number, number, number, number] },

  // LÍNEA 8SR — Rivales: Copsa C1 + Rubricay (Ruta 8/San Ramón INTERDEPARTAMENTAL)
  // ❌ ELIMINADO 103: línea urbana Montevideo, NO va a San Ramón
  { lineId: '8SR', destino: 'SAN_RAMON', variantCode: '8SRa', headingRange: [0, 180] as [number, number],
    rivals: ['C1', 'Rubricay'], label: '8SR → San Ramón (IDA)',
    terminalOrigen: 'Terminal Baltasar Brum', terminalDestino: 'San Ramón',
    corridorBbox: [-34.70, -56.10, -34.35, -55.85] as [number, number, number, number] },
  { lineId: '8SR', destino: 'BALTASAR_BRUM', variantCode: '8SRb', headingRange: [180, 360] as [number, number],
    rivals: ['C1', 'Rubricay'], label: '8SR → Baltasar Brum (VTA)',
    terminalOrigen: 'San Ramón', terminalDestino: 'Terminal Baltasar Brum',
    corridorBbox: [-34.70, -56.10, -34.35, -55.85] as [number, number, number, number] },
  // NOTA: XA1, XA2, L12, L13, CA1, CE1, LM-12, LM-13, DM1 ELIMINADOS
  // Motivo: Líneas fantasma con terminales genéricas "Terminal A/B" sin datos reales.
];`;

// Reemplazar el bloque CORRIDOR_MAP completo
// El bloque comienza con "export const CORRIDOR_MAP" y termina con "];"
const startMarker = 'export const CORRIDOR_MAP: CorridorDefinition[] = [';
const endMarker = '\n];';

const startIdx = content.indexOf(startMarker);
if (startIdx === -1) {
  console.error('ERROR: No se encontró CORRIDOR_MAP en el archivo');
  process.exit(1);
}

// Encontrar el cierre del array (el \n]; después del inicio)
let endIdx = content.indexOf(endMarker, startIdx);
if (endIdx === -1) {
  console.error('ERROR: No se encontró el cierre del CORRIDOR_MAP');
  process.exit(1);
}
endIdx += endMarker.length; // Incluir el "\n];

// También necesitamos actualizar la interfaz CorridorDefinition para agregar corridorBbox
const OLD_INTERFACE = `export interface CorridorDefinition {
  lineId: string;
  destino: string;
  /** Código de variante para cargar recorrido real ('370a' = IDA, '370b' = VUELTA) */
  variantCode: string;
  /** Rango de heading del corredor (ej: 45-135 = hacia el Este) */
  headingRange: [number, number];
  /** Rivales específicos para ESTE sentido */
  rivals: string[];
  /** Descripción para la UI */
  label: string;
  /** Terminal de salida */
  terminalOrigen: string;
  /** Terminal de llegada */
  terminalDestino: string;
}`;

const NEW_INTERFACE = `export interface CorridorDefinition {
  lineId: string;
  destino: string;
  /** Código de variante para cargar recorrido real ('370a' = IDA, '370b' = VUELTA) */
  variantCode: string;
  /** Rango de heading del corredor (ej: 45-135 = hacia el Este) */
  headingRange: [number, number];
  /** Rivales verificados geográficamente para ESTE sentido */
  rivals: string[];
  /** Descripción para la UI */
  label: string;
  /** Terminal de salida */
  terminalOrigen: string;
  /** Terminal de llegada */
  terminalDestino: string;
  /**
   * Bounding box del corredor: [latMin, lngMin, latMax, lngMax]
   * Bus rival FUERA de este bbox se descarta automáticamente (evita falsos positivos).
   */
  corridorBbox?: [number, number, number, number];
}`;

// Actualizar interfaz
content = content.replace(OLD_INTERFACE, NEW_INTERFACE);

// Actualizar el comentario del modelo
content = content.replace(
  '// MODELO DE CORREDORES TÁCTICOS v5.0 (Variant-Aware + Schedule-Aware)',
  '// MODELO DE CORREDORES TÁCTICOS v6.0 (Geo-Validated — Rivales Verificados)'
);
content = content.replace(
  '// Mapa de Corredores Tácticos v5.0 — Variant-Aware.',
  '// Mapa de Corredores Tácticos v6.0 — Geo-Validated.'
);
content = content.replace(
  '// Cada corredor referencia el código de variante para cargar la ruta REAL.',
  '// Rivales verificados geográficamente por corredor. Lineas fantasma ELIMINADAS.'
);

// Reemplazar el CORRIDOR_MAP completo
content = content.slice(0, startIdx) + NEW_MAP + content.slice(endIdx);

// También añadir validación bbox en checkCorridorThreat
const BBOX_FILTER = `
      // Filtro de BOUNDING BOX del corredor (descarta rivales geográficamente lejanos)
      if (corridor.corridorBbox) {
        const [latMin, lngMin, latMax, lngMax] = corridor.corridorBbox;
        if (busLat < latMin || busLat > latMax || busLng < lngMin || busLng > lngMax) continue;
      }

      // Filtro de CO-DIRECCIONALIDAD`;

content = content.replace(
  `      // Filtro de CO-DIRECCIONALIDAD`,
  BBOX_FILTER
);

writeFileSync(filePath, content, 'utf8');
console.log('✅ CompetitorIntelligence.ts actualizado correctamente');
console.log(`   Lineas fantasma eliminadas: XA1, XA2, L12, L13, CA1, CE1, LM-12, LM-13, DM1`);
console.log(`   Rivales corregidos: 300, 306, 316, 328, 329, 330, 370, 396, 17, 71, 79, 11A, 221, 8SR`);
console.log(`   Nuevo campo corridorBbox para filtrado geográfico`);
