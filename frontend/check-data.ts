import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDPviXHSMncZQ_l3oMwIRoPWAOXOHeVeL4',
  authDomain: 'ucot-gestor-cloud.firebaseapp.com',
  projectId: 'ucot-gestor-cloud',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkData() {
  console.log('=== VERIFICACIÓN DE DATOS EN FIREBASE ===\n');

  const collections = ['vehiculos', 'fleet_vehicles', 'service_definitions', 'personal'];

  for (const colName of collections) {
    try {
      const snapshot = await getDocs(collection(db, colName));
      const docs = snapshot.docs.slice(0, 3).map((d) => ({ id: d.id, ...d.data() }));
      console.log(`📁 ${colName}: ${snapshot.size} documentos`);
      if (docs.length > 0) {
        console.log('   Ejemplo:', JSON.stringify(docs[0], null, 2).substring(0, 200) + '...\n');
      }
    } catch (e) {
      console.log(`❌ ${colName}: Error - ${e.message}\n`);
    }
  }
}

checkData();
