#!/usr/bin/env node

/**
 * iniciar-jefe-transito.js
 *
 * Script de inicialización del Sistema de Agentes para Jefe de Tránsito de UCOT
 *
 * USO:
 *   node backend/scripts/iniciar-jefe-transito.js
 *
 * Este script:
 * - Carga configuración real de 8 líneas UCOT
 * - Inicializa MasterOrchestrator con todos los agentes
 * - Presenta dashboard inicial
 * - Demuestra operación autónoma
 */

const path = require('path');
const fs = require('fs');
const MasterOrchestrator = require('../orchestrators/MasterOrchestrator');

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(color, ...msg) {
  console.log(`${color}${msg.join(' ')}${colors.reset}`);
}

function divider() {
  console.log('═══════════════════════════════════════════════════════════════');
}

async function main() {
  log(colors.bright + colors.blue, '╔════════════════════════════════════════════════════════════╗');
  log(colors.bright + colors.blue, '║     SISTEMA DE AGENTES INTELIGENTES — JEFE DE TRÁNSITO     ║');
  log(colors.bright + colors.blue, '║                    UCOT — Montevideo 2026                  ║');
  log(colors.bright + colors.blue, '╚════════════════════════════════════════════════════════════╝\n');

  // 1. Cargar configuración
  log(colors.yellow, '[1/5] Cargando configuración de líneas reales...');
  const configPath = path.join(__dirname, '../config/lineas-config-real.json');

  if (!fs.existsSync(configPath)) {
    log(colors.red, '❌ Error: archivo de configuración no encontrado');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  log(colors.green, `✅ Configuración cargada: ${config.lineas.length} líneas UCOT`);
  divider();

  // 2. Inicializar MasterOrchestrator
  log(colors.yellow, '\n[2/5] Inicializando MasterOrchestrator con agentes...');
  const orchestrator = new MasterOrchestrator(config);

  try {
    await orchestrator.initialize();
    log(colors.green, '✅ MasterOrchestrator inicializado exitosamente');
  } catch (error) {
    log(colors.red, `❌ Error inicializando: ${error.message}`);
    process.exit(1);
  }
  divider();

  // 3. Mostrar estado de ecosistemas
  log(colors.yellow, '\n[3/5] Estado de ecosistemas de agentes:\n');
  const ecosystems = orchestrator.getAllEcosystems();

  let totalAgentes = 0;
  ecosystems.forEach((eco, idx) => {
    const agentes = eco.totalAgents;
    totalAgentes += agentes;
    log(colors.cyan, `  ${idx + 1}. Línea ${eco.lineId} — ${eco.lineNombre}`);
    log(colors.cyan, `     ├─ Orquestador: ${eco.orchestrator}`);
    log(colors.cyan, `     ├─ Analizadores: ${eco.ownAgents} (propios)`);
    log(colors.cyan, `     ├─ Monitores: ${eco.competitorAgents} (competencia)`);
    log(colors.cyan, `     └─ Total: ${agentes} agentes\n`);
  });

  log(colors.green, `✅ Total de agentes activos: ${totalAgentes}`);
  divider();

  // 4. Simular eventos de operación
  log(colors.yellow, '\n[4/5] Simulando eventos de operación táctica:\n');

  // Evento 1: Retraso detectado
  log(colors.cyan, '📋 EVENTO 1: Retraso detectado en Línea 300');
  const alerta1 = await orchestrator.requestAlert(300, {
    tipo: 'ALERTA_RETRASO',
    recorrido: 'Centro - Ida',
    sentido: 'ida',
    tiempo_minutos: 8,
    mensaje: 'Congestión en Av. 8 de Octubre (hora pico)',
    acciones: [
      'Acelerar próximas 2 unidades desde terminal',
      'Comunicar a planchistas: aprovechar desviaciones menores',
      'Avisar a central de información para usuarios'
    ]
  });

  log(colors.green, `✅ ${alerta1.alerta_id}`);
  log(colors.cyan, `   Severidad: ${alerta1.severidad}`);
  log(colors.cyan, `   Acciones: ${alerta1.acciones_recomendadas.length}\n`);

  // Evento 2: Competidor adelantado
  log(colors.cyan, '📋 EVENTO 2: Rival CUTCSA adelantado en Línea 300');
  const alerta2 = await orchestrator.alertFromCompetitor(300, {
    competitorId: 'CUTCSA_103',
    tipo_evento: 'adelantado',
    recorrido: 'Av. 8 de Octubre',
    sentido: 'ida',
    tiempo_ventaja: 6,
    unidades_detectadas: 1
  });

  log(colors.green, `✅ ${alerta2.alerta_id}`);
  log(colors.cyan, `   Tipo: ${alerta2.tipo}`);
  log(colors.cyan, `   Análisis: ${alerta2.competidor.nombre} ${alerta2.tiempo_minutos} min adelante`);
  log(colors.cyan, `   Acción recomendada: ${alerta2.acciones_recomendadas[0]}\n`);

  // Evento 3: Oportunidad (rival roto)
  log(colors.cyan, '📋 EVENTO 3: ⭐ OPORTUNIDAD - Rival fuera de servicio');
  const alerta3 = await orchestrator.alertFromCompetitor(306, {
    competitorId: 'CUTCSA_117',
    tipo_evento: 'roto / fuera de servicio',
    recorrido: 'Ruta Primaria',
    sentido: 'ida'
  });

  log(colors.green, `✅ ${alerta3.alerta_id}`);
  log(colors.red, `   🚨 OPORTUNIDAD CRÍTICA`);
  log(colors.cyan, `   Línea ${alerta3.linea}: ${alerta3.mensaje}`);
  log(colors.cyan, `   Acción: ${alerta3.acciones_recomendadas[0]}\n`);

  // Evento 4: Análisis de desempeño propio
  log(colors.cyan, '📋 EVENTO 4: Análisis de desempeño - Línea 316');
  const alerta4 = await orchestrator.alertFromOwnAnalysis(316, {
    destinationId: 'dest_316_ida',
    tiempo_promedio: 45,
    tiempo_desviacion: 12,
    frecuencia_teorica: 12,
    frecuencia_real: 15,
    tasa_puntualidad: 68
  });

  log(colors.green, `✅ ${alerta4.alerta_id}`);
  log(colors.cyan, `   Tipo: ${alerta4.tipo}`);
  log(colors.cyan, `   Desviación: ${alerta4.tiempo_minutos} minutos`);
  log(colors.cyan, `   Puntualidad: ${alerta4.metricas.tasa_puntualidad}%`);
  log(colors.cyan, `   Acción: ${alerta4.acciones_recomendadas[0]}\n`);

  divider();

  // 5. Resumen y instrucciones
  log(colors.yellow, '\n[5/5] Sistema listo para operación\n');

  log(colors.bright + colors.green, '╔════════════════════════════════════════════════════════════╗');
  log(colors.bright + colors.green, '║                    ✅ SISTEMA OPERACIONAL                  ║');
  log(colors.bright + colors.green, '╚════════════════════════════════════════════════════════════╝\n');

  log(colors.blue, 'RESUMEN DE OPERACIÓN:');
  log(colors.blue, `  • ${config.lineas.length} líneas monitoreadas en tiempo real`);
  log(colors.blue, `  • ${totalAgentes} agentes autónomos activos`);
  log(colors.blue, `  • ${ecosystems.length} orquestadores (uno por línea)`);
  log(colors.blue, `  • Monitoreo de ${config.lineas.reduce((sum, l) => sum + l.competidores.length, 0)} líneas de competencia\n`);

  log(colors.cyan, 'PRÓXIMOS PASOS:');
  log(colors.cyan, '  1. Integrar con bridge-server.js (ver INTEGRACION_AGENTES_DINAMICOS.md)');
  log(colors.cyan, '  2. Acceder a APIs REST: GET /api/agents/status');
  log(colors.cyan, '  3. Generar alertas: POST /api/agents/line/{id}/alert');
  log(colors.cyan, '  4. Ver historial: GET /api/agents/alerts/history\n');

  log(colors.yellow, 'ESTADÍSTICAS DE ALERTAS:');
  const stats = orchestrator.getAlertStatistics();
  Object.entries(stats).forEach(([lineId, data]) => {
    log(colors.yellow, `  Línea ${lineId}: ${data.total} alertas (${JSON.stringify(data.por_tipo)})`);
  });

  log(colors.bright + colors.green, '\n🚀 Sistema de Agentes para Jefe de Tránsito iniciado correctamente');
  log(colors.cyan, '\nPara recibir alertas en tiempo real, integra con bridge-server.js');
  divider();
}

// Ejecutar
main().catch(error => {
  log(colors.red, `\n❌ Error fatal: ${error.message}`);
  console.error(error);
  process.exit(1);
});
