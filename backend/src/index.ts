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
import departmentRoutes from './routes/departmentRoutes';
import maintenanceRoutes from './routes/maintenanceRoutes';
import discountRoutes from './routes/discountRoutes';
import serviceDefinitionRoutes from './routes/serviceDefinitionRoutes';
import bulletinRoutes from './routes/bulletinRoutes';
import penaltyRoutes from './routes/penaltyRoutes';
import roadAlertRoutes from './routes/roadAlertRoutes';
import dataImportRoutes from './routes/dataImportRoutes';
import driverRoutes from './routes/driverRoutes'; // Imported
import universalRoutes from './routes/universalRoutes';
import uploadRoutes from './routes/uploadRoutes';
import navigationRoutes from './routes/navigationRoutes';
import emergencyRoutes from './routes/emergencyRoutes';
import systemHealthRoutes from './routes/systemHealthRoutes';

// Restored routes
import tenantRoutes from './routes/tenantRoutes';
import reportRoutes from './routes/reportRoutes';
import settingsRoutes from './routes/settingsRoutes';
import backupRoutes from './routes/backupRoutes';
import whatsappRoutes from './routes/whatsappRoutes';
import { debugForceSeed } from './controllers/serviceDefinitionController';

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
const PORT = process.env.PORT || 4000;
const VERSION = 'v10.0.0-GOLD-MASTER';
const BOOT_ID = Math.floor(Math.random() * 1000000).toString();
const BUILD_TIME = new Date().toISOString();

// 1. FAIL-FAST VALIDATION (CRITICAL FOR PRODUCTION)
import { SystemDNA } from './config/SystemDNA';

console.log(`🚀 [BOOT] Starting System v${VERSION}`);
console.log(`🧬 [DNA] Identity: ${SystemDNA.identity.codename} | Repo: ${SystemDNA.infrastructure.repository}`);

const requiredEnvs = ['DATABASE_URL', 'JWT_SECRET'];
const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

if (missingEnvs.length > 0) {
  console.error(`❌ [FATAL] Missing Critical Environment Variables: ${missingEnvs.join(', ')}`);
  console.error('   Application cannot start. Please configure these variables in Render/Railway.');
  process.exit(1);
}

// 2. MIDDLEWARE SETUP
import { telemetryMiddleware } from './middleware/telemetryMiddleware';
import { DoctorController } from './controllers/DoctorController';

console.log(`🌍 [BOOT] Env PORT: ${process.env.PORT} | Detected: ${PORT}`);

app.use(telemetryMiddleware); // Log incoming requests
app.use(cors({
  origin: true, // Universal Access (Mobile/Web/Hybrid) - Reflects Origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// DEBUGGER DE HEADERS
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') { // Reduce noise
    console.log(`[REQUEST] ${req.method} ${req.path}`);
    console.log('[HEADERS] Auth:', req.headers.authorization ? 'PRESENT' : 'MISSING');
  }
  next();
});

// Explicit 50mb limit for Large Photos (Base64)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve Uploads Static Directory (Persistent Storage)
const IS_RAILWAY = fs.existsSync('/app');
const STORAGE_ROOT = IS_RAILWAY ? '/app/uploads' : path.join(process.cwd(), 'uploads');

if (!fs.existsSync(STORAGE_ROOT)) {
  console.log(`📂 [BOOT] Creating Storage Root: ${STORAGE_ROOT}`);
  try { fs.mkdirSync(STORAGE_ROOT, { recursive: true }); } catch (e) { console.error('Error creating uploads dir:', e); }
}

console.log(`📂 [SERVER] Serving Static Uploads from: ${STORAGE_ROOT}`);
app.use('/uploads', express.static(STORAGE_ROOT));

// 3. HEALTH CHECK (Priority #1)
app.get('/api/health', (req, res) => {
  console.log('💓 [HEALTH] Heartbeat from ' + req.ip);
  res.status(200).json({
    status: 'ok',
    version: VERSION,
    bootId: BOOT_ID,
    buildTime: BUILD_TIME,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/doctor', DoctorController.checkHealth);

app.get('/api/version', (req, res) => {
  res.json({
    version: VERSION,
    buildTime: BUILD_TIME,
    bootId: BOOT_ID
  });
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
  // LOG DE LA VERDAD (BACKEND)
  app.use('/api/fleet/inspections', (req, res, next) => {
    console.log('--- INTENTO DE SUBIDA ---');
    console.log('Headers recibidos:', JSON.stringify(req.headers));
    console.log('Tiene Authorization?:', !!req.headers.authorization);
    next();
  });

  app.use('/api/fleet', fleetRoutes);
  app.use('/api/departments', departmentRoutes);
  app.use('/api/maintenance', maintenanceRoutes);
  app.use('/api/service-definitions', serviceDefinitionRoutes);
  app.use('/api/bulletins', bulletinRoutes);
  app.use('/api/penalties', penaltyRoutes);
  app.use('/api/road-alerts', roadAlertRoutes);
  app.use('/api/discounts', discountRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/backups', backupRoutes);
  app.use('/api/whatsapp', whatsappRoutes);

  // New Universal Import/Export Module
  app.use('/api/data-import', dataImportRoutes);
  app.use('/api/driver', driverRoutes);

  // File Uploads (Cloud Simulation)
  app.use('/api/upload', uploadRoutes);

  // Universal Polymorphic CRUD
  app.use('/api/universal', universalRoutes);
  app.use('/api/navigation', navigationRoutes);

  // Emergency Access
  app.use('/api/emergency', emergencyRoutes);

  // System Health & Diagnostics
  app.use('/api/system-health', systemHealthRoutes);


  // DEBUG ROUTES (EMERGENCY)
  app.get('/api/debug/force-seed', debugForceSeed);
  // /api/navigation/force-seed is now handled in navigationRoutes.ts

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

// Initialize Socket.IO
import { initSocket } from './services/socketService';
initSocket(server);

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

    // 🕵️ THE VALIDATOR (INTEGRITY CHECK)
    const { TheValidator } = await import('./scripts/TheValidator');
    await TheValidator.run();

    // 🛠️ AUTO-FIX SERVICE (DEEP CLEAN & PREP)
    const { AutoFixService } = await import('./services/AutoFixService');
    await AutoFixService.run();

    // 🤖 SELF-AWARENESS SERVICE (DNA Enforced)
    const { SelfAwarenessService } = await import('./services/SelfAwarenessService');
    await SelfAwarenessService.boot();

    console.log('🏁 [BOOT] Heavy tasks completed.');

    // --- SENTINEL PROTOCOL (Post-Deploy Check) ---
    console.log('🕵️ [SENTINEL] Verifying Frontend Health...');
    try {
      const fetch = (await import('node-fetch')).default;
      // Check local manifest availability
      const manifestUrl = `http://localhost:${PORT}/manifest.json`;
      console.log(`   -> Probing: ${manifestUrl}`);

      const res = await fetch(manifestUrl);
      if (res.ok) {
        console.log('✅ [SENTINEL] Frontend Logic OK. Manifest is accessible.');
      } else {
        console.error(`🚨 [SENTINEL] ALERT: Manifest returned ${res.status}. Triggering Auto-Repair...`);
        const { execSync } = require('child_process');
        // Attempt to run the asset script from root or relative
        try {
          // Adjust path as needed, assuming we are in backend/src or root
          // Current CWD is root of project usually in Railway, but let's try strict path
          const scriptPath = path.join(__dirname, '../../scripts/ensure-assets.js');
          if (fs.existsSync(scriptPath)) {
            execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
            console.log('🩹 [SENTINEL] Auto-Repair script executed.');
          } else {
            console.error('❌ [SENTINEL] Repair script NOT FOUND at ' + scriptPath);
          }
        } catch (patchErr) {
          console.error('❌ [SENTINEL] Auto-Repair Failed:', patchErr);
        }
      }
    } catch (err) {
      console.warn('⚠️ [SENTINEL] Could not verify frontend (Service might be asleep or busy):', err);
    }
    // ---------------------------------------------

    console.log('📱 [WHATSAPP] Starting service...');
    whatsAppService.start();

  } catch (error) {
    console.error('💥 [BOOT FAIL] Error during deferred boot:', error);
  }
}

export default app;
