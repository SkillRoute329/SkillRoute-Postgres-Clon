
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";

// Inicializar Admin (si no se hizo ya)
if (!admin.apps.length) {
    admin.initializeApp();
}

// Routes
import shiftRoutes from './routes/shiftRoutes';
import fleetRoutes from './routes/fleetRoutes';
import categoryRoutes from './routes/categoryRoutes';
import serviceDefinitionRoutes from './routes/serviceDefinitionRoutes';
import personnelRoutes from './routes/personnelRoutes';
import { authMiddleware } from './middleware/authMiddleware';

const app = express();
app.use(cors({ origin: true }));

// Support JSON bodies
app.use(express.json());

const apiRouter = express.Router();

apiRouter.get("/health", (req, res) => {
    res.json({ status: "ONLINE", mode: "SERVERLESS", timestamp: new Date() });
});

// Authenticated Routes
apiRouter.use('/shifts', authMiddleware, shiftRoutes);
apiRouter.use('/fleet', authMiddleware, fleetRoutes);
apiRouter.use('/categories', authMiddleware, categoryRoutes);
apiRouter.use('/service-definitions', authMiddleware, serviceDefinitionRoutes);

// RRHH Module
apiRouter.use('/personnel', authMiddleware, personnelRoutes);


// Mount API
app.use("/api", apiRouter);

export const api = functions.https.onRequest(app);
