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
import fleetRoutes from './routes/fleetRoutes';

// Restored routes
import tenantRoutes from './routes/tenantRoutes';
import reportRoutes from './routes/reportRoutes';
import settingsRoutes from './routes/settingsRoutes';
import backupRoutes from './routes/backupRoutes';
import whatsappRoutes from './routes/whatsappRoutes';

import { runMigration, seedDatabase } from './setup_db';
import { whatsAppService } from './services/whatsappService';

// --- CRITICAL ERROR TRAP ---
process.on('uncaughtException', (err) => {
  console.error('🔥 [CRITICAL] UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 [CRITICAL] UNHANDLED REJECTION:', reason);
});

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = 'v20.0-CERTIFIED';
const BOOT_ID = Math.floor(Math.random() * 1000000).toString();

// 1. FAIL-FAST VALIDATION (CRITICAL FOR PRODUCTION)
console.log(`🚀 [BOOT] Starting System v${VERSION}`);

const requiredEnvs = ['DATABASE_URL', 'JWT_SECRET'];
const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

if (missingEnvs.length > 0) {
  console.error(`❌ [FATAL] Missing Critical Environment Variables: ${missingEnvs.join(', ')}`);
  console.error('   Application cannot start. Please configure these variables in Render/Railway.');
  process.exit(1);
}

// 2. MIDDLEWARE SETUP
console.log(`🌍 [BOOT] Env PORT: ${process.env.PORT} | Detected: ${PORT}`);

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

  // Full Feature Set
  app.use('/api/tenants', tenantRoutes);
  app.use('/api/fleet', fleetRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/backups', backupRoutes);
  app.use('/api/whatsapp', whatsappRoutes);

} catch (error) {
  console.error('❌ [ROUTING] Error registering routes:', error);
}

// Serve Frontend
const frontendPath = path.join(__dirname, '../../frontend/dist');

// Validate Frontend Build
if (fs.existsSync(frontendPath)) {
  // Aggressive Caching Strategy
  const staticOptions = {
    setHeaders: (res: express.Response, filePath: string) => {
      if (filePath.endsWith('.html')) {
        // NEVER cache index.html or other HTML files. Always revalidate.
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        // Cache assets (JS, CSS, Images) forever - filenames are hashed by Vite
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  };

  console.log(`✅ [STATIC] Serving Frontend from: ${frontendPath}`);
  app.use(express.static(frontendPath, staticOptions));

  // Catch-All for Client-Side Routing
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
} else {
  console.error(`❌ [STATIC] Frontend build NOT found at: ${frontendPath}`);
  console.error('   Make sure to run "npm run build" in the root directory.');
}

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

    // --- DEBUG: VERIFY DATABASE URL HOST ---
    try {
      const dbUrl = process.env.DATABASE_URL || '';
      const maskedUrl = dbUrl.replace(/:[^:@]*@/, ':****@');
      console.log(`🔍 [DEBUG] DATABASE_URL (Masked): ${maskedUrl}`);
      if (dbUrl.includes('ferrocarril')) {
        console.error('🚨 [CRITICAL] URL CONTAINS "FERROCARRIL" - TRANSLATION ERROR DETECTED!');
      }
    } catch (e) { /* ignore logging errors */ }
    // ---------------------------------------

    const prisma = new PrismaClient();
    await prisma.$connect();
    console.log('✅ [DB] Prisma Connected Successfully.');

    console.log('🔄 [MIGRATION] Checking migrations...');
    await runMigration();

    console.log('🔄 [SEED] Checking seeds...');
    await seedDatabase();

    console.log('🏁 [BOOT] Heavy tasks completed.');

    console.log('📱 [WHATSAPP] Starting service...');
    whatsAppService.start();

  } catch (error) {
    console.error('💥 [BOOT FAIL] Error during deferred boot:', error);
  }
}

export default app;
