/**
 * scripts/sync-gtfs-to-firestore.js
 * Sincroniza los timetables del PostgreSQL hacia Firestore para que TODAS las vistas
 * legacy y actuales del frontend carguen sus datos al instante.
 */
const { Client } = require('pg');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const serviceAccountPath = path.join(__dirname, '../src/config/firebase-admin.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const pgClient = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await pgClient.connect();
  console.log('Connected to PGSQL');

  const days = [
    { type: 'HABIL', filter: 'monday = 1' },
    { type: 'SABADO', filter: 'saturday = 1' },
    { type: 'DOMINGO', filter: 'sunday = 1' }
  ];

  for (const day of days) {
    console.log(`\n🔄 Procesando Tipo de Día: ${day.type}`);

    const query = `
      WITH Timestamps AS (
        SELECT 
          t.route_id, r.route_short_name, t.direction_id, t.trip_id,
          MIN(st.departure_time) as start_time, MAX(st.arrival_time) as end_time
        FROM gtfs.trips t
        JOIN gtfs.routes r ON t.route_id = r.route_id
        JOIN gtfs.stop_times st ON st.trip_id = t.trip_id
        JOIN gtfs.calendar c ON t.service_id = c.service_id
        WHERE c.${day.filter}
        GROUP BY t.route_id, r.route_short_name, t.direction_id, t.trip_id
      )
      SELECT route_short_name, direction_id, start_time, end_time
      FROM Timestamps;
    `;

    const res = await pgClient.query(query);
    const rows = res.rows;
    console.log(`📊 Encontrados ${rows.length} viajes en SQL.`);

    // Agrupar por linea + sentido
    const groups = new Map();
    const timeToMin = (timeStr) => {
      const [h, m] = timeStr.split(':').map(Number);
      return (h * 60) + m;
    };

    rows.forEach(r => {
      // Inferencia de empresa id
      const routeNum = parseInt(r.route_short_name, 10);
      let agencyId = '70'; // Default UCOT
      if (routeNum >= 100 && routeNum < 200) agencyId = '50'; // CUTCSA
      else if (routeNum >= 200 && routeNum < 300) agencyId = '20'; // COME
      else if (routeNum >= 400 && routeNum < 500) agencyId = '60'; // COETC

      const key = `${agencyId}_${r.route_short_name}_${r.direction_id}_${day.type}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          agencyId,
          linea: r.route_short_name,
          routeShortName: r.route_short_name,
          directionId: Number(r.direction_id),
          sentido: Number(r.direction_id) === 0 ? 'IDA' : 'VUELTA',
          serviceType: day.type,
          viajes: []
        });
      }

      groups.get(key).viajes.push({
        s: r.start_time.substring(0, 5),
        t: [timeToMin(r.start_time), timeToMin(r.end_time)]
      });
    });

    console.log(`📦 Escribiendo ${groups.size} documentos agregados en Firestore...`);

    const batchSize = 200;
    let batch = db.batch();
    let count = 0;
    let totalSaved = 0;

    for (const [docId, payload] of groups) {
      const ref = db.collection('gtfs_timetable').doc(docId);
      // Ordenar viajes por hora
      payload.viajes.sort((a,b) => a.s.localeCompare(b.s));
      
      batch.set(ref, payload, { merge: true });
      count++;

      if (count >= batchSize) {
        await batch.commit();
        totalSaved += count;
        console.log(`   ✅ Commited ${totalSaved} records so far...`);
        batch = db.batch();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
      totalSaved += count;
    }

    console.log(`✅ Día ${day.type} Finalizado. Total Documentos: ${totalSaved}`);
  }

  console.log('\n🎉 SINCRO COMPLETA DE FIREBASE TIMETABLE DESDE SQL.');
  await pgClient.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Critical Failure:', err);
  process.exit(1);
});
