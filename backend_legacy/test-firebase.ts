
import admin, { db } from './src/config/firebase';

async function testConnection() {
    console.log("🧪 Iniciando Prueba de Conexión Firestore...");

    try {
        const testCol = db.collection('_healthcheck');
        const docRef = testCol.doc('migration_test');

        // 1. Escribir
        const timestamp = new Date().toISOString();
        await docRef.set({
            status: 'ONLINE',
            timestamp: timestamp,
            agent: 'Antigravity',
            message: 'Conexión verificada desde Backend Node.js'
        });
        console.log("✅ ESCRITURA Exitosa: Documento '_healthcheck/migration_test' creado.");

        // 2. Leer
        const doc = await docRef.get();
        if (doc.exists) {
            console.log("✅ LECTURA Exitosa:", doc.data());
        } else {
            console.error("❌ ERROR DE LECTURA: El documento no se encontró tras escribirlo.");
        }

        // 3. Limpieza (Opcional, lo dejamos para que lo veas en la consola)
        // await docRef.delete();

        console.log("🎉 PRUEBA COMPLETADA: El sistema está listo para migrar datos.");

    } catch (error) {
        console.error("❌ FALLO LA CONEXIÓN:", error);
        process.exit(1);
    }
}

testConnection();
