
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";

// Inicializar Admin (si no se hizo ya)
if (!admin.apps.length) {
    admin.initializeApp();
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Aquí importaríamos tus rutas reales.
// Por ahora, un endpoint de salud para confirmar que Serverless funciona.
app.get("/health", (req, res) => {
    res.json({ status: "ONLINE", mode: "SERVERLESS", timestamp: new Date() });
});

// TODO: Importar rutas de ../backend/src/routes cuando se estructure el monorepo
// app.use('/api', apiRoutes);

// Exportar la API como Cloud Function
export const api = functions.https.onRequest(app);
