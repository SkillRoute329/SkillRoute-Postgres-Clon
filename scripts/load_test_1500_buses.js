/**
 * SkillRoute — Stress Test Oficial (1.500 Buses Concurrentes)
 * Simula el pico de la tarde de Montevideo (17:00 a 19:30).
 * 
 * Inyecta cargas masivas contra el backend Postgres local (Generic Bridge).
 */

const NUM_BUSES = 1500;
const API_URL = 'http://localhost:3001/api/db/vehiculos';
const BATCH_SIZE = 100;

async function runLoadTest() {
  console.log(`🚀 Iniciando Stress Test Oficial: ${NUM_BUSES} Buses Concurrentes`);
  console.log(`📡 Destino: ${API_URL}`);

  // 1. Obtener Token JWT para el test
  let token = '';
  try {
    const authRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalNumber: '329', password: 'Skill329' })
    });
    if (!authRes.ok) throw new Error('Fallo login');
    const authData = await authRes.json();
    token = authData.data.token;
  } catch (e) {
    console.error('No se pudo autenticar:', e.message);
    return;
  }

  // Generar IDs de buses de prueba
  const mockIds = Array.from({ length: NUM_BUSES }).map((_, i) => `chaos_bus_${i}`);
  
  let successCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  console.log(`Generando ${NUM_BUSES} actualizaciones GPS en batches de ${BATCH_SIZE}...`);
  
  for (let i = 0; i < mockIds.length; i += BATCH_SIZE) {
    const batch = mockIds.slice(i, i + BATCH_SIZE);
    
    const requests = batch.map(async (id) => {
      // Simular leve movimiento GPS
      const lat = -34.9 + (Math.random() - 0.5) * 0.05;
      const lng = -56.1 + (Math.random() - 0.5) * 0.05;

      const payload = {
        estado_operativo: 'ACTIVO',
        pasajeros_actuales: Math.floor(Math.random() * 60),
        ubicacion_actual: { latitude: lat, longitude: lng },
        ultima_actualizacion: new Date().toISOString()
      };

      try {
        const response = await fetch(`${API_URL}/${id}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
      }
    });

    await Promise.all(requests);
    process.stdout.write(`\rEnviados: ${successCount + errorCount} / ${NUM_BUSES}`);
  }

  const endTime = Date.now();
  const latency = endTime - startTime;

  console.log(`\n\n✅ Load Test Completado`);
  console.log(`⏱️ Tiempo Total de Inserción (Batching): ${latency} ms`);
  console.log(`✔️ Éxitos: ${successCount}`);
  console.log(`❌ Errores: ${errorCount}`);
  
  if (errorCount === 0 && latency < 15000) {
    console.log(`\n🟢 STATUS: PASS (El puente Postgres soporta la concurrencia del Pico Metropolitano).`);
  } else {
    console.log(`\n🔴 STATUS: FAIL (El sistema tuvo tiempos muertos o de error. Revisar DB).`);
  }
}

runLoadTest();
