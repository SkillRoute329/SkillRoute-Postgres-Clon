const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function checkCartonesDetailed() {
  console.log('Querying for VERANO_2026 + HABIL...');
  const snapshot = await db
    .collection('cartones')
    .where('temporada', '==', 'VERANO_2026')
    .where('tipo_dia', '==', 'HABIL')
    .get();

  if (snapshot.empty) {
    console.log('❌ NO cartones found with VERANO_2026 + HABIL metadata!');

    console.log('Checking ALL documents in collection "cartones"...');
    const all = await db.collection('cartones').limit(5).get();
    all.forEach((doc) => {
      console.log(`ID: ${doc.id} | Data keys: ${Object.keys(doc.data()).join(', ')}`);
      console.log(`Linea stored: "${doc.data().linea}" | Servicio: "${doc.data().servicio}"`);
    });

    return;
  }

  console.log(`✅ Found ${snapshot.size} valid cartones!`);
  const first = snapshot.docs[0].data();
  console.log(`Example: ${first.nombre} (ID: ${snapshot.docs[0].id})`);
  console.log(`Paradas count: ${first.paradas.length}`);
}

checkCartonesDetailed().catch(console.error);
