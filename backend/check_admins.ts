import * as admin from 'firebase-admin';
const serviceAccount = require('./src/config/firebase-admin.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function check() {
  const ids = ['329', '0000'];
  for (const id of ids) {
    const snap = await db.collection('personal').where('internalNumber', '==', id).get();
    console.log(`Checking ${id}: Found ${snap.size}`);
    if (snap.size > 0) {
      console.log(JSON.stringify(snap.docs[0].data(), null, 2));
    }
  }
}
check().catch(console.error);
