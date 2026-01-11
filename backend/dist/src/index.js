"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const shiftRoutes_1 = __importDefault(require("./routes/shiftRoutes"));
const categoryRoutes_1 = __importDefault(require("./routes/categoryRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const systemConfigRoutes_1 = __importDefault(require("./routes/systemConfigRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes
app.use('/api/auth', authRoutes_1.default);
app.use('/api/shifts', shiftRoutes_1.default);
app.use('/api/categories', categoryRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/system-config', systemConfigRoutes_1.default);
const PORT = process.env.PORT || 4000;
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'TransformaFacil 2.0 Backend - alive!',
        date: new Date().toISOString()
    });
});
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
    console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
});
//# sourceMappingURL=index.js.map