import { planningService } from './planningService';
import assert from 'assert';

async function testPlanningService() {
  console.log('🧪 Iniciando pruebas unitarias de PlanningService...');

  // 1. Probar distancia de Haversine
  console.log('1. Probando cálculo de distancia Haversine...');
  const dist = planningService.haversineDistance(-34.9011, -56.1645, -34.8950, -56.1600);
  console.log(`   - Distancia calculada: ${dist.toFixed(4)} km`);
  assert.ok(dist > 0.5 && dist < 1.0, 'La distancia entre el centro y Tres Cruces debería estar entre 0.5 y 1.0 km');

  // 2. Probar punto en polígono (Ray-Casting)
  console.log('2. Probando algoritmo punto en polígono (Ray-Casting)...');
  
  // Un punto claramente dentro de Pocitos: -34.912, -56.148
  const isInsidePocitos = planningService.isPointInPolygon(
    { lat: -34.912, lng: -56.148 },
    [
      [-34.9150, -56.1550],
      [-34.9050, -56.1500],
      [-34.9080, -56.1350],
      [-34.9180, -56.1420]
    ]
  );
  console.log(`   - Punto en Pocitos: ${isInsidePocitos}`);
  assert.strictEqual(isInsidePocitos, true, 'El punto dentro del polígono de Pocitos debería retornar true');

  // Un punto claramente fuera de Pocitos: -34.850, -56.200
  const isOutsidePocitos = planningService.isPointInPolygon(
    { lat: -34.850, lng: -56.200 },
    [
      [-34.9150, -56.1550],
      [-34.9050, -56.1500],
      [-34.9080, -56.1350],
      [-34.9180, -56.1420]
    ]
  );
  console.log(`   - Punto fuera de Pocitos: ${isOutsidePocitos}`);
  assert.strictEqual(isOutsidePocitos, false, 'El punto fuera de Pocitos debería retornar false');

  // 3. Probar obtención de barrios cruzados
  console.log('3. Probando detección de barrios cruzados por la ruta...');
  const points = [
    { lat: -34.906, lng: -56.195 }, // Centro
    { lat: -34.903, lng: -56.185 }, // Centro
    { lat: -34.896, lng: -56.164 }  // Tres Cruces
  ];
  const paradas = [
    { id: '1', nombre: 'Parada 1', lat: -34.905, lng: -56.192 },
    { id: '2', nombre: 'Parada 2', lat: -34.895, lng: -56.162 }
  ];

  const barrios = planningService.getCrossedBarrios(points, paradas);
  console.log(`   - Barrios cruzados detectados: ${barrios.map(b => b.nombre).join(', ')}`);
  assert.ok(barrios.some(b => b.nombre === 'Centro'), 'Debería detectar el barrio Centro');
  assert.ok(barrios.some(b => b.nombre === 'Tres Cruces'), 'Debería detectar el barrio Tres Cruces');

  // 4. Probar Análisis de Equidad (Latam Engine)
  console.log('4. Probando motor de análisis de equidad (Equity Analysis)...');
  const equityAnalysis = planningService.analyzeEquity(points, paradas, 80);
  console.log(`   - Social Coverage Index: ${equityAnalysis.socialCoverageIndex}%`);
  console.log(`   - Accessibility Score: ${equityAnalysis.accessibilityScore}`);
  console.log(`   - Disproportionate Impact: ${equityAnalysis.disproportionateImpact}`);
  console.log(`   - Equity Score: ${equityAnalysis.equityScore}`);
  
  assert.ok(typeof equityAnalysis.socialCoverageIndex === 'number', 'Social Coverage Index debería ser un número');
  assert.ok(equityAnalysis.equityScore >= 0 && equityAnalysis.equityScore <= 100, 'El Equity Score debería estar entre 0 y 100');

  // 5. Probar Impacto Financiero
  console.log('5. Probando simulación de impacto financiero...');
  const financial = planningService.calculateFinancialImpact(points, paradas, 40, 90, 56);
  console.log(`   - Longitud ruta: ${financial.lengthKm} km`);
  console.log(`   - Costo mensual: $${financial.monthlyCost} UYU`);
  console.log(`   - Pasajeros diarios: ${financial.dailyPassengers}`);
  console.log(`   - Ingresos mensuales: $${financial.monthlyRevenue} UYU`);
  console.log(`   - ROI operativo: ${financial.roi}%`);

  assert.ok(financial.lengthKm > 0, 'La longitud de la ruta calculada debería ser mayor a cero');
  assert.ok(financial.monthlyCost > 0, 'El costo operativo mensual debería ser mayor a cero');
  assert.ok(financial.dailyPassengers > 0, 'Los pasajeros diarios estimados deberían ser mayores a cero');
  assert.ok(financial.roi !== undefined, 'El ROI debería calcularse');

  console.log('✅ Todas las pruebas de PlanningService pasaron con éxito.');
}

testPlanningService().catch(err => {
  console.error('❌ Error ejecutando pruebas de PlanningService:', err);
  process.exit(1);
});
