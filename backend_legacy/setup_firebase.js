/**
 * Script de configuración inicial de Firebase para TransformaFacil 2.0
 * - Crea el usuario SuperAdmin (329@ucot.internal / admin123) en Firebase Auth
 * - Crea su documento en Firestore con rol SuperAdmin
 * - Siembra datos básicos de vehículos de prueba
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'ucot-gestor-cloud',
});

const auth = admin.auth();
const db = admin.firestore();

const SUPERADMIN_EMAIL = '329@ucot.internal';
const SUPERADMIN_PASSWORD = 'admin123';
const SUPERADMIN_INTERNO = '329';

async function crearOActualizarUsuario() {
  console.log('\n🔑 === PASO 1: Usuario SuperAdmin en Firebase Auth ===');
  let uid;

  try {
    // Intentar obtener el usuario si ya existe
    const existing = await auth.getUserByEmail(SUPERADMIN_EMAIL);
    uid = existing.uid;
    console.log(`  ✅ Usuario ya existe. UID: ${uid}`);
    // Actualizar contraseña por las dudas
    await auth.updateUser(uid, {
      password: SUPERADMIN_PASSWORD,
      displayName: 'SuperAdministrador UCOT',
    });
    console.log(`  🔄 Contraseña actualizada a: ${SUPERADMIN_PASSWORD}`);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Crear nuevo usuario
      const newUser = await auth.createUser({
        email: SUPERADMIN_EMAIL,
        password: SUPERADMIN_PASSWORD,
        displayName: 'SuperAdministrador UCOT',
        emailVerified: true,
      });
      uid = newUser.uid;
      console.log(`  ✅ Usuario creado exitosamente. UID: ${uid}`);
    } else {
      throw err;
    }
  }

  return uid;
}

async function crearDocumentoFirestore(uid) {
  console.log('\n📄 === PASO 2: Documento del usuario en Firestore ===');

  const userDoc = {
    uid: uid,
    email: SUPERADMIN_EMAIL,
    rol: 'SuperAdmin',
    empresa: 'UCOT',
    datos_personales: {
      nombre: 'Super',
      apellido: 'Administrador',
    },
    datos_empresa: {
      legajo: SUPERADMIN_INTERNO,
      cargo: 'Administrador del Sistema',
      departamento: 'Sistemas',
    },
    activo: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection('users').doc(uid).set(userDoc, { merge: true });
  console.log(`  ✅ Documento creado en Firestore (collection: users, id: ${uid})`);
}

async function sembrarVehiculos() {
  console.log('\n🚌 === PASO 3: Sembrar vehículos de prueba ===');

  const vehiculos = [
    {
      vehicleNumber: '101',
      unitNumber: '101',
      status: 'OPERATIVO',
      type: 'OMNIBUS',
      brand: 'Volvo',
      model: 'B7RLE',
      year: 2018,
      plate: 'ABC-1234',
    },
    {
      vehicleNumber: '102',
      unitNumber: '102',
      status: 'OPERATIVO',
      type: 'OMNIBUS',
      brand: 'Mercedes',
      model: 'OF-1721',
      year: 2019,
      plate: 'DEF-5678',
    },
    {
      vehicleNumber: '103',
      unitNumber: '103',
      status: 'MANTENIMIENTO',
      type: 'OMNIBUS',
      brand: 'Volvo',
      model: 'B7RLE',
      year: 2017,
      plate: 'GHI-9012',
    },
    {
      vehicleNumber: '104',
      unitNumber: '104',
      status: 'OPERATIVO',
      type: 'OMNIBUS',
      brand: 'Marcopolo',
      model: 'Viale',
      year: 2020,
      plate: 'JKL-3456',
    },
    {
      vehicleNumber: '105',
      unitNumber: '105',
      status: 'OPERATIVO',
      type: 'OMNIBUS',
      brand: 'Volvo',
      model: 'B7RLE',
      year: 2021,
      plate: 'MNO-7890',
    },
    {
      vehicleNumber: '106',
      unitNumber: '106',
      status: 'TALLER',
      type: 'OMNIBUS',
      brand: 'Mercedes',
      model: 'OF-1721',
      year: 2016,
      plate: 'PQR-2345',
    },
    {
      vehicleNumber: '107',
      unitNumber: '107',
      status: 'OPERATIVO',
      type: 'OMNIBUS',
      brand: 'Marcopolo',
      model: 'Viale DD',
      year: 2022,
      plate: 'STU-6789',
    },
    {
      vehicleNumber: '108',
      unitNumber: '108',
      status: 'OPERATIVO',
      type: 'OMNIBUS',
      brand: 'Volvo',
      model: 'B9TL',
      year: 2020,
      plate: 'VWX-0123',
    },
  ];

  const batch = db.batch();
  for (const v of vehiculos) {
    const ref = db.collection('vehicles').doc(`v_${v.vehicleNumber}`);
    batch.set(
      ref,
      { ...v, createdAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`  ✅ ${vehiculos.length} vehículos de prueba creados`);
}

async function sembrarAlertas() {
  console.log('\n⚠️  === PASO 4: Sembrar datos de alertas de vía ===');

  const alertas = [
    {
      tipo: 'OBRA_VIAL',
      titulo: 'Obra en Avda. 18 de Julio',
      descripcion: 'Corte parcial de calzada por obras de pavimentación',
      severidad: 'MEDIA',
      estado: 'ACTIVA',
      lineasAfectadas: ['21', '141', '340'],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      tipo: 'DESVIO',
      titulo: 'Desvío por evento en Estadio',
      descripcion: 'Desvío obligatorio por partido de fútbol',
      severidad: 'ALTA',
      estado: 'ACTIVA',
      lineasAfectadas: ['104', '109'],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  ];

  const batch = db.batch();
  for (let i = 0; i < alertas.length; i++) {
    const ref = db.collection('road_alerts').doc(`alerta_${Date.now()}_${i}`);
    batch.set(ref, alertas[i]);
  }
  await batch.commit();
  console.log(`  ✅ ${alertas.length} alertas de vía creadas`);
}

async function sembrarDepartamentos() {
  console.log('\n🏢 === PASO 5: Sembrar departamentos ===');

  const departamentos = [
    {
      id: 'trafico',
      nombre: 'Tráfico',
      descripcion: 'Gestión de operaciones de tránsito',
      activo: true,
    },
    {
      id: 'flota',
      nombre: 'Flota',
      descripcion: 'Mantenimiento y gestión de vehículos',
      activo: true,
    },
    { id: 'rrhh', nombre: 'RRHH', descripcion: 'Recursos Humanos', activo: true },
    { id: 'admin', nombre: 'Administración', descripcion: 'Gestión administrativa', activo: true },
  ];

  const batch = db.batch();
  for (const d of departamentos) {
    const ref = db.collection('departments').doc(d.id);
    batch.set(
      ref,
      { ...d, createdAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`  ✅ ${departamentos.length} departamentos creados`);
}

async function verificarConexion() {
  console.log('\n🔍 === VERIFICACIÓN FINAL ===');
  const snap = await db.collection('users').limit(1).get();
  console.log(`  ✅ Firestore accesible. Documentos en 'users': ${snap.size}`);
  const vehiclesSnap = await db.collection('vehicles').limit(1).get();
  console.log(`  ✅ Documentos en 'vehicles': ${vehiclesSnap.size}`);
}

async function main() {
  console.log('🚀 TransformaFacil 2.0 — Configuración inicial de Firebase\n');
  console.log('   Proyecto: ucot-gestor-cloud');
  console.log('   Usuario a crear: 329@ucot.internal / admin123\n');

  try {
    const uid = await crearOActualizarUsuario();
    await crearDocumentoFirestore(uid);
    await sembrarVehiculos();
    await sembrarAlertas();
    await sembrarDepartamentos();
    await verificarConexion();

    console.log('\n\n🎉 ¡CONFIGURACIÓN COMPLETA!');
    console.log('═══════════════════════════════════════════════');
    console.log('  Abre http://localhost:5173 en tu navegador');
    console.log('  Usuario:    329');
    console.log('  Contraseña: admin123');
    console.log('  Rol:        SuperAdministrador');
    console.log('═══════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
