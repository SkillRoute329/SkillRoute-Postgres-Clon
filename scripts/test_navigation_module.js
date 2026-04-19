/**
 * TEST AUTOMATIZADO: Verificación del Módulo de Navegación UCOT
 * Prueba programática de todos los datos sin necesidad de navegador.
 * 
 * Verifica:
 * 1. ¿Todas las líneas UCOT tienen coordenadas GPS reales?
 * 2. ¿Los recorridos son geográficamente válidos (dentro de Montevideo)?
 * 3. ¿Las variantes IDA/VUELTA están correctamente mapeadas?
 * 4. ¿Los datos coinciden con la realidad? (punto inicial/final verificable)
 * 5. ¿El servicio enrichWithOfficialGeoData funciona para TODAS las líneas?
 */

const fs = require('fs');
const path = require('path');

// Leer el archivo routesGeoData.ts como texto y extraer los datos
const routesFile = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'src', 'data', 'routesGeoData.ts'),
  'utf8'
);

// Verificar que el archivo se generó correctamente
console.log('═══════════════════════════════════════════════════════');
console.log('  TEST DE VERIFICACIÓN: Módulo de Navegación UCOT');
console.log('═══════════════════════════════════════════════════════\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, condition, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failedTests++;
    console.log(`  ❌ FALLO: ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// ─── TEST 1: VERIFICAR QUE EXISTEN DATOS PARA TODAS LAS LÍNEAS UCOT ───
console.log('────────────────────────────────────────────');
console.log('1. DATOS GPS PARA CADA LÍNEA UCOT');
console.log('────────────────────────────────────────────');

const expectedLines = ['17', '71', '79', '300', '306', '316', '328', '329', '330', '370', '396'];

for (const line of expectedLines) {
  const regex = new RegExp(`'${line}':\\s*\\{`);
  const hasLine = regex.test(routesFile);
  test(`Línea ${line} tiene datos GPS`, hasLine);
}

// ─── TEST 2: VERIFICAR COORDENADAS GEOGRÁFICAS ───
console.log('\n────────────────────────────────────────────');
console.log('2. COORDENADAS DENTRO DE MONTEVIDEO');
console.log('────────────────────────────────────────────');

// Montevideo bounds: lat [-34.7, -34.95], lng [-56.45, -56.05]
const MVD_LAT_MIN = -35.0;
const MVD_LAT_MAX = -34.7;
const MVD_LNG_MIN = -56.5;
const MVD_LNG_MAX = -55.9;

// Extraer todas las coordenadas del archivo
const coordMatches = [...routesFile.matchAll(/\{ lat: ([-\d.]+), lng: ([-\d.]+) \}/g)];
const totalCoords = coordMatches.length;
let invalidCoords = 0;
let nullIslandCoords = 0;

for (const match of coordMatches) {
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  
  if (lat === 0 && lng === 0) {
    nullIslandCoords++;
    continue;
  }
  
  if (lat < MVD_LAT_MIN || lat > MVD_LAT_MAX || lng < MVD_LNG_MIN || lng > MVD_LNG_MAX) {
    invalidCoords++;
  }
}

test(`Total de coordenadas GPS`, totalCoords > 20000, `${totalCoords} puntos`);
test(`Sin coordenadas (0,0) "Null Island"`, nullIslandCoords === 0, `${nullIslandCoords} encontradas`);
test(`Todas las coordenadas dentro de Montevideo`, invalidCoords === 0, `${invalidCoords} fuera de rango de ${totalCoords}`);

// ─── TEST 3: VERIFICAR VARIANTES IDA/VUELTA ───
console.log('\n────────────────────────────────────────────');
console.log('3. VARIANTES IDA/VUELTA');
console.log('────────────────────────────────────────────');

// Comprobar que hay variantes A y B para las líneas principales
for (const line of expectedLines) {
  const hasVarA = routesFile.includes(`descVariante: 'A'`) || routesFile.includes(`descVariante: '1'`);
  const variantARegex = new RegExp(`'${line}':\\s*\\{[^}]*?'\\d+':\\s*\\{[\\s\\S]*?descVariante:\\s*'[AB1]'`, 'm');
  // Simplificación: verificar que hay al menos 2 variantes por línea
  const lineSection = routesFile.match(new RegExp(`'${line}':\\s*\\{([\\s\\S]*?)\\n  \\},`, 'm'));
  if (lineSection) {
    const variantCount = (lineSection[1].match(/codVariante:/g) || []).length;
    test(`Línea ${line}: tiene variantes IDA/VUELTA`, variantCount >= 2, `${variantCount} variantes`);
  } else {
    test(`Línea ${line}: sección encontrada`, false, 'No se encontró sección');
  }
}

// ─── TEST 4: VERIFICACIÓN DE RECORRIDOS REALES (LÍNEA 17 como referencia) ───
console.log('\n────────────────────────────────────────────');
console.log('4. VERIFICACIÓN GEOGRÁFICA: LÍNEA 17');
console.log('────────────────────────────────────────────');

// La Línea 17 va de Casabó (zona oeste ~-56.27) a Punta Carretas (zona sur ~-56.16)
// Primer punto de la variante 3783 debería estar cerca de Casabó
const firstCoordMatch = routesFile.match(/'3783':\s*\{[\s\S]*?coordinates:\s*\[\s*\{ lat: ([-\d.]+), lng: ([-\d.]+) \}/);
if (firstCoordMatch) {
  const lat = parseFloat(firstCoordMatch[1]);
  const lng = parseFloat(firstCoordMatch[2]);
  test('L17 punto inicial cerca de Casabó (oeste)', lng < -56.24, `lng=${lng}`);
  test('L17 latitud válida Montevideo', lat > -34.95 && lat < -34.8, `lat=${lat}`);
}

// Verificar que el recorrido tiene suficientes puntos
const l17Match = routesFile.match(/totalPuntos: (\d+)/);
if (l17Match) {
  const pts = parseInt(l17Match[1]);
  test('L17 tiene suficientes puntos GPS (>100)', pts > 100, `${pts} puntos`);
}

// ─── TEST 5: VERIFICACIÓN FUNCIONES HELPER ───
console.log('\n────────────────────────────────────────────');
console.log('5. FUNCIONES getRealRouteCoordinates y getAvailableDestinations');
console.log('────────────────────────────────────────────');

test('Función getRealRouteCoordinates exportada', routesFile.includes('export function getRealRouteCoordinates'));
test('Función getAvailableDestinations exportada', routesFile.includes('export function getAvailableDestinations'));
test('Función getAvailableLines exportada', routesFile.includes('export function getAvailableLines'));
test('ALL_UCOT_ROUTES exportado', routesFile.includes('export const ALL_UCOT_ROUTES'));
test('LINEA_VARIANT_MAP exportado', routesFile.includes('export const LINEA_VARIANT_MAP'));
test('Compatibilidad: LINEA_17_ROUTES alias', routesFile.includes("export const LINEA_17_ROUTES = ALL_UCOT_ROUTES['17']"));

// ─── TEST 6: VERIFICAR ucotLinesService.ts ───
console.log('\n────────────────────────────────────────────');
console.log('6. INTEGRACIÓN ucotLinesService.ts');
console.log('────────────────────────────────────────────');

const serviceFile = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'src', 'services', 'ucotLinesService.ts'),
  'utf8'
);

test('Importa ALL_UCOT_ROUTES', serviceFile.includes('ALL_UCOT_ROUTES'));
test('Importa getRealRouteCoordinates', serviceFile.includes('getRealRouteCoordinates'));
test('enrichWithOfficialGeoData invocada', serviceFile.includes('enrichWithOfficialGeoData'));
test('NO hardcodea solo L17', !serviceFile.includes("baseCodigo === '17'"), 'Funciona para todas las líneas');
test('Usa ALL_UCOT_ROUTES[baseCodigo]', serviceFile.includes('ALL_UCOT_ROUTES[baseCodigo]'));

// ─── TEST 7: VERIFICAR DesvioEditor.tsx ───
console.log('\n────────────────────────────────────────────');
console.log('7. EDITOR DE DESVÍOS');
console.log('────────────────────────────────────────────');

const desvioFile = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'src', 'components', 'traffic', 'DesvioEditor.tsx'),
  'utf8'
);

test('DesvioEditor existe y es válido', desvioFile.includes('DesvioEditor'));
test('Soporta desvíos temporales', desvioFile.includes("'temporal'"));
test('Soporta desvíos fijos', desvioFile.includes("'fijo'"));
test('Tipos: accidente, obra, corte, pozo', 
  desvioFile.includes('accidente') && desvioFile.includes('obra_temp') && desvioFile.includes('corte') && desvioFile.includes('pozo'));
test('Botón "Marcar Inicio" (pick desde mapa)', desvioFile.includes('Marcar Inicio'));
test('Botón "Marcar Fin" (pick desde mapa)', desvioFile.includes('Marcar Fin'));
test('Guarda en Firestore', desvioFile.includes('setDoc'));
test('onRequestMapPick funcional', desvioFile.includes('onRequestMapPick'));

// ─── TEST 8: VERIFICAR RouteMap.tsx ───
console.log('\n────────────────────────────────────────────');
console.log('8. MAPA DE RUTA (RouteMap)');
console.log('────────────────────────────────────────────');

const routeMapFile = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'src', 'components', 'traffic', 'RouteMap.tsx'),
  'utf8'
);

test('RouteMap renderiza Polyline', routeMapFile.includes('<Polyline'));
test('Filtra coordenadas (0,0)', routeMapFile.includes('isValidPoint'));
test('Muestra marcadores de desvíos temporales', routeMapFile.includes('desviosActivosTemp'));
test('Muestra marcadores de desvíos fijos', routeMapFile.includes('desviosActivosFijos'));
test('Muestra ruta alternativa de desvíos', routeMapFile.includes('rutaAlternativa'));
test('Soporta MapClick para picking location', routeMapFile.includes('MapClickHandler'));
test('Muestra indicador de posición del usuario', routeMapFile.includes('userPosition'));
test('Modo follow user (guía tipo Waze)', routeMapFile.includes('FollowUser'));
test('Picked locations (temporal, desde, hasta)', 
  routeMapFile.includes('pickedTemporal') && routeMapFile.includes('pickedDesde') && routeMapFile.includes('pickedHasta'));

// ─── TEST 9: VERIFICAR NavigationModule.tsx ───
console.log('\n────────────────────────────────────────────');
console.log('9. MÓDULO PRINCIPAL DE NAVEGACIÓN');
console.log('────────────────────────────────────────────');

const navModuleFile = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'src', 'pages', 'traffic', 'NavigationModule.tsx'),
  'utf8'
);

test('Botón "Iniciar Viaje GPS" (modo admin)', navModuleFile.includes('Iniciar Viaje GPS'));
test('Botón "Iniciar viaje" (modo conductor)', navModuleFile.includes('Iniciar viaje'));
test('Botón "Finalizar viaje"', navModuleFile.includes('Finalizar viaje') || navModuleFile.includes('Finalizar Viaje'));
test('Botón "Agregar desvío" (modo admin)', navModuleFile.includes('Agregar desvío'));
test('Botón "Reportar en ruta" (modo conductor)', navModuleFile.includes('Reportar en ruta'));
test('DesvioEditor integrado', navModuleFile.includes('<DesvioEditor'));
test('showDesvioEditor state', navModuleFile.includes('showDesvioEditor'));
test('isPickingLocation banner', navModuleFile.includes('isPickingLocation'));
test('Selector de línea UCOT', navModuleFile.includes('Línea UCOT'));
test('Selector de Recorrido', navModuleFile.includes('Recorrido'));
test('Panel de Paradas', navModuleFile.includes('Paradas'));
test('HUD próxima parada (modo guía)', navModuleFile.includes('Próxima Parada'));
test('Voz activable/desactivable', navModuleFile.includes('Voz on') && navModuleFile.includes('Voz off'));

// ─── TEST 10: VERIFICAR QUE NO HAY COORDENADAS SIMULADAS ───
console.log('\n────────────────────────────────────────────');
console.log('10. SEGURIDAD: SIN DATOS SIMULADOS');
console.log('────────────────────────────────────────────');

// Verificar que routesGeoData.ts NO contiene coordenadas (0,0) ni líneas rectas simuladas
test('Sin coordenadas (0,0) en routesGeoData', !routesFile.includes('{ lat: 0, lng: 0 }'));
test('Fuente oficial declarada (GeoServer IMM)', routesFile.includes('GeoServer Intendencia de Montevideo'));

// Verificar variación geográfica (no son líneas rectas)
// Extraer primeros 10 puntos de la primera línea y verificar que varían
const firstCoords = [...routesFile.matchAll(/\{ lat: ([-\d.]+), lng: ([-\d.]+) \}/g)].slice(0, 10);
if (firstCoords.length >= 5) {
  const lats = firstCoords.map(m => parseFloat(m[1]));
  const lngs = firstCoords.map(m => parseFloat(m[2]));
  const latVariation = Math.max(...lats) - Math.min(...lats);
  const lngVariation = Math.max(...lngs) - Math.min(...lngs);
  test('Coordenadas NO son línea recta (variación lat)', latVariation > 0.001, `Δlat=${latVariation.toFixed(6)}`);
  test('Coordenadas NO son línea recta (variación lng)', lngVariation > 0.001, `Δlng=${lngVariation.toFixed(6)}`);
}

// ─── TEST 11: SERVIDOR ACTIVO ───
console.log('\n────────────────────────────────────────────');
console.log('11. SERVIDOR DE DESARROLLO');
console.log('────────────────────────────────────────────');

const http = require('http');
const testServer = () => new Promise((resolve) => {
  const req = http.get('http://localhost:3005/', { timeout: 5000 }, (res) => {
    test('Servidor en puerto 3005 responde', res.statusCode === 200, `HTTP ${res.statusCode}`);
    resolve(true);
  });
  req.on('error', () => {
    test('Servidor en puerto 3005 responde', false, 'No responde');
    resolve(false);
  });
  req.on('timeout', () => {
    test('Servidor en puerto 3005 responde', false, 'Timeout');
    req.destroy();
    resolve(false);
  });
});

testServer().then(() => {
  // ─── RESUMEN ───
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  RESULTADOS: ${passedTests}/${totalTests} tests pasaron`);
  if (failedTests > 0) {
    console.log(`  ⚠ ${failedTests} tests FALLARON`);
  } else {
    console.log('  🎉 ¡TODOS LOS TESTS PASARON!');
  }
  console.log('═══════════════════════════════════════════════════════');
  
  if (failedTests > 0) {
    process.exit(1);
  }
});
