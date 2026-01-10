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

import fs from 'fs';
import path from 'path';
import pool from './db';

const runMigration = async () => {
  try {
    console.log('🔄 Checking for database migrations...');
    // Look for migration.sql in project root (relative to dist/src or backend root)
    // Adjust path: from dist/index.js (backend/dist), root is ../../
    // If running with tsx (backend/src), root is ../../
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
    // We generally want to continue even if migration fails, or maybe exit? 
    // For self-healing, maybe continuing is better if it's just a duplicate column error, 
    // but if it's connection error, app won't work anyway.
  }
};

// Execute migration then start server
runMigration().then(() => {
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
    console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
  });
});
