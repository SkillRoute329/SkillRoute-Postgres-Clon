import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import pool from './db';

// Routes
import authRoutes from './routes/authRoutes';
import shiftRoutes from './routes/shiftRoutes';
import categoryRoutes from './routes/categoryRoutes';
import notificationRoutes from './routes/notificationRoutes';
import userRoutes from './routes/userRoutes';
import systemConfigRoutes from './routes/systemConfigRoutes';
import whatsappRoutes from './routes/whatsappRoutes';
import { ensureSchemaIntegrity } from './utils/schemaFixer';

// Cargar env vars
dotenv.config();
console.log('🔥 VERSIÓN 3.6 - BLIND CASE FIX (Unquoted) 🔥');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- RUTA DE SALUD (CRÍTICA PARA EL BOT) ---
app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    res.json({ status: 'ok', db: 'connected', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', db: err.message });
  }
});

app.get('/api/version', (req, res) => {
  res.json({
    version: '1.3.4',
    timestamp: new Date().toISOString(),
    desc: 'Deep Diagnostic Build'
  });
});

// --- API ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/system-config', systemConfigRoutes);
app.use('/api/whatsapp', whatsappRoutes);
// app.use('/api', healthRoutes); // Covered by custom check above

// --- SERVICIO DE FRONTEND (A PRUEBA DE FALLOS) ---
const FRONTEND_PATH = '/app/frontend/dist';
const FRONTEND_INDEX = path.join(FRONTEND_PATH, 'index.html');

if (fs.existsSync(FRONTEND_PATH)) {
  console.log(`✅ [STATIC] Frontend detectado en: ${FRONTEND_PATH}`);
  app.use(express.static(FRONTEND_PATH));

  // Catch-all para SPA: Si no es API, devuelve index.html
  app.get('*', (req, res) => {
    if (req.url.startsWith('/api')) {
      return res.status(404).json({ error: 'Endpoint API no encontrado' });
    }
    if (fs.existsSync(FRONTEND_INDEX)) {
      res.sendFile(FRONTEND_INDEX);
    } else {
      res.status(500).send('❌ ERROR CRÍTICO: Frontend build existe pero index.html no.');
    }
  });

} else {
  console.error(`❌ [STATIC] FATAL: La carpeta ${FRONTEND_PATH} NO EXISTE.`);
  // Crear ruta de emergencia
  app.get('/', (req, res) => res.send('BACKEND ONLINE - Frontend no encontrado. Revisa el Build.'));
}

// Internal Utils (Migration/Seed)
const runMigration = async () => {
  try {
    console.log('🔄 Checking for database migrations...');
    const migrationPath = path.resolve(__dirname, '../migration.sql');
    if (fs.existsSync(migrationPath)) {
      console.log(`📄 Found migration file at: ${migrationPath} (dirname: ${__dirname})`);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await pool.query(sql);
      console.log('✅ Database migration executed successfully.');
    } else {
      console.log('⚠️ No migration.sql file found. Skipping.');
    }
  } catch (error) {
    console.error('❌ Error executing database migration:', error);
  }
};

const seedDatabase = async () => {
  try {
    // --- DEFENSIVE CHECK: Ensure tables exist ---
    const tableCheck = await pool.query(`SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE  table_schema = 'public'
            AND    table_name   = 'Tenant'
        );`);

    if (!tableCheck.rows[0].exists) {
      console.error('⚠️ [SEED] TABLA "Tenant" NO ENCONTRADA. Saltando seeding para evitar crash.');
      console.error('👉 Sugerencia: Revisa que migration.sql se haya copiado y ejecutado correctamente.');
      return;
    }

    const tenantRes = await pool.query('SELECT id FROM "Tenant" WHERE id = 1');
    if (tenantRes.rowCount === 0) {
      await pool.query(`INSERT INTO "Tenant" (id, name, slug, "isActive") VALUES (1, 'TransformaFacil', 'default', true)`);
    }
    const userRes = await pool.query('SELECT id FROM "User" WHERE "internalNumber" = $1', ['admin']);
    if (userRes.rowCount === 0) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('123456', salt);
      await pool.query(`INSERT INTO "User" ("tenantId", "internalNumber", "firstName", "lastName", "fullName", "passwordHash", "role", "isActive") VALUES (1, 'admin', 'Admin', 'System', 'Admin System', $1, 'Admin', true)`, [hash]);
      console.log('✅ Admin initialized.');
    }

    // --- SEED SUPERADMIN (329) ---
    const superAdminRes = await pool.query('SELECT id FROM "User" WHERE "internalNumber" = $1', ['329']);
    if (superAdminRes.rowCount === 0) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('123456', salt);
      await pool.query(`INSERT INTO "User" ("tenantId", "internalNumber", "firstName", "lastName", "fullName", "passwordHash", "role", "isActive") VALUES (1, '329', 'Super', 'Admin', 'Super Admin', $1, 'SuperAdmin', true)`, [hash]);
      console.log('✅ SuperAdmin (329) initialized.');
    }
  } catch (error) {
    console.error('❌ Error seeding:', error);
  }
};

// INICIO DEL PARCHE FORZADO
const runHotfix = async (pool: any) => {
  console.log("🚀 VERSIÓN 1.6 - INTENTO DE REPARACIÓN");
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS "Notification" (id SERIAL PRIMARY KEY, "userId" INTEGER REFERENCES "User"(id) ON DELETE CASCADE, message TEXT, read BOOLEAN DEFAULT FALSE, "createdAt" TIMESTAMP DEFAULT NOW());`);
    console.log("✅ Tabla Notification OK");
    await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(255);`);
    console.log("✅ Columna phoneNumber OK");
  } catch (e) { console.error("⚠️ Error en Hotfix (puede que ya existan):", e); }
};
// FIN DEL PARCHE

const startServer = async () => {
  // --- RUTA DE EMERGENCIA (Solicitada por Usuario) ---
  app.get('/api/emergency-fix-v1', async (req, res) => {
    try {
      const client = await pool.connect();
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
    } catch (error: any) {
      res.status(500).send("❌ ERROR: " + error.message);
    }
  });

  // --- DEBUG SCHEMA ENDPOINT ---
  app.get('/api/debug-schema', async (req, res) => {
    try {
      const debugData: any = {};
      const tables = ['User', 'Shift', 'ShiftCategory', 'Notification', 'Tenant'];
      // Check lowercase variants too just in case
      const allTables = [...tables, ...tables.map(t => t.toLowerCase())];

      const client = await pool.connect();
      for (const table of allTables) {
        const result = await client.query(
          `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name = $1`,
          [table]
        );
        if (result.rowCount > 0) {
          debugData[table] = result.rows.map((r: any) => r.column_name);
        }
      }
      client.release();
      res.json(debugData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  // --------------------------

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`📡 Servidor listo en puerto ${PORT}`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔢 Versión API: 3.3 (Prisma Map + Schema Diag)`);
  });
};

const diagnoseSchema = async () => {
  console.log("🔍 [DIAG] Analizando Esquema de Base de Datos...");
  try {
    const tables = ['User', 'Shift', 'Notification', 'user', 'shift', 'notification'];
    for (const table of tables) {
      const res = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`,
        [table]
      );
      if (res.rowCount > 0) {
        console.log(`📊 Tabla found: '${table}'`);
        console.log(JSON.stringify(res.rows.map((r: any) => r.column_name)));
      }
    }
  } catch (e) {
    console.error("❌ [DIAG] Error analizando esquema:", e);
  }
};
// Start Server Chain with Error Recovery
const boot = async () => {
  console.log("🚀 VERSIÓN 3.3 - PARCHE PRISMA ACTIVO");
  try {
    await diagnoseSchema(); // Run diagnostic first
    console.log('🚀 Iniciando secuencia de arranque...');
    await runMigration();
    await seedDatabase();
    console.log('✅ Migración y Seed completados.');
  } catch (err) {
    console.error('⚠️ Error en fase de migración/seed (Continuando arranque):', err);
  }

  // Always start server, even if DB setup failed temporarily
  startServer();
};

boot();
