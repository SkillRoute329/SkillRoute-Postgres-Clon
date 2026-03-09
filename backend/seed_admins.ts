import * as admin from 'firebase-admin';
const serviceAccount = require('./src/config/firebase-admin.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function seedAdmins() {
  const admins = [
    {
      internalNumber: '329',
      fullName: 'UCOT Administrador',
      role: 'SuperAdmin',
      password: 'admin123',
      estado: 'activo',
    },
    {
      internalNumber: '0000',
      fullName: 'CEO UCOT',
      role: 'SuperAdmin',
      password: 'admin',
      estado: 'activo',
    },
  ];

  for (const a of admins) {
    const docId = `admin_${a.internalNumber}`;
    await db
      .collection('personal')
      .doc(docId)
      .set({
        ...a,
        createdAt: admin.firestore.Timestamp.now(),
      });
    console.log(`Seeded admin: ${a.internalNumber}`);
  }
}
seedAdmins().catch(console.error);
