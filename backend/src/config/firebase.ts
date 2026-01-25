import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Inicialización de Firebase Admin SDK
// Se espera que las credenciales lleguen via Variables de Entorno en Producción (Railway/Firebase)
// O via archivo serviceAccountKey.json en Local.

let serviceAccount: any;

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Opción 1: JSON stringificado en variable de entorno (Producción)
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        // Opción 2: Archivo local (Desarrollo)
        // Nota: El usuario debe colocar este archivo manualmente y NO subirlo a Git
        serviceAccount = require('../../serviceAccountKey.json');
    }

    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // databaseURL: "https://<YOUR-PROJECT-ID>.firebaseio.com" // Opcional para Firestore
        });
        console.log('🔥 Firebase Admin Initialized Successfully');
    }
} catch (error) {
    console.warn('⚠️ Firebase no se pudo inicializar. Verifica FIREBASE_SERVICE_ACCOUNT o serviceAccountKey.json');
    console.warn('   Si estás en migración, esto es normal hasta configurar las credenciales.');
}

export const db = admin.firestore();
export const auth = admin.auth();
export default admin;
