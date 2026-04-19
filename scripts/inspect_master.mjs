import { readFileSync } from 'fs';
const m = JSON.parse(readFileSync('frontend/src/data/ucot_master_intelligence_2026.json', 'utf8'));

console.log('=== LINEAS ===');
console.log('Total:', m.lineas.length);
m.lineas.forEach(l => console.log(`  ${l.id} - ${l.nombre} (activa: ${l.activa})`));

console.log('\n=== SERVICIOS ===');
console.log('Total:', m.servicios.length);

// Show one full service
const s0 = m.servicios[0];
console.log('\n--- Servicio ejemplo (primero) ---');
console.log('Keys:', Object.keys(s0).join(', '));
console.log('servicioId:', s0.servicioId);
console.log('serviceNumber:', s0.serviceNumber);
console.log('linea:', s0.linea);
console.log('lineaId:', s0.lineaId);
console.log('tipo_dia:', s0.tipo_dia);
console.log('variante:', s0.variante);
console.log('nombreCorto:', s0.nombreCorto);
console.log('horaInicioReferencia:', s0.horaInicioReferencia);
console.log('puntosControl:', JSON.stringify(s0.puntosControl));
console.log('headers:', JSON.stringify(s0.headers));
console.log('rawMatrix:', JSON.stringify(s0.rawMatrix));

// Services per line
const byLine = {};
m.servicios.forEach(s => {
  const lid = s.linea || s.lineaId;
  if (!byLine[lid]) byLine[lid] = [];
  byLine[lid].push(s.serviceNumber || s.servicioId);
});
console.log('\n=== SERVICIOS POR LINEA ===');
Object.keys(byLine).sort().forEach(lid => {
  console.log(`  Línea ${lid}: ${byLine[lid].length} servicios -> [${byLine[lid].join(', ')}]`);
});
