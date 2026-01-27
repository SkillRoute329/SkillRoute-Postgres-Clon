
import admin, { auth, db } from '../config/firebase';

async function verifyLoginIntegrity() {
    console.log("🕵️ Iniciando Diagnóstico de Login...");
    const email = 'admin@transformafacil.com';

    try {
        // 1. Verificar Auth
        console.log(`1️⃣ Verificando usuario en Auth: ${email}`);
        const userRecord = await auth.getUserByEmail(email);
        console.log(`   ✅ Usuario encontrado. UID: ${userRecord.uid}`);
        console.log(`   🔐 Proveedores: ${userRecord.providerData.map(p => p.providerId).join(', ')}`);

        if (!userRecord.emailVerified) {
            console.warn("   ⚠️ Email no verificado (No crítico para Admin, pero nota).");
        }

        // 2. Verificar Firestore
        console.log(`2️⃣ Verificando perfil en Firestore (Colección 'users')...`);
        const userDoc = await db.collection('users').doc(userRecord.uid).get();

        if (userDoc.exists) {
            const data = userDoc.data();
            console.log(`   ✅ Perfil encontrado.`);
            console.log(`   👤 Rol: ${data?.role}`);
            console.log(`   🏢 Tenant: ${data?.tenantId}`);

            if (data?.role !== 'ADMIN' && data?.role !== 'SuperAdmin') {
                console.error("   ❌ ERROR CRÍTICO: El usuario existe pero NO es ADMIN. El login le denegará acceso al Dashboard.");
            } else {
                console.log("   🎉 INTEGRIDAD OK: El usuario tiene permisos de Administrador.");
            }
        } else {
            console.error("   ❌ ERROR CRÍTICO: Usuario existe en Auth pero NO tiene perfil en Firestore.");
            console.error("      El frontend intentará usar el 'Fallback de Emergencia', pero es riesgoso.");
        }

    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            console.error("❌ FATAL: El usuario 'admin@transformafacil.com' NO EXISTE en Firebase Auth.");
        } else {
            console.error("❌ Error desconocido:", error);
        }
    }
}

if (require.main === module) {
    verifyLoginIntegrity().catch(console.error);
}
