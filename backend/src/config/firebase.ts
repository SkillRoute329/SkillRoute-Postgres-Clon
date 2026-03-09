import * as admin from 'firebase-admin';
import path from 'path';

const serviceAccount = require(path.join(__dirname, '../config/firebase-admin.json'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://ucot-gestor-cloud.firebaseio.com',
  });
}

export const db = admin.firestore();
export const auth = admin.auth();
