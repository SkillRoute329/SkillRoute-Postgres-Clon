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
const bcryptjs_1 = __importDefault(require("bcryptjs"));
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
console.log('🔥 VERSIÓN 8.2 - SAFE TABLES 🔥');
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// --- RUTA DE SALUD (CRÍTICA PARA EL BOT) ---
app.get('/api/health', async (req, res) => {
    try {
        const client = await db_1.default.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        res.json({ status: 'ok', db: 'connected', time: result.rows[0].now });
    }
    catch (err) {
        res.status(500).json({ status: 'error', db: err.message });
    }
});
app.get('/api/version', (req, res) => {
    res.json({
        version: '7.0',
        timestamp: new Date().toISOString(),
        desc: 'Production Stable'
    });
});
// --- API ROUTES ---
app.use('/api/auth', authRoutes_1.default);
app.use('/api/shifts', shiftRoutes_1.default);
app.use('/api/categories', categoryRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/system-config', systemConfigRoutes_1.default);
app.use('/api/whatsapp', whatsappRoutes_1.default);
// app.use('/api', healthRoutes); // Covered by custom check above
// --- SERVICIO DE FRONTEND (A PRUEBA DE FALLOS) ---
const FRONTEND_PATH = '/app/frontend/dist';
const FRONTEND_INDEX = path_1.default.join(FRONTEND_PATH, 'index.html');
if (fs_1.default.existsSync(FRONTEND_PATH)) {
    console.log(`✅ [STATIC] Frontend detectado en: ${FRONTEND_PATH}`);
    app.use(express_1.default.static(FRONTEND_PATH));
    // Catch-all para SPA: Si no es API, devuelve index.html
    app.get('*', (req, res) => {
        if (req.url.startsWith('/api')) {
            return res.status(404).json({ error: 'Endpoint API no encontrado' });
        }
        if (fs_1.default.existsSync(FRONTEND_INDEX)) {
            res.sendFile(FRONTEND_INDEX);
        }
        else {
            res.status(500).send('❌ ERROR CRÍTICO: Frontend build existe pero index.html no.');
        }
    });
}
else {
    console.error(`❌ [STATIC] FATAL: La carpeta ${FRONTEND_PATH} NO EXISTE.`);
    // Crear ruta de emergencia
    app.get('/', (req, res) => res.send('BACKEND ONLINE - Frontend no encontrado. Revisa el Build.'));
}
// Internal Utils (Migration/Seed)
const runMigration = async () => {
    try {
        console.log('🔄 Checking for database migrations...');
        const migrationPath = path_1.default.resolve(__dirname, '../migration.sql');
        if (fs_1.default.existsSync(migrationPath)) {
            console.log(`📄 Found migration file at: ${migrationPath} (dirname: ${__dirname})`);
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
        // --- DEFENSIVE CHECK: Ensure tables exist ---
        const tableCheck = await db_1.default.query(`SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE  table_schema = 'public'
            AND    table_name   = 'Tenant'
        );`);
        if (!tableCheck.rows[0].exists) {
            console.error('⚠️ [SEED] TABLA "Tenant" NO ENCONTRADA. Saltando seeding para evitar crash.');
            console.error('👉 Sugerencia: Revisa que migration.sql se haya copiado y ejecutado correctamente.');
            return;
        }
        const tenantRes = await db_1.default.query('SELECT id FROM "Tenant" WHERE id = 1');
        if (tenantRes.rowCount === 0) {
            await db_1.default.query(`INSERT INTO "Tenant" (id, name, slug, "isActive") VALUES (1, 'TransformaFacil', 'default', true)`);
        }
        const userRes = await db_1.default.query('SELECT id FROM "User" WHERE "internalNumber" = $1', ['admin']);
        if (userRes.rowCount === 0) {
            const salt = await bcryptjs_1.default.genSalt(10);
            const hash = await bcryptjs_1.default.hash('123456', salt);
            await db_1.default.query(`INSERT INTO "User" ("tenantId", "internalNumber", "firstName", "lastName", "fullName", "passwordHash", "role", "isActive") VALUES (1, 'admin', 'Admin', 'System', 'Admin System', $1, 'Admin', true)`, [hash]);
            console.log('✅ Admin initialized.');
        }
        // --- SEED SUPERADMIN (329) ---
        const superAdminRes = await db_1.default.query('SELECT id FROM "User" WHERE "internalNumber" = $1', ['329']);
        if (superAdminRes.rowCount === 0) {
            const salt = await bcryptjs_1.default.genSalt(10);
            const hash = await bcryptjs_1.default.hash('123456', salt);
            await db_1.default.query(`INSERT INTO "User" ("tenantId", "internalNumber", "firstName", "lastName", "fullName", "passwordHash", "role", "isActive") VALUES (1, '329', 'Super', 'Admin', 'Super Admin', $1, 'SuperAdmin', true)`, [hash]);
            console.log('✅ SuperAdmin (329) initialized.');
        }
    }
    catch (error) {
        console.error('❌ Error seeding:', error);
    }
};
// INICIO DEL PARCHE FORZADO
const runHotfix = async (pool) => {
    console.log("🚀 VERSIÓN 1.6 - INTENTO DE REPARACIÓN");
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS "Notification" (id SERIAL PRIMARY KEY, "userId" INTEGER REFERENCES "User"(id) ON DELETE CASCADE, message TEXT, read BOOLEAN DEFAULT FALSE, "createdAt" TIMESTAMP DEFAULT NOW());`);
        console.log("✅ Tabla Notification OK");
        await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(255);`);
        console.log("✅ Columna phoneNumber OK");
    }
    catch (e) {
        console.error("⚠️ Error en Hotfix (puede que ya existan):", e);
    }
};
// FIN DEL PARCHE
const startServer = async () => {
    // --- RUTA DE EMERGENCIA (Solicitada por Usuario) ---
    app.get('/api/emergency-fix-v1', async (req, res) => {
        try {
            const client = await db_1.default.connect();
            // 1. Crear Tabla
            await client.query(`
            CREATE TABLE IF NOT EXISTS "Notification" (
                id SERIAL PRIMARY KEY,
                "userId" INTEGER REFERENCES "User"(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                read BOOLEAN DEFAULT FALSE,
                "createdAt" TIMESTAMP DEFAULT NOW()
            );
        `);
            // 2. Crear Columna
            await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='phoneNumber') THEN ALTER TABLE "User" ADD COLUMN "phoneNumber" VARCHAR(255); END IF; END $$;`);
            client.release();
            res.send("✅ ÉXITO: Base de datos reparada correctamente.");
        }
        catch (error) {
            res.status(500).send("❌ ERROR: " + error.message);
        }
    });
    // --- DEBUG SCHEMA ENDPOINT ---
    app.get('/api/debug-schema', async (req, res) => {
        try {
            const debugData = {};
            const tables = ['User', 'Shift', 'ShiftCategory', 'Notification', 'Tenant'];
            // Check lowercase variants too just in case
            const allTables = [...tables, ...tables.map(t => t.toLowerCase())];
            const client = await db_1.default.connect();
            for (const table of allTables) {
                const result = await client.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name = $1`, [table]);
                if (result.rowCount > 0) {
                    debugData[table] = result.rows.map((r) => r.column_name);
                }
            }
            client.release();
            res.json(debugData);
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    // --------------------------
    app.listen(Number(PORT), '0.0.0.0', () => {
        console.log(`📡 Servidor listo en puerto ${PORT}`);
        console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔢 Versión API: 4.2 (Alpine Fixed)`);
    });
};
const diagnoseSchema = async () => {
    console.log("🔍 [DIAG] Analizando Esquema de Base de Datos...");
    try {
        const tables = ['User', 'Shift', 'Notification', 'user', 'shift', 'notification'];
        for (const table of tables) {
            const res = await db_1.default.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`, [table]);
            if (res.rowCount > 0) {
                console.log(`📊 Tabla found: '${table}'`);
                console.log(JSON.stringify(res.rows.map((r) => r.column_name)));
            }
        }
    }
    catch (e) {
        console.error("❌ [DIAG] Error analizando esquema:", e);
    }
};
// Start Server Chain with Error Recovery
const boot = async () => {
    console.log("🚀 VERSIÓN 8.2 - SAFE TABLES (Quoted Tables + Lowercase Cols)");
    try {
        await diagnoseSchema(); // Run diagnostic first
        console.log('🚀 Iniciando secuencia de arranque...');
        await runMigration();
        await seedDatabase();
        console.log('✅ Migración y Seed completados.');
    }
    catch (err) {
        console.error('⚠️ Error en fase de migración/seed (Continuando arranque):', err);
    }
    // Always start server, even if DB setup failed temporarily
    startServer();
};
boot();
