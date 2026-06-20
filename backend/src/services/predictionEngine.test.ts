/**
 * predictionEngine.test.ts — Pruebas unitarias para el motor de predicciones ML.
 *
 * FASE 3 Bloque 4.
 */
import { PredictionEngine } from './predictionEngine';
import assert from 'assert';

async function testPredictionEngine() {
  console.log('🧪 Iniciando pruebas unitarias de PredictionEngine...');

  const engine = PredictionEngine.getInstance();
  assert.ok(engine, 'Debería obtener una instancia de PredictionEngine');

  console.log('1. Probando predicción heurística (fallback en hora pico con desvío)...');
  const features = {
    speed_kmh: 30,
    distance_meters: 1000,
    day_of_week: 1, // Lunes
    time_of_day_min: 500, // 8:20 AM (hora pico)
    scheduled_deviation_min: 5
  };

  const eta = engine.predict(features);
  console.log(`   - ETA predicho: ${eta} segundos`);
  assert.ok(eta > 0, 'El ETA predicho debería ser mayor a cero');
  
  // Heurística:
  // velocidad 30 kmh = (30 * 1000) / 3600 = 8.333 m/s.
  // baseSeconds = 1000 / 8.3333 = 120s.
  // desviación: 5 > 3 -> deviationPenalty = 5 * 12 = 60s.
  // baseSeconds + deviationPenalty = 180s.
  // Hora pico factor (500 min está entre 480 y 570): 1.3
  // total = Math.round(180 * 1.3) = Math.round(234) = 234s.
  assert.strictEqual(eta, 234, 'El ETA predicho debería ser exactamente 234s para estas variables heurísticas');

  console.log('2. Probando predicción heurística en hora valle y sin desvío...');
  const featuresValley = {
    speed_kmh: 40,
    distance_meters: 1000,
    day_of_week: 1,
    time_of_day_min: 1200, // 8:00 PM (hora valle)
    scheduled_deviation_min: 0
  };
  const etaValley = engine.predict(featuresValley);
  console.log(`   - ETA predicho (hora valle): ${etaValley} segundos`);
  assert.ok(etaValley < eta, 'El ETA en hora valle debería ser menor al de hora pico con desvío');
  
  // Heurística valle:
  // velocidad 40 kmh = 11.111 m/s.
  // baseSeconds = 1000 / 11.1111 = 90s.
  // desviación: 0 -> deviationPenalty = 0.
  // baseSeconds + deviationPenalty = 90s.
  // Hora valle factor: 1.0
  // total = Math.round(90 * 1.0) = 90s.
  assert.strictEqual(etaValley, 90, 'El ETA predicho en hora valle debería ser exactamente 90s');

  console.log('✅ Todas las pruebas de PredictionEngine pasaron con éxito.');
}

testPredictionEngine().catch(err => {
  console.error('❌ Error ejecutando pruebas de PredictionEngine:', err);
  process.exit(1);
});
