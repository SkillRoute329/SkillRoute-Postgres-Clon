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
import healthRoutes from './routes/healthRoutes';

// Cargar env vars
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Middlewares Básicos
app.use(cors());
app.use(express.json());

// 2. RUTA DE DIAGNÓSTICO (Para saber que el server vive)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db_connected: true, timestamp: new Date() });
});

// --- API ROUTES (Antes de estáticos) ---
app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/system-config', systemConfigRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api', healthRoutes);

// ---------------------------------------------------------
// 3. SERVIR FRONTEND (Configuración Blindada)
// ---------------------------------------------------------
const FRONTEND_PATH = '/app/frontend/dist';

if (fs.existsSync(FRONTEND_PATH)) {
  console.log(`✅ [STATIC] Sirviendo Frontend desde: ${FRONTEND_PATH}`);

  // Servir archivos estáticos (JS, CSS, Imágenes)
  app.use(express.static(FRONTEND_PATH));

  // CUALQUIER otra ruta que no sea API -> Devolver index.html (Para React Router)
  app.get('*', (req, res) => {
    const indexPath = path.join(FRONTEND_PATH, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(500).send('❌ Error Crítico: index.html no encontrado.');
    }
  });

} else {
  console.error(`❌ [STATIC] ERROR FATAL: No encuentro la carpeta en ${FRONTEND_PATH}`);
  app.get('/', (req, res) => res.send('Backend Online (Frontend no encontrado en el servidor).'));
}

// Internal Utils (Migration/Seed)
const runMigration = async () => {
  try {
    console.log('🔄 Checking for database migrations...');
    const migrationPath = path.resolve(__dirname, '../../migration.sql');
    if (fs.existsSync(migrationPath)) {
      console.log(`📄 Found migration file at: ${migrationPath}`);
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
  } catch (error) {
    console.error('❌ Error seeding:', error);
  }
};

// 4. Arrancar Servidor (Con Migraciones)
runMigration()
  .then(seedDatabase)
  .then(() => {
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`📡 Servidor escuchando en puerto ${PORT}`);
      console.log(`🌍 Entorno: ${process.env.NODE_ENV}`);
    });
  });
