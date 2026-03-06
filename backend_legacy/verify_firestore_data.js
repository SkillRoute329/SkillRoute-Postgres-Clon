const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function checkCartones() {
  console.log('Checking cartones collection...');
  const snapshot = await db.collection('cartones').limit(10).get();

  if (snapshot.empty) {
    console.log('No cartones found in "cartones" collection.');
    return;
  }

  console.log(`Found ${snapshot.size} cartones. Samples:`);
  snapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(
      `Linea: ${data.linea}, Servicio: ${data.serviceNumber}, Temporada: ${data.temporada}, TipoDia: ${data.tipo_dia}`,
    );
    console.log('---');
  });
}

checkCartones().catch(console.error);
