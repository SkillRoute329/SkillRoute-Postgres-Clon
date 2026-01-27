
import admin, { db } from '../config/firebase';

async function verifySystem() {
    console.log("🕵️‍♂️ Iniciando Verificación de Sistemas (Backend/Admin Check)...");

    // 1. Verificación de Líneas
    try {
        const linesSnapshot = await db.collection('lines').count().get();
        const count = linesSnapshot.data().count;
        if (count > 0) {
            console.log(`✅ [DB] Colección 'lines': OK (${count} docs)`);
        } else {
            console.error(`❌ [DB] Colección 'lines': VACÍA`);
        }
    } catch (e) {
        console.error(`❌ [DB] Error verificando 'lines':`, e);
    }

    // 2. Verificación de Usuarios
    try {
        const usersSnapshot = await db.collection('users').where('email', '==', 'admin@transformafacil.com').get();
        if (!usersSnapshot.empty) {
            console.log(`✅ [DB] Usuario Admin: ENCONTRADO (ID: ${usersSnapshot.docs[0].id})`);
        } else {
            console.error(`❌ [DB] Usuario Admin: NO ENCONTRADO`);
        }
    } catch (e) {
        console.error(`❌ [DB] Error verificando 'users':`, e);
    }

    // 3. Verificación de Health (Self-check sim)
    // Esto es solo un log, la prueba real fue el curl anterior
    console.log("ℹ️ [API] Health Check: Ejecutado vía curl (ver output terminal).");

    process.exit(0);
}

if (require.main === module) {
    verifySystem().catch(console.error);
}
