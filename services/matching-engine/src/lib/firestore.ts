import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCP_PROJECT ?? 'ucot-gestor-cloud',
  });
}

export const db = admin.firestore();
export { admin };
