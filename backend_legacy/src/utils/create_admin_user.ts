
import admin, { db, auth } from '../config/firebase';

const MASTER_USER = {
    email: 'admin@transformafacil.com',
    password: 'admin123456',
    displayName: 'Super Admin UCOT',
    internalNumber: '0000',
    role: 'ADMIN'
};

async function createMasterUser() {
    console.log(`👤 Creando Usuario Maestro: ${MASTER_USER.email}...`);

    try {
        // 1. Crear en Firebase Authentication
        let userRecord;
        try {
            userRecord = await auth.getUserByEmail(MASTER_USER.email);
            console.log('   ℹ️ El usuario ya existe en Auth. Actualizando password...');
            await auth.updateUser(userRecord.uid, {
                password: MASTER_USER.password,
                displayName: MASTER_USER.displayName
            });
        } catch (e: any) {
            if (e.code === 'auth/user-not-found') {
                userRecord = await auth.createUser({
                    email: MASTER_USER.email,
                    password: MASTER_USER.password,
                    displayName: MASTER_USER.displayName
                });
                console.log('   ✅ Usuario creado en Auth.');
            } else {
                throw e;
            }
        }

        if (!userRecord) throw new Error("No se pudo obtener userRecord");

        // 2. Crear Perfil en Firestore (Equivalente a tabla Users)
        await db.collection('users').doc(userRecord.uid).set({
            uid: userRecord.uid,
            email: MASTER_USER.email,
            fullName: MASTER_USER.displayName,
            internalNumber: MASTER_USER.internalNumber,
            role: MASTER_USER.role,
            isActive: true,
            tenantId: 'ucot-1',
            createdAt: new Date().toISOString()
        }, { merge: true });

        console.log('   ✅ Perfil Admin creado en Firestore.');

        console.log('------------------------------------------------');
        console.log('🎉 USUARIO MAESTRO LISTO');
        console.log(`📧 Email: ${MASTER_USER.email}`);
        console.log(`🔑 Pass:  ${MASTER_USER.password}`);
        console.log('------------------------------------------------');

    } catch (error) {
        console.error('❌ Error creando usuario maestro:', error);
    }
}

if (require.main === module) {
    createMasterUser().catch(console.error);
}
