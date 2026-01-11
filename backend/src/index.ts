import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

// Import routes (Validated against file system)
import shiftRoutes from './routes/shiftRoutes';
import userRoutes from './routes/userRoutes';
import healthRoutes from './routes/healthRoutes';
import authRoutes from './routes/authRoutes';
import categoryRoutes from './routes/categoryRoutes';
import notificationRoutes from './routes/notificationRoutes';
import systemConfigRoutes from './routes/systemConfigRoutes';

// Commented out missing or temporarily disabled routes
// import tenantRoutes from './routes/tenantRoutes'; // MISSING FILE
// import reportRoutes from './routes/reportRoutes'; // MISSING FILE
// import settingsRoutes from './routes/settingsRoutes'; // MISSING FILE
// import backupRoutes from './routes/backupRoutes'; // MISSING FILE
// import whatsappRoutes from './routes/whatsappRoutes'; // OPTIONAL

import { runMigration, seedDatabase } from './migration';

// --- CRITICAL ERROR TRAP ---
process.on('uncaughtException', (err) => {
  console.error('🔥 [CRITICAL] UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 [CRITICAL] UNHANDLED REJECTION:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = '19.1-SAFE-BOOT';

// 1. IMMEDIATE LOGGING
console.log(`🚀 [BOOT] Initializing ${VERSION}...`);
console.log(`🌍 [BOOT] Env PORT: ${process.env.PORT}`);

// 2. MIDDLEWARE SETUP
app.use(cors());
app.use(express.json());

// 3. HEALTH CHECK (Priority #1)
app.get('/api/health', (req, res) => {
  console.log('💓 [HEALTH] Heartbeat from ' + req.ip);
  res.status(200).json({ status: 'ok', version: VERSION, step: 'early-boot' });
});

app.get('/api/version', (req, res) => {
  res.json({ version: VERSION });
});

// 4. ROUTE REGISTRATION
try {
  app.use('/api/auth', authRoutes);
  app.use('/api/shifts', shiftRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/system-config', systemConfigRoutes);
  app.use('/api/health-check', healthRoutes); // Renamed to avoid collision with /api/health

  // Missing routes commented out
  // app.use('/api/tenants', tenantRoutes);
  // app.use('/api/reports', reportRoutes);
  // app.use('/api/settings', settingsRoutes);
  // app.use('/api/backups', backupRoutes);
} catch (error) {
  console.error('❌ [ROUTING] Error registering routes:', error);
}

// Serve Frontend
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  }
});

// 5. START SERVER IMMEDIATELY (Don't wait for DB)
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`✅ [SERVER] LISTENING ON PORT ${PORT} (Early Bind)`);
  deferredBoot();
});

async function deferredBoot() {
  console.log('⏳ [BOOT] Starting deferred initialization tasks in 2 seconds...');
  await new Promise(r => setTimeout(r, 2000));

  try {
    console.log('🔄 [DB] Connecting to Prisma...');
    const prisma = new PrismaClient();
    await prisma.$connect();
    console.log('✅ [DB] Prisma Connected Successfully.');

    console.log('🔄 [MIGRATION] Checking migrations...');
    await runMigration();

    console.log('🔄 [SEED] Checking seeds...');
    await seedDatabase();

    console.log('🏁 [BOOT] Heavy tasks completed.');

  } catch (error) {
    console.error('💥 [BOOT FAIL] Error during deferred boot:', error);
  }
}

export default app;
