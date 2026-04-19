/**
 * CARGA MASIVA DE FLOTA UCOT — 257 vehículos reales
 * Datos extraídos de FLOTA1-1.docx
 * Ejecutar: node seed_flota_real.js
 * 
 * // cspell:disable
 */
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// === 257 coches reales de UCOT (número interno, marca) ===
const FLOTA = [
  ['1','Volvo'],['2','Agrale'],['3','Agrale'],['4','Agrale'],['5','Volvo'],
  ['6','Agrale'],['7','Yutong'],['8','Volvo'],['9','Yutong'],['10','Volvo'],
  ['11','Volvo'],['12','Yutong'],['13','Volvo'],['14','Yutong'],['15','Agrale'],
  ['16','Agrale'],['17','Yutong'],['18','Agrale'],['19','Agrale'],['20','Volvo'],
  ['21','Agrale'],['22','Agrale'],['23','Agrale'],['24','Volvo'],['25','Volvo'],
  ['26','Agrale'],['27','Volvo'],['28','Agrale'],['29','Agrale'],['30','Agrale'],
  ['31','Yutong'],['32','Agrale'],['33','Agrale'],['34','Agrale'],['35','Agrale'],
  ['36','Volvo'],['37','Yutong'],['38','Yutong'],['39','Agrale'],['40','Agrale'],
  ['41','Yutong'],['42','Agrale'],['43','Agrale'],['44','Agrale-Cummins'],['45','Yutong'],
  ['46','Agrale'],['47','Volvo'],['48','Yutong'],['49','Agrale'],['50','Yutong'],
  ['51','Agrale-Cummins'],['52','Volvo'],['53','Yutong'],['54','Agrale'],['55','Agrale'],
  ['56','Agrale'],['57','Yutong'],['58','Yutong'],['59','Agrale-Cummins'],['60','Agrale'],
  ['61','Agrale-Cummins'],['62','Yutong'],['63','Agrale'],['64','Agrale'],['65','Agrale-Cummins'],
  ['66','Volvo'],['67','Yutong'],['68','Volvo'],['69','Yutong'],['70','Agrale'],
  ['71','Volvo'],['72','Yutong'],['73','Volvo'],['74','Agrale'],['75','Volvo'],
  ['76','Volvo'],['77','Agrale'],['78','Volvo'],['79','Yutong'],['80','Yutong'],
  ['81','Yutong'],['82','Yutong'],['83','Agrale-Cummins'],['84','Agrale'],['85','Agrale'],
  ['86','Agrale'],['87','Agrale-Cummins'],['88','Volvo'],['89','Volvo'],['90','Yutong'],
  ['91','Volvo'],['92','Yutong'],['93','Yutong'],['94','Agrale'],['95','Yutong'],
  ['96','Yutong'],['97','Yutong'],['98','Yutong'],['99','Volvo'],['100','Volvo'],
  ['101','Agrale'],['102','Yutong'],['103','Agrale'],['104','Agrale'],['105','Agrale'],
  ['106','Yutong'],['107','Yutong'],['108','Yutong'],['109','Yutong'],['110','Agrale'],
  ['111','Yutong'],['112','Yutong'],['113','Yutong'],['114','Yutong'],['115','Yutong'],
  ['116','Yutong'],['117','Yutong'],['118','Agrale'],['119','Agrale'],['120','Agrale'],
  ['121','Agrale'],['122','Agrale'],['123','Agrale'],['124','Agrale-Cummins'],['125','Agrale-Cummins'],
  ['126','Agrale-Cummins'],['127','Agrale-Cummins'],['128','Agrale'],['129','Agrale'],['130','Agrale'],
  ['131','Agrale'],['132','Agrale'],['133','Agrale'],['134','Agrale'],['135','Agrale'],
  ['136','Agrale'],['137','Agrale'],['138','Agrale'],['139','Agrale'],['140','Agrale'],
  ['141','Agrale'],['142','Agrale'],['143','Agrale'],['144','Agrale'],['145','Agrale'],
  ['146','Agrale'],['147','Agrale'],['148','Agrale'],['149','Agrale'],['150','Agrale'],
  ['151','Agrale'],['152','Yutong'],['153','Agrale'],['154','Agrale-Cummins'],['155','Agrale-Cummins'],
  ['156','Agrale-Cummins'],['157','Agrale-Cummins'],['158','Agrale-Cummins'],['159','Agrale-Cummins'],['160','Agrale-Cummins'],
  ['161','Agrale-Cummins'],['162','Agrale-Cummins'],['163','Agrale-Cummins'],['164','Agrale-Cummins'],['165','Agrale-Cummins'],
  ['166','Agrale-Cummins'],['167','Agrale-Cummins'],['168','Yutong'],['169','Yutong'],['201','Yutong'],
  ['202','Yutong'],['203','Yutong'],['204','Yutong'],['205','Yutong'],['206','Yutong'],
  ['207','Yutong'],['208','Yutong'],['209','Yutong'],['210','Yutong'],['211','Yutong'],
  ['212','Yutong'],['213','Yutong'],['214','Yutong'],['215','Yutong'],['221','Mercedes Benz'],
  ['222','Mercedes Benz'],['223','Mercedes Benz'],['224','Mercedes Benz'],['226','Mercedes Benz'],['228','Mercedes Benz'],
  ['230','Mercedes Benz'],['231','Mercedes Benz'],['232','Mercedes Benz'],['233','Mercedes Benz'],['234','Mercedes Benz'],
  ['235','Volvo'],['236','Volvo'],['237','Volvo'],['238','Volvo'],['239','Volvo'],
  ['240','Volvo'],['241','Volvo'],['242','Volvo'],['243','Volvo'],['244','Agrale'],
  ['245','Agrale'],['246','Agrale'],['247','Agrale'],['248','Agrale'],['249','Agrale'],
  ['250','Agrale'],['251','Volvo'],['252','Volvo'],['253','Volvo'],['254','Volvo'],
  ['255','Agrale-Cummins'],['256','Agrale-Cummins'],['257','Agrale-Cummins'],['258','Agrale-Cummins'],['259','Agrale-Cummins'],
  ['260','Agrale-Cummins'],['261','Agrale-Cummins'],['262','Yutong'],['263','Yutong'],['264','Yutong'],
  ['265','Yutong'],['266','Yutong'],['267','Yutong'],['268','Yutong'],['903','Mitsubishi'],
  ['909','Fiat'],['912','Mitsubishi'],['915','Volkswagen'],['916','Fiat'],['917','Fiat'],
  ['918','Volkswagen'],['919','Volvo'],['920','Fiat'],['921','Volkswagen'],['922','Volkswagen'],
  ['923','Byd'],['924','Byd'],['925','Byd'],['926','Byd'],['927','Byd'],
  ['1009','Volvo'],['1014','Volvo'],['1016','Volvo'],['1021','Volvo'],['1050','Volvo'],
  ['1053','Volvo'],['1055','Volvo'],['1057','Volvo'],['1064','Volvo'],['1096','Volvo'],
  ['1098','Volvo'],['1110','Volvo'],
];

async function seedFlota() {
  console.log(`🚀 Cargando ${FLOTA.length} vehículos reales de UCOT a Firestore...`);

  // Firestore writeBatch supports max 500 operations per batch
  const BATCH_SIZE = 400;
  let loaded = 0;
  let skipped = 0;
  let updated = 0;

  for (let i = 0; i < FLOTA.length; i += BATCH_SIZE) {
    const chunk = FLOTA.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const [internalNumber, brand] of chunk) {
      const ref = db.collection('vehiculos').doc(internalNumber);
      const existing = await ref.get();

      if (existing.exists) {
        // Update brand if missing but don't overwrite other fields
        const data = existing.data();
        if (!data.brand || data.brand !== brand) {
          batch.set(ref, {
            brand,
            make: brand,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          updated++;
        } else {
          skipped++;
        }
      } else {
        batch.set(ref, {
          id: internalNumber,
          internalNumber: internalNumber,
          brand: brand,
          make: brand,
          status: 'Activo',
          estado_operativo: 'ACTIVO',
          empresa: 'UCOT',
          category: null,
          categoryId: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        loaded++;
      }
    }

    await batch.commit();
    console.log(`  ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: procesados ${Math.min(i + BATCH_SIZE, FLOTA.length)}/${FLOTA.length}`);
  }

  console.log(`\n📊 Resultado:`);
  console.log(`   Nuevos: ${loaded}`);
  console.log(`   Actualizados: ${updated}`);
  console.log(`   Sin cambios: ${skipped}`);
  console.log(`   Total procesados: ${FLOTA.length}`);

  // Verify
  const snap = await db.collection('vehiculos').get();
  console.log(`\n✅ Total vehículos en Firestore ahora: ${snap.size}`);

  // Stats by brand
  const brands = {};
  snap.forEach(d => {
    const b = d.data().brand || 'Sin marca';
    brands[b] = (brands[b] || 0) + 1;
  });
  console.log('\n📈 Distribución por marca:');
  Object.entries(brands)
    .sort((a, b) => b[1] - a[1])
    .forEach(([brand, count]) => console.log(`   ${brand}: ${count}`));
}

seedFlota()
  .then(() => {
    console.log('\n🎉 Carga de flota completada exitosamente.');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
