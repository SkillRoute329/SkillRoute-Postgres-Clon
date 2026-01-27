"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
// Inicializar Admin (si no se hizo ya)
if (!admin.apps.length) {
    admin.initializeApp();
}
// Routes
const shiftRoutes_1 = __importDefault(require("./routes/shiftRoutes"));
const fleetRoutes_1 = __importDefault(require("./routes/fleetRoutes"));
const categoryRoutes_1 = __importDefault(require("./routes/categoryRoutes"));
const serviceDefinitionRoutes_1 = __importDefault(require("./routes/serviceDefinitionRoutes"));
const personnelRoutes_1 = __importDefault(require("./routes/personnelRoutes"));
const authMiddleware_1 = require("./middleware/authMiddleware");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true }));
// Support JSON bodies
app.use(express_1.default.json());
const apiRouter = express_1.default.Router();
apiRouter.get("/health", (req, res) => {
    res.json({ status: "ONLINE", mode: "SERVERLESS", timestamp: new Date() });
});
// Authenticated Routes
apiRouter.use('/shifts', authMiddleware_1.authMiddleware, shiftRoutes_1.default);
apiRouter.use('/fleet', authMiddleware_1.authMiddleware, fleetRoutes_1.default);
apiRouter.use('/categories', authMiddleware_1.authMiddleware, categoryRoutes_1.default);
apiRouter.use('/service-definitions', authMiddleware_1.authMiddleware, serviceDefinitionRoutes_1.default);
// RRHH Module
apiRouter.use('/personnel', authMiddleware_1.authMiddleware, personnelRoutes_1.default);
// Mount API
app.use("/api", apiRouter);
exports.api = functions.https.onRequest(app);
//# sourceMappingURL=index.js.map