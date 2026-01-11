"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("./db"));
// Routes
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const shiftRoutes_1 = __importDefault(require("./routes/shiftRoutes"));
const categoryRoutes_1 = __importDefault(require("./routes/categoryRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const systemConfigRoutes_1 = __importDefault(require("./routes/systemConfigRoutes"));
const whatsappRoutes_1 = __importDefault(require("./routes/whatsappRoutes"));
// Cargar env vars
dotenv_1.default.config();
console.log('💎 VERSIÓN 10.0 - NIX FORCE 💎');
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// --- RUTA DE SALUD (ULTRA LIGERA) ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'TransformaFacil-v8.5' });
});
app.get('/api/version', (req, res) => {
    try {
        const pkgPath = path_1.default.join(__dirname, '../package.json');
        const pkg = fs_1.default.existsSync(pkgPath) ? JSON.parse(fs_1.default.readFileSync(pkgPath, 'utf8')) : { version: '1.8.0' };
        res.json({
            version: '13.0-SIMPLE-FORCE',
            pkgVersion: pkg.version,
            timestamp: new Date().toISOString(),
            desc: 'Ultimate Stable - Safe Tables'
        });
    }
    catch (err) {
        res.json({ version: '13.0-SIMPLE-FORCE', error: 'Pkg not found' });
    }
});
app.get('/api/force-ping-v13', (req, res) => res.send('PONG-V13'));
// --- API ROUTES ---
app.use('/api/auth', authRoutes_1.default);
app.use('/api/shifts', shiftRoutes_1.default);
app.use('/api/categories', categoryRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/system-config', systemConfigRoutes_1.default);
app.use('/api/whatsapp', whatsappRoutes_1.default);
// --- SERVICIO DE FRONTEND ---
const FRONTEND_PATH = path_1.default.join(process.cwd(), '../frontend/dist');
const FRONTEND_INDEX = path_1.default.join(FRONTEND_PATH, 'index.html');
if (fs_1.default.existsSync(FRONTEND_PATH)) {
    console.log(`✅ [STATIC] Frontend detectado en: ${FRONTEND_PATH}`);
    app.use(express_1.default.static(FRONTEND_PATH));
    app.get('*', (req, res) => {
        if (req.url.startsWith('/api'))
            return res.status(404).json({ error: 'Endpoint API no encontrado' });
        if (fs_1.default.existsSync(FRONTEND_INDEX))
            res.sendFile(FRONTEND_INDEX);
        else
            res.status(500).send('❌ ERROR CRÍTICO: Frontend index.html no encontrado.');
    });
}
else {
    console.error(`❌ [STATIC] FATAL: La carpeta ${FRONTEND_PATH} NO EXISTE.`);
    app.get('/', (req, res) => res.send('BACKEND ONLINE - Frontend no encontrado. Revisa el Build.'));
}
// Internal Utils (Migration/Seed)
const runMigration = async () => {
    try {
        console.log('🔄 Checking for database migrations...');
        const migrationPath = path_1.default.resolve(__dirname, '../migration.sql');
        if (fs_1.default.existsSync(migrationPath)) {
            const sql = fs_1.default.readFileSync(migrationPath, 'utf8');
            await db_1.default.query(sql);
            console.log('✅ Database migration executed successfully.');
        }
        else {
            console.log('⚠️ No migration.sql file found. Skipping.');
        }
    }
    catch (error) {
        console.error('❌ Error executing database migration:', error);
    }
};
const seedDatabase = async () => {
    try {
        // Basic Seed
        const tenantRes = await db_1.default.query('SELECT id FROM "Tenant" WHERE id = 1');
        if (tenantRes.rowCount === 0) {
            await db_1.default.query(`INSERT INTO "Tenant" (id, name, slug, "isActive") VALUES (1, 'TransformaFacil', 'default', true)`);
        }
    }
    catch (error) {
        console.error('❌ Error seeding:', error);
    }
};
const diagnoseSchema = async () => {
    console.log("🔍 [DIAG] Analizando Esquema de Base de Datos...");
    try {
        const res = await db_1.default.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
        console.log(`📊 Tables: ${res.rows.map((r) => r.table_name).join(', ')}`);
    }
    catch (e) {
        console.error("❌ [DIAG] Error analizando esquema:", e);
    }
};
const startServer = () => {
    app.listen(Number(PORT), '0.0.0.0', () => {
        console.log(`📡 Servidor listo en puerto ${PORT}`);
        console.log(`🔢 Versión API: 8.5 (Debian Stable)`);
    });
};
const boot = async () => {
    console.log("🚀 VERSIÓN 8.5 - ULTIMATE STABLE");
    try {
        await diagnoseSchema();
        await runMigration();
        await seedDatabase();
    }
    catch (err) {
        console.error('⚠️ Error en fase de arranque:', err);
    }
    startServer();
};
boot();
