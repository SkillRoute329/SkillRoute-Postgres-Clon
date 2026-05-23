import { doc, writeBatch, serverTimestamp, GeoPoint, Timestamp } from '../config/firestoreShim';
import { db } from '../config/firebase';

export const runGenesisProtocol = async () => {
  console.log('🚀 [GENESIS PROTOCOL] Initiating System Seeding...');
  const batch = writeBatch(db);
  let operations = 0;

  // 1. FLOTA (5 Vehículos)
  const vehicles = [
    { id: '1040', matricula: 'STP-1040', marca: 'Mercedes-Benz', modelo: 'O500', capacidad: 42 },
    { id: '38', matricula: 'STP-0038', marca: 'Volvo', modelo: 'B7R', capacidad: 40 },
    { id: '15', matricula: 'STP-0015', marca: 'Yutong', modelo: 'ZK6108', capacidad: 38 },
    { id: '90', matricula: 'STP-0090', marca: 'Mercedes-Benz', modelo: 'OH-1618', capacidad: 35 },
    { id: '115', matricula: 'STP-0115', marca: 'Agrale', modelo: 'MT17', capacidad: 30 },
  ];

  for (const v of vehicles) {
    const ref = doc(db, 'vehiculos', v.id); // Using Internal Number as ID
    batch.set(ref, {
      id: v.id,
      matricula: v.matricula, // Old Frontend Compatibility via api adapter (needs matricula)
      internalNumber: v.id, // Compatibility
      licensePlate: v.matricula, // Compatibility
      caracteristicas: {
        marca: v.marca,
        modelo: v.modelo,
        capacidad: v.capacidad,
        tiene_aire: true,
        wifi: ['1040', '38'].includes(v.id), // Luxury units
      },
      estado_operativo: 'ACTIVO',
      ultima_actualizacion: serverTimestamp(),
      ubicacion_actual: new GeoPoint(-34.9011, -56.1645), // Montevideo
    });
    operations++;
  }

  // 2. LINEAS (Línea 300)
  const lineaRef = doc(db, 'lineas', '300');
  batch.set(lineaRef, {
    id: '300',
    nombre: 'Línea 300',
    ramales: ['Instrucciones', 'Cementerio'],
    paradas_oficiales: [],
    active: true,
  });
  operations++;

  // 3. RRHH (Usuarios Dummy)
  // Note: Creating Data Profiles only. Auth credentials must be created separately or assumed exists.
  const users = [
    {
      uid: 'inspector1_uid',
      email: 'inspector1@ucot.net',
      rol: 'INSPECTOR',
      nombre: 'Carlos',
      apellido: 'Lopez',
    },
    {
      uid: 'mecanico1_uid',
      email: 'mecanico1@ucot.net',
      rol: 'MECANICO',
      nombre: 'Mario',
      apellido: 'Silva',
    },
    {
      uid: 'chofer1_uid',
      email: 'chofer1@ucot.net',
      rol: 'CHOFER',
      nombre: 'Juan',
      apellido: 'Perez',
    },
  ];

  for (const u of users) {
    const userRef = doc(db, 'users', u.uid);
    batch.set(userRef, {
      uid: u.uid,
      email: u.email,
      rol: u.rol,
      empresa: 'UCOT',
      datos_personales: { nombre: u.nombre, apellido: u.apellido },
      createdAt: serverTimestamp(),
      // Compatibility fields
      role: u.rol,
      firstName: u.nombre,
      lastName: u.apellido,
    });
    operations++;
  }

  // 4. INCIDENCIAS (Reportes)
  const incidents = [
    {
      id: 'inc_001',
      coche: '1040',
      desc: 'Falla de frenos (Ruido)',
      prio: 'CRITICA',
      estado: 'EN_REPARACION',
      foto: 'https://via.placeholder.com/150',
    },
    {
      id: 'inc_002',
      coche: '38',
      desc: 'Aire acondicionado no enfría',
      prio: 'MEDIA',
      estado: 'PENDIENTE',
      foto: null,
    },
    {
      id: 'inc_003',
      coche: '115',
      desc: 'Luz de giro quemada',
      prio: 'BAJA',
      estado: 'RESUELTO',
      foto: null,
    },
  ];

  for (const inc of incidents) {
    const incRef = doc(db, 'incidencias', inc.id);
    batch.set(incRef, {
      coche_id: inc.coche,
      reportado_por: 'chofer1_uid',
      prioridad: inc.prio,
      descripcion: inc.desc,
      estado: inc.estado, // User requested status
      evidencia_fotos: inc.foto ? [inc.foto] : [],
      fecha_reporte: serverTimestamp(),
      // Compatibility
      vehicleId: inc.coche,
      status: inc.estado === 'RESUELTO' ? 'Completed' : 'Pending',
      comments: inc.desc,
    });
    operations++;
  }

  // 5. ALERTAS (Waze)
  const alertRef = doc(db, 'alertas_trafico', 'alerta_001');
  batch.set(alertRef, {
    tipo: 'DESVIO',
    descripcion: 'Desvío por feria en 8 de Octubre',
    ubicacion: new GeoPoint(-34.885, -56.14),
    linea_afectada: '300',
    creado_por: 'inspector1_uid',
    expira_en: Timestamp.fromDate(new Date(Date.now() + 24 * 3600 * 1000)), // 24h
    active: true,
  });
  operations++;

  await batch.commit();
  console.log(`✅ [GENESIS COMPLETE] ${operations} records created.`);
};
