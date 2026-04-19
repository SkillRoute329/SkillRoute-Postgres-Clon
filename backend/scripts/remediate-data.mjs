/**
 * REMEDIATION SCRIPT — UCOT Data Integrity Fix
 * 
 * Elimina los IDs fantasma (317→17 Cutcsa, 371→71 Cutcsa, 379→79 Cutcsa)
 * de todos los archivos master del sistema.
 * 
 * DECISIÓN: Los servicios etiquetados erróneamente como 317/371/379
 * son ELIMINADOS del master porque son datos de empresas competidoras
 * (Cutcsa), no de UCOT. Los cartones UCOT reales no cubren esas líneas.
 */

import fs from 'fs';
import path from 'path';

const LINEAS_INVALIDAS = ['317', '371', '379'];

// ============================================================
// 1. Corregir frontend/src/data/ucot_master_intelligence_2026.json
// ============================================================
console.log('\n=== CORRIGIENDO ucot_master_intelligence_2026.json ===');
const frontendMasterPath = 'frontend/src/data/ucot_master_intelligence_2026.json';
const frontendData = JSON.parse(fs.readFileSync(frontendMasterPath, 'utf8'));

const lineasOriginales = frontendData.lineas.length;
const serviciosOriginales = frontendData.servicios.length;

// Eliminar líneas inválidas
frontendData.lineas = frontendData.lineas.filter(l => !LINEAS_INVALIDAS.includes(l.id));

// Eliminar servicios de líneas inválidas
frontendData.servicios = frontendData.servicios.filter(s => !LINEAS_INVALIDAS.includes(s.linea));

// Eliminar también servicios con linea que sean IDs numéricos sueltos (sin línea UCOT)
const lineasValidas = frontendData.lineas.map(l => l.id);
const serviciosMalAsignados = frontendData.servicios.filter(s => !lineasValidas.includes(s.linea));
console.log('Servicios con linea no reconocida:', serviciosMalAsignados.map(s => `${s.id}→${s.linea}`).slice(0, 10));

// Actualizar timestamp
frontendData.version = '2026-verano-saneado';
frontendData.auditoria = {
  fecha: new Date().toISOString(),
  accion: 'Eliminación de IDs fantasma 317/371/379 (eran líneas Cutcsa 17/71/79)',
  lineasEliminadas: LINEAS_INVALIDAS,
  lineasRestantes: frontendData.lineas.length,
  serviciosRestantes: frontendData.servicios.length,
};

fs.writeFileSync(frontendMasterPath, JSON.stringify(frontendData, null, 2), 'utf8');
console.log(`✅ Líneas: ${lineasOriginales} → ${frontendData.lineas.length} (-${LINEAS_INVALIDAS.length})`);
console.log(`✅ Servicios: ${serviciosOriginales} → ${frontendData.servicios.length} (-${serviciosOriginales - frontendData.servicios.length})`);
console.log('Líneas activas:', frontendData.lineas.map(l => l.id).join(', '));

// ============================================================
// 2. Corregir backend/config/ucot-lines-master.json
// ============================================================
console.log('\n=== CORRIGIENDO backend/config/ucot-lines-master.json ===');
const backendMasterPath = 'backend/config/ucot-lines-master.json';
const backendData = JSON.parse(fs.readFileSync(backendMasterPath, 'utf8'));

const backendLineasOrig = backendData.lineas.length;
backendData.lineas = backendData.lineas.filter(l => !LINEAS_INVALIDAS.includes(l.id));
backendData.version = '2026-verano-saneado';
backendData.generado = new Date().toISOString();
backendData.auditoria = {
  fecha: new Date().toISOString(),
  accion: 'Eliminación de IDs fantasma 317/371/379',
  lineasEliminadas: LINEAS_INVALIDAS,
};

fs.writeFileSync(backendMasterPath, JSON.stringify(backendData, null, 2));
console.log(`✅ Backend master: ${backendLineasOrig} → ${backendData.lineas.length} líneas`);
console.log('Líneas activas:', backendData.lineas.map(l => l.id).join(', '));

// ============================================================
// 3. Corregir backend/config/lineas-config-real.json (si existe)
// ============================================================
const lineasConfigPath = 'backend/config/lineas-config-real.json';
if (fs.existsSync(lineasConfigPath)) {
  console.log('\n=== CORRIGIENDO backend/config/lineas-config-real.json ===');
  const lineasConfig = JSON.parse(fs.readFileSync(lineasConfigPath, 'utf8'));
  
  // Puede ser un array o un objeto con lineas key
  let lineasArr = Array.isArray(lineasConfig) ? lineasConfig :
                  lineasConfig.lineas ? lineasConfig.lineas :
                  Object.entries(lineasConfig).map(([id, v]) => ({ id, ...v }));
  
  const configOrig = lineasArr.length;
  lineasArr = lineasArr.filter(l => {
    const id = l.id || l.linea || l.numero;
    return !LINEAS_INVALIDAS.includes(String(id));
  });
  
  if (Array.isArray(lineasConfig)) {
    fs.writeFileSync(lineasConfigPath, JSON.stringify(lineasArr, null, 2));
  } else if (lineasConfig.lineas) {
    lineasConfig.lineas = lineasArr;
    fs.writeFileSync(lineasConfigPath, JSON.stringify(lineasConfig, null, 2));
  }
  
  console.log(`✅ lineas-config-real: ${configOrig} → ${lineasArr.length} líneas`);
} else {
  console.log('\n⚠️  lineas-config-real.json no encontrado');
}

console.log('\n=== REMEDIACIÓN COMPLETADA ===');
console.log('IDs eliminados definitivamente:', LINEAS_INVALIDAS.join(', '));
console.log('Razón: Son líneas de Cutcsa (17, 71, 79) que nunca pertenecieron a UCOT.');
