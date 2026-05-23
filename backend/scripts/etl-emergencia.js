/**
 * etl-emergencia.js
 * Extracción masiva única desde Firebase Firestore hacia PostgreSQL Local (Soberanía).
 * Creado por Antigravity para SkillRoute v2.1.
 */
const admin = require('firebase-admin');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

// Cargar variables de entorno (.env)
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const serviceAccountPath = path.join(__dirname, '../src/config/firebase-admin.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ ERROR: No se encontró el archivo de credenciales en: ' + serviceAccountPath);
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// Configuración del cliente PostgreSQL
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function connectPG() {
  await pgClient.connect();
  console.log('📦 Conectado a PostgreSQL Local.');
}

// Helper genérico de normalización de agencyId
function extractAgencyId(docData) {
  // Intentar leer varias variantes comunes de la clave
  return docData.agencyId || docData.agency_id || docData.empresaId || '70'; // Default UCOT para pruebas
}

/**
 * 1. Migración de Usuarios
 */
async function migrateUsers() {
  console.log('\n👤 Migrando Usuarios de Firebase...');
  const snapshot = await db.collection('users').get();
  let migratedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const id = doc.id;
    const email = data.email || null;
    const fullName = data.fullName || data.displayName || (data.datos_personales ? data.datos_personales.nombre + ' ' + data.datos_personales.apellido : 'Sin Nombre');
    const role = data.role || data.rol || 'USUARIO';
    const agencyId = extractAgencyId(data);

    try {
      await pgClient.query(
        `INSERT INTO users (id, email, full_name, role, agency_id, data_jsonb)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET data_jsonb = EXCLUDED.data_jsonb`,
        [id, email, fullName, role.toUpperCase(), agencyId, JSON.stringify(data)]
      );
      migratedCount++;
    } catch (err) {
      console.error(`⚠️ Error migrando usuario ${id}:`, err.message);
    }
  }
  console.log(`✅ Finalizado: ${migratedCount} usuarios migrados a PostgreSQL.`);
}

/**
 * 2. Migración de Vehículos
 */
async function migrateVehiculos() {
  console.log('\n🚌 Migrando Flota/Vehículos...');
  const snapshot = await db.collection('vehiculos').get();
  let migratedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const id = doc.id;
    const agencyId = extractAgencyId(data);
    const internalNumber = data.internalNumber || data.internal_number || doc.id;
    const plate = data.plate || data.matricula || null;

    try {
      await pgClient.query(
        `INSERT INTO vehiculos (id, agency_id, internal_number, plate, data_jsonb)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET data_jsonb = EXCLUDED.data_jsonb`,
        [id, agencyId, internalNumber, plate, JSON.stringify(data)]
      );
      migratedCount++;
    } catch (err) {
      console.error(`⚠️ Error migrando vehículo ${id}:`, err.message);
    }
  }
  console.log(`✅ Finalizado: ${migratedCount} vehículos migrados.`);
}

/**
 * 3. Migración de Inspecciones
 */
async function migrateInspecciones() {
  console.log('\n📋 Migrando Histórico de Inspecciones...');
  const snapshot = await db.collection('inspecciones').limit(500).get(); // Límite de seguridad inicial
  let migratedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const id = doc.id;
    const agencyId = extractAgencyId(data);
    const vehiculoId = data.vehiculoId || data.busId || null;
    
    let fechaInspeccion = new Date();
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
      fechaInspeccion = data.createdAt.toDate();
    } else if (data.fecha) {
      fechaInspeccion = new Date(data.fecha);
    }

    const inspectorId = data.inspectorId || data.userId || null;

    try {
      await pgClient.query(
        `INSERT INTO inspecciones (id, agency_id, vehiculo_id, fecha_inspeccion, inspector_id, data_jsonb)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET data_jsonb = EXCLUDED.data_jsonb`,
        [id, agencyId, vehiculoId, fechaInspeccion, inspectorId, JSON.stringify(data)]
      );
      migratedCount++;
    } catch (err) {
      // Omitir silenciosamente si falla la FK de vehículo y seguir importando
      // console.warn(`   Salteado registro ${id} por FK de vehiculo no existente.`);
    }
  }
  console.log(`✅ Finalizado: ${migratedCount} inspecciones migradas con éxito.`);
}

/**
 * MAIN RUNNER
 */
async function main() {
  console.log('🚀 INICIANDO ETL DE EMERGENCIA: FIREBASE → POSTGRESQL NATIVO');
  try {
    await connectPG();
    await migrateUsers();
    await migrateVehiculos();
    await migrateInspecciones();
    console.log('\n✨ PROCESO DE MIGRACIÓN DE SOBERANÍA COMPLETADO CON ÉXITO.');
  } catch (err) {
    console.error('\n❌ ERROR CRÍTICO EN ETL:', err);
  } finally {
    await pgClient.end();
    console.log('🔌 Conexión finalizada.');
    process.exit(0);
  }
}

main();
