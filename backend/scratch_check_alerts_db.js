const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'skillroute-core-prod' // Assuming standard project id
  });
}

const db = admin.firestore();

async function checkAlerts() {
  try {
    console.log('Querying 10 latest alerts...');
    const snap = await db.collection('alertas_regulacion')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    console.log(`Found ${snap.size} alerts.`);
    snap.forEach(doc => {
      const data = doc.data();
      const d = data.timestamp ? data.timestamp.toDate() : null;
      console.log(`ID: ${doc.id}`);
      console.log(`  Timestamp: ${d ? d.toISOString() : 'NONE'} (${d ? d.toLocaleString('es-UY') : ''})`);
      console.log(`  Tipo: ${data.tipo}`);
      console.log(`  Coche: ${data.coche_id} / Empresa ID: ${data.empresa_id}`);
    });
  } catch (err) {
    console.error('Error querying alerts:', err);
  }
}

checkAlerts();
