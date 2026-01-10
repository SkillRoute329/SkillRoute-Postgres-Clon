import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import shiftRoutes from './routes/shiftRoutes';
import categoryRoutes from './routes/categoryRoutes';
import notificationRoutes from './routes/notificationRoutes';
import userRoutes from './routes/userRoutes';
import systemConfigRoutes from './routes/systemConfigRoutes';
import whatsappRoutes from './routes/whatsappRoutes';
import healthRoutes from './routes/healthRoutes';
import bcrypt from 'bcrypt';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/system-config', systemConfigRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api', healthRoutes); // Mount at /api to match requested /api/_healthcheck

const PORT = process.env.PORT || 4000;

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TransformaFacil 2.0 Backend - alive!',
    date: new Date().toISOString()
  });
});

// Serve Frontend Static Files
const frontendPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// Handle React Routing (SPA) - Catch all requests usually excludes API paths
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
    return next();
  }
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Fallback or next if index.html not found (e.g. dev mode without build)
    next();
  }
});

import fs from 'fs';
import path from 'path';
import pool from './db';

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
      console.log('⚠️ No migration.sql file found at project root. Skipping migration.');
    }
  } catch (error) {
    console.error('❌ Error executing database migration:', error);
  }
};

const seedDatabase = async () => {
  try {
    console.log('🌱 Checking for database seeds...');

    // 1. Seed Tenant
    const tenantRes = await pool.query('SELECT id FROM "Tenant" WHERE id = 1');
    if (tenantRes.rowCount === 0) {
      console.log('🌱 Seeding default Tenant...');
      await pool.query(`
                INSERT INTO "Tenant" (id, name, slug, "isActive")
                VALUES (1, 'TransformaFacil', 'default', true)
            `);
    }

    // 2. Seed Admin User
    const userRes = await pool.query('SELECT id FROM "User" WHERE "internalNumber" = $1', ['admin']);
    if (userRes.rowCount === 0) {
      console.log('🌱 Seeding Admin User...');
      // Hash for '123456'
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('123456', salt);

      await pool.query(`
                INSERT INTO "User" ("tenantId", "internalNumber", "firstName", "lastName", "fullName", "passwordHash", "role", "isActive")
                VALUES (1, 'admin', 'Admin', 'System', 'Admin System', $1, 'Admin', true)
             `, [hash]);
      console.log('✅ Admin user created (user: admin, pass: 123456)');
    } else {
      console.log('ℹ️ Admin user already exists.');
    }

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  }
};

// Execute migration, then seed, then start server
runMigration()
  .then(seedDatabase)
  .then(() => {
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 Servidor accesible en http://0.0.0.0:${PORT}`);
      console.log(`ℹ️  Listening on all network interfaces (0.0.0.0)`);
      console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
    });
  });
