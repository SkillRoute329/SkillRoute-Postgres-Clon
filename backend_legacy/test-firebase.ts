import * as path from 'path';
import * as fs from 'fs';
import admin from 'firebase-admin';

// Inicialización local si no existe src/config/firebase (mismo comportamiento)
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!admin.apps.length) {
  if (fs.existsSync(keyPath)) {
    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as admin.ServiceAccount;
    admin.initializeApp({ credential: admin.credential.cert(key) });
  } else {
    console.error(
      'serviceAccountKey.json no encontrado. Colócalo en backend_legacy/ o define GOOGLE_APPLICATION_CREDENTIALS.',
    );
    process.exit(1);
  }
}
const db = admin.firestore();

async function testConnection() {
  console.log('🧪 Iniciando Prueba de Conexión Firestore...');

  try {
    const testCol = db.collection('_healthcheck');
    const docRef = testCol.doc('migration_test');

    // 1. Escribir
    const timestamp = new Date().toISOString();
    await docRef.set({
      status: 'ONLINE',
      timestamp: timestamp,
      agent: 'Antigravity',
      message: 'Conexión verificada desde Backend Node.js',
    });
    console.log("✅ ESCRITURA Exitosa: Documento '_healthcheck/migration_test' creado.");

    // 2. Leer
    const doc = await docRef.get();
    if (doc.exists) {
      console.log('✅ LECTURA Exitosa:', doc.data());
    } else {
      console.error('❌ ERROR DE LECTURA: El documento no se encontró tras escribirlo.');
    }

    // 3. Limpieza (Opcional, lo dejamos para que lo veas en la consola)
    // await docRef.delete();

    console.log('🎉 PRUEBA COMPLETADA: El sistema está listo para migrar datos.');
  } catch (error) {
    console.error('❌ FALLO LA CONEXIÓN:', error);
    process.exit(1);
  }
}

testConnection();
