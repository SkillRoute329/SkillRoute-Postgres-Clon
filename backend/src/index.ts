console.error('🔥 [BOOT] SYSTEM STARTING... IF YOU SEE THIS, ENTRY POINT IS REACHED.');
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
// import whatsappRoutes from './routes/whatsappRoutes';
// import { whatsAppService } from './services/whatsappService';

// Load env vars
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = '18.6-NO-WHATSAPP';

console.error(`🔥 [BOOT] Version: ${VERSION}`);
console.error(`🔥 [BOOT] PORT Env: ${process.env.PORT}`);
console.log(`🔌 [INIT] Final PORT being used: ${PORT}`);

app.use(cors());
app.use(express.json());

// --- CRITICAL: START LISTENING ASAP FOR RAILWAY HEALTHCHECK ---
console.log('🔌 [INIT] Attempting to listen...');
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`📡 [SERVER] LISTENING ON PORT ${PORT} - VERSION ${VERSION}`);
});

// --- BASE ROUTES ---
app.get('/api/health', (req, res) => {
  console.log('📡 [HEALTH] Health check received from ' + req.ip);
  try {
    res.status(200).json({ status: 'ok', server: 'TransformaFacil', version: VERSION });
  } catch (error) {
    console.error('❌ [HEALTH] Error sending response:', error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
});

app.get('/api/version', (req, res) => {
  res.json({
    version: VERSION,
    timestamp: new Date().toISOString(),
    desc: 'Stable Build - Asynchronous Boot'
  });
});

// --- API ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/system-config', systemConfigRoutes);
// app.use('/api/whatsapp', whatsappRoutes);

// --- FRONTEND SERVICE ---
const FRONTEND_PATH = path.join(process.cwd(), '../frontend/dist');
const FRONTEND_INDEX = path.join(FRONTEND_PATH, 'index.html');

if (fs.existsSync(FRONTEND_PATH)) {
  console.log(`✅ [STATIC] Serving frontend from: ${FRONTEND_PATH}`);
  app.use(express.static(FRONTEND_PATH));
  app.get('*', (req, res) => {
    if (req.url.startsWith('/api')) return res.status(404).json({ error: 'API endpoint not found' });
    if (fs.existsSync(FRONTEND_INDEX)) res.sendFile(FRONTEND_INDEX);
    else res.status(500).send('❌ ERROR: build index.html missing.');
  });
} else {
  console.error(`❌ [STATIC] Frontend folder NOT found at ${FRONTEND_PATH}`);
  app.get('/', (req, res) => res.send(`BACKEND ONLINE (${VERSION}) - Frontend missing. Run build.`));
}

// --- ASYNCHRONOUS BOOT OPERATIONS ---
const runMigration = async () => {
  try {
    const migrationPath = path.resolve(__dirname, '../migration.sql');
    if (fs.existsSync(migrationPath)) {
      console.log('🔄 [BOOT] Executing migration.sql...');
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await pool.query(sql);
      console.log('✅ [BOOT] Migration success.');
    }
  } catch (error) {
    console.error('❌ [BOOT] Migration error:', error);
  }
};

const seedDatabase = async () => {
  try {
    console.log('🔄 [BOOT] Seeding database...');
    const tenantRes = await pool.query('SELECT id FROM "Tenant" WHERE id = 1');
    if (tenantRes.rowCount === 0) {
      await pool.query(`INSERT INTO "Tenant" (id, name, slug, "isActive") VALUES (1, 'TransformaFacil', 'default', true)`);
    }
    console.log('✅ [BOOT] Seeding success.');
  } catch (error) {
    console.error('❌ [BOOT] Seeding error:', error);
  }
};

const boot = async () => {
  console.log(`🚀 [BOOT] Starting background operations for ${VERSION}...`);
  // Run these but don't block the healthcheck
  await runMigration();
  await seedDatabase();
  // whatsAppService.start();
  console.log('🏁 [BOOT] Background operations completed.');
};

// Fire build operations in background
boot().catch(err => console.error('🔥 [FATAL] Boot sequence failed:', err));
