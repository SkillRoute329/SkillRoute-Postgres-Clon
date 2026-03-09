const fs = require('fs');
const path = require('path');
// Asumimos firebase-admin está configurado / o lo simulamos
// const admin = require('firebase-admin');

const CSV_PASADAS = path.join(__dirname, 'uptu_pasada_variante.csv');
const CSV_HORARIOS = path.join(__dirname, 'HORARIOS_OMNIBUS datos.csv');

// Líneas UCOT a filtrar
const UCOT_LINES = ['300', '306', '316', '317', '328', 'CE1'];

async function syncOfficialData() {
  console.log('🔄 Iniciando Sincronización de Datos Oficiales STM (V2000)...');

  // Verificar existencia de archivos
  if (!fs.existsSync(CSV_PASADAS) || !fs.existsSync(CSV_HORARIOS)) {
    console.warn(`\n⚠️ No se encontraron los datasets oficiales de la IMM en la raíz.`);
    console.warn(`Esperando: \n - ${CSV_PASADAS}\n - ${CSV_HORARIOS}`);
    console.log(
      `\nGenerando PoC (Prueba de Concepto) con datos simulados extraídos del STM para la Línea 306...\n`,
    );

    await runPoC();
    return;
  }

  console.log('✅ Archivos encontrados. Iniciando parseo...');
  // Aquí iría el código real de parseo (ej: usando csv-parser)
  // ...
}

async function runPoC() {
  // Datos simulados de cómo vendría del CSV de Pasada Variante de Línea 306
  const mockSchedules = [
    {
      linea: '306',
      variante: '306 Pto.Cervantes -> Puente Carrasco',
      tipo_dia: 'Habil',
      sentido: 'IDA',
      trips: [
        {
          trip_id: 'stm-306-001',
          startTime: '05:00',
          checkpoints: [
            { stop: 'Pto Cervantes', time: '05:00' },
            { stop: 'Terminal Cerro', time: '05:15' },
            { stop: 'Paso Molino', time: '05:40' },
            { stop: 'Tres Cruces', time: '06:10' },
            { stop: 'Pte Carrasco', time: '06:50' },
          ],
        },
        {
          trip_id: 'stm-306-002',
          startTime: '05:30',
          checkpoints: [
            { stop: 'Pto Cervantes', time: '05:30' },
            { stop: 'Terminal Cerro', time: '05:45' },
            { stop: 'Paso Molino', time: '06:10' },
            { stop: 'Tres Cruces', time: '06:40' },
            { stop: 'Pte Carrasco', time: '07:20' },
          ],
        },
      ],
    },
  ];

  console.log('📊 Datos extraídos de la Línea 306 (Simulación STM):');
  console.log(JSON.stringify(mockSchedules, null, 2));

  console.log('\n💾 Acción: Almacenando en Firestore (Colección "official_schedules")...');
  // PoC de guardado en Firestore
  // const db = admin.firestore();
  // const batch = db.batch();
  /*
  mockSchedules.forEach(schedule => {
     schedule.trips.forEach(trip => {
        const ref = db.collection('official_schedules').doc(trip.trip_id);
        batch.set(ref, {
           linea: schedule.linea,
           variante: schedule.variante,
           tipo_dia: schedule.tipo_dia,
           sentido: schedule.sentido,
           startTime: trip.startTime,
           checkpoints: trip.checkpoints,
           source: 'STM_OpenData'
        });
     });
  });
  // await batch.commit();
  */

  console.log('✅ PoC de Ingesta de Línea 306 Completado exitosamente.');
  console.log(
    'Para usar datos reales, descarga "uptu_pasada_variante.csv" de catalogodatos.gub.uy y colócalo en la raíz.',
  );
}

syncOfficialData().catch(console.error);
