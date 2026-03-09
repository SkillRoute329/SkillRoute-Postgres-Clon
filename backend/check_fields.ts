import * as admin from 'firebase-admin';
const serviceAccount = require('./src/config/firebase-admin.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function check() {
  const snap = await db.collection('personal').where('internalNumber', '!=', '').limit(5).get();
  console.log(`Documents with internalNumber: ${snap.size}`);
  snap.docs.forEach((d) => console.log(d.id, d.data().internalNumber));

  const snap2 = await db.collection('personal').where('legajo', '!=', '').limit(5).get();
  console.log(`Documents with legajo: ${snap2.size}`);
}
check().catch(console.error);
