import * as admin from 'firebase-admin';
import * as path from 'path';

const serviceAccount = require('./src/config/firebase-admin.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function checkUsers() {
  const snap = await db.collection('personal').limit(5).get();
  snap.docs.forEach((doc) => {
    console.log(`Document ID: ${doc.id}`);
    console.log('Data:', JSON.stringify(doc.data(), null, 2));
  });
}

checkUsers().catch(console.error);
