import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import pool from './db';

// Routes
import authRoutes from './routes/authRoutes';
import shiftRoutes from './routes/shiftRoutes';
import categoryRoutes from './routes/categoryRoutes';
import notificationRoutes from './routes/notificationRoutes';
import userRoutes from './routes/userRoutes';
import systemConfigRoutes from './routes/systemConfigRoutes';
import whatsappRoutes from './routes/whatsappRoutes';

// Cargar env vars
dotenv.config();
console.log('💎 VERSIÓN 10.0 - NIX FORCE 💎');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- RUTA DE SALUD (ULTRA LIGERA) ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'TransformaFacil-v8.5' });
});

app.get('/api/version', (req, res) => {
  try {
    const pkgPath = path.join(__dirname, '../package.json');
    const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { version: '1.8.0' };
    res.json({
      version: '10.0-NIX-FORCE',
      pkgVersion: pkg.version,
      timestamp: new Date().toISOString(),
      desc: 'Ultimate Stable - Safe Tables'
    });
  } catch (err) {
    res.json({ version: '8.5', error: 'Pkg not found' });
  }
});

// --- API ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/system-config', systemConfigRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// --- SERVICIO DE FRONTEND ---
const FRONTEND_PATH = path.join(process.cwd(), '../frontend/dist');
const FRONTEND_INDEX = path.join(FRONTEND_PATH, 'index.html');

if (fs.existsSync(FRONTEND_PATH)) {
  console.log(`✅ [STATIC] Frontend detectado en: ${FRONTEND_PATH}`);
  app.use(express.static(FRONTEND_PATH));
  app.get('*', (req, res) => {
    if (req.url.startsWith('/api')) return res.status(404).json({ error: 'Endpoint API no encontrado' });
    if (fs.existsSync(FRONTEND_INDEX)) res.sendFile(FRONTEND_INDEX);
    else res.status(500).send('❌ ERROR CRÍTICO: Frontend index.html no encontrado.');
  });
} else {
  console.error(`❌ [STATIC] FATAL: La carpeta ${FRONTEND_PATH} NO EXISTE.`);
  app.get('/', (req, res) => res.send('BACKEND ONLINE - Frontend no encontrado. Revisa el Build.'));
}

// Internal Utils (Migration/Seed)
const runMigration = async () => {
  try {
    console.log('🔄 Checking for database migrations...');
    const migrationPath = path.resolve(__dirname, '../migration.sql');
    if (fs.existsSync(migrationPath)) {
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
    // Basic Seed
    const tenantRes = await pool.query('SELECT id FROM "Tenant" WHERE id = 1');
    if (tenantRes.rowCount === 0) {
      await pool.query(`INSERT INTO "Tenant" (id, name, slug, "isActive") VALUES (1, 'TransformaFacil', 'default', true)`);
    }
  } catch (error) {
    console.error('❌ Error seeding:', error);
  }
};

const diagnoseSchema = async () => {
  console.log("🔍 [DIAG] Analizando Esquema de Base de Datos...");
  try {
    const res = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    console.log(`📊 Tables: ${res.rows.map((r: any) => r.table_name).join(', ')}`);
  } catch (e) {
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
  } catch (err) {
    console.error('⚠️ Error en fase de arranque:', err);
  }
  startServer();
};

boot();
