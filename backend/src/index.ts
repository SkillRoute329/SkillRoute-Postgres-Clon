
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

// --- LOG DE VERIFICACIÓN OBLIGATORIO ---
console.log('🚀 INICIANDO VERSION 1.0.2 - UPDATE FORZADO 🚀');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- RUTA ABSOLUTA AL FRONTEND (Docker) ---
const frontendPath = '/app/frontend/dist';

// 1. Verificar existencia (Diagnóstico)
if (fs.existsSync(frontendPath)) {
  console.log(`✅ Frontend encontrado en: ${frontendPath}`);
  console.log('📂 Archivos:', fs.readdirSync(frontendPath));
} else {
  console.error(`❌ ERROR: No se encuentra frontend en ${frontendPath}`);
}

// 2. Servir estáticos
app.use(express.static(frontendPath));

// --- AQUÍ TUS RUTAS DE API ---
app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/system-config', systemConfigRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api', healthRoutes);

// 3. Catch-all para SPA (Al final de todo)
app.get('*', (req, res) => {
  console.log(`📥 Sirviendo index.html para: ${req.url}`);
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;

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

// Start Server Chain
runMigration()
  .then(seedDatabase)
  .then(() => {
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`📡 Servidor escuchando en puerto ${PORT}`);
      console.log(`🌍 Entorno: ${process.env.NODE_ENV}`);
    });
  });
