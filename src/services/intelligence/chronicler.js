/**
 * CHRONOS-PRO: Servicio de Persistencia Histórica (Chronicler)
 * Proyecto: TransformaFacil / UCOT
 * Misión: Capturar el estado de la flota y competencia cada N minutos para análisis retrospectivo.
 */

const { initializeApp, cert, getApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Inicialización de Firebase (intentar obtener la app existente o inicializar)
let adminApp;
try {
  adminApp = getApp();
} catch {
  // Configuración para entorno local o Cloud Functions
  adminApp = initializeApp();
}

const db = getFirestore();
const BRIDGE_URL = 'http://localhost:3099/api/lines/ucot';

async function runSnapshot() {
  console.log(`[${new Date().toISOString()}] 📸 Iniciando captura de estado global...`);
  
  try {
    // 1. Obtener estado actual del bridge (que ya consulta STM)
    const res = await fetch(BRIDGE_URL);
    const data = await res.json();

    if (!data.ok) throw new Error("Bridge no respondió correctamente");

    // 2. Guardar el Snapshot Global
    const snapshotRef = await db.collection('historico_flota_snapshots').add({
      timestamp: new Date(),
      totalBuses: data.totalBuses,
      totalLineas: data.totalLineas,
      fuente: 'STM_ONLINE_VIA_BRIDGE'
    });

    console.log(`✅ Snapshot global guardado (ID: ${snapshotRef.id})`);

    // 3. Persistir detalles por línea para análisis de tendencias
    const batch = db.batch();
    for (const linea of data.lineas) {
      const detailRef = db.collection('historico_lineas').doc();
      batch.set(detailRef, {
        snapshotId: snapshotRef.id,
        linea: linea.linea,
        cantidad: linea.cantidad,
        timestamp: new Date(),
        // Guardamos solo resumen para no saturar Firestore (Plan FinOps)
        buses: linea.buses.map(b => ({
          id: b.codigoBus,
          lat: b.lat,
          lng: b.lng
        }))
      });
    }
    
    await batch.commit();
    console.log(`✅ Detalle de ${data.lineas.length} líneas guardado.`);

  } catch (err) {
    console.error(`❌ Error en Chronos-Pro:`, err.message);
  }
}

// Ejecutar cada 5 minutos (Ajuste según Plan FinOps para evitar costos excesivos)
const INTERVALO = 5 * 60 * 1000;
console.log(`🕒 Chronicler iniciado. Frecuencia: 5 min.`);
setInterval(runSnapshot, INTERVALO);
runSnapshot();
