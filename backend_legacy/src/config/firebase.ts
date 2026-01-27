import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Inicialización de Firebase Admin SDK
// Se espera que las credenciales lleguen via Variables de Entorno en Producción (Railway/Firebase)
// O via archivo serviceAccountKey.json en Local.

let serviceAccount: any;

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '../../serviceAccountKey.json';

try {

    // Auto-detect: Environment Variable (Prod) vs Local File (Dev)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        // En desarrollo local, buscamos el archivo que el usuario acaba de colocar
        // try/catch para manejar si no existe sin crashear toda la app
        try {
            serviceAccount = require(serviceAccountPath);
        } catch (e) {
            console.warn('⚠️ No se encontró serviceAccountKey.json en backend/ ni variable de entorno.');
        }
    }

    if (serviceAccount && admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // La región de Firestore se define al crear la BD, el SDK se enruta solo.
            // Para Functions o Storage si se especifica región, pero Firestore es global/regional implícito.
        });
        console.log('🔥 Firebase Admin Initialized Successfully (Region: southamerica-east1 [Implícito])');
    }
} catch (error) {
    console.warn('⚠️ Firebase no se pudo inicializar. Verifica FIREBASE_SERVICE_ACCOUNT o serviceAccountKey.json');
    console.warn('   Si estás en migración, esto es normal hasta configurar las credenciales.');
}

export const db = admin.firestore();
export const auth = admin.auth();
export default admin;
