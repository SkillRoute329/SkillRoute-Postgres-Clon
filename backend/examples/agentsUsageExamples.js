/**
 * agentsUsageExamples.js
 * Ejemplos de uso del sistema de agentes dinámicos
 * Ejecutar: node backend/examples/agentsUsageExamples.js
 */

const MasterOrchestrator = require('../orchestrators/MasterOrchestrator');
const AlertGenerator = require('../orchestrators/AlertGenerator');
const AgentFactory = require('../agents/AgentFactory');
const fs = require('fs');
const path = require('path');

// Cargar configuración
const configPath = path.join(__dirname, '../config/lineas-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

async function runExamples() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Ejemplos de Uso — Sistema de Agentes      ║');
  console.log('╚════════════════════════════════════════════╝\n');

  // 1. Inicializar orquestador
  console.log('1️⃣  INICIALIZAR MASTER ORCHESTRATOR\n');
  const masterOrchestrator = new MasterOrchestrator(config);
  await masterOrchestrator.initialize();
  console.log('✅ MasterOrchestrator listo\n');

  // 2. Ver estado general
  console.log('2️⃣  ESTADO GENERAL DE AGENTES\n');
  const ecosystems = masterOrchestrator.getAllEcosystems();
  console.log(`Total de líneas activas: ${ecosystems.length}`);
  ecosystems.forEach(eco => {
    console.log(`  → Línea ${eco.lineId}: ${eco.totalAgents} agentes (${eco.ownAgents} propios + ${eco.competitorAgents} competencia)`);
  });
  console.log();

  // 3. Detalles de una línea específica
  console.log('3️⃣  DETALLE DE LÍNEA 300\n');
  const line300 = masterOrchestrator.getLineEcosystem(300);
  if (line300) {
    console.log(`Línea: ${line300.lineNombre}`);
    console.log(`Orquestador: ${line300.orchestrator.id}`);
    console.log(`Analizadores:`);
    line300.ownAgents.forEach(agent => {
      console.log(`  → ${agent.id} (${agent.destinationNombre} - ${agent.sentido})`);
    });
    console.log(`Monitores de competencia:`);
    line300.competitorAgents.forEach(agent => {
      console.log(`  → ${agent.id} (${agent.competitorNombre})`);
    });
  }
  console.log();

  // 4. Generar alerta de retraso
  console.log('4️⃣  GENERAR ALERTA DE RETRASO\n');
  const alertRetraso = await masterOrchestrator.requestAlert(300, {
    tipo: 'ALERTA_RETRASO',
    recorrido: 'Centro - Ida',
    sentido: 'ida',
    tiempo_minutos: 8,
    mensaje: 'Congestión vehicular en Av. 8 de Octubre',
    acciones: [
      'Acelerar próximas 2 unidades desde terminal',
      'Avisar a planchistas de congestión',
      'Comunicar a central de información'
    ]
  });
  console.log('Alerta generada:');
  console.log(JSON.stringify(alertRetraso, null, 2));
  console.log();

  // 5. Generar alerta desde análisis de línea propia
  console.log('5️⃣  GENERAR ALERTA DESDE ANÁLISIS DE LÍNEA PROPIA\n');
  const alertAnalysis = await masterOrchestrator.alertFromOwnAnalysis(300, {
    destinationId: 'dest_300_ida_centro',
    tiempo_promedio: 32,
    tiempo_desviacion: 10,
    frecuencia_teorica: 10,
    frecuencia_real: 14.5,
    tasa_puntualidad: 65
  });
  console.log('Alerta de análisis:');
  console.log(JSON.stringify(alertAnalysis, null, 2));
  console.log();

  // 6. Generar alerta de competidor adelantado
  console.log('6️⃣  GENERAR ALERTA DE COMPETIDOR ADELANTADO\n');
  const alertCompetitor1 = await masterOrchestrator.alertFromCompetitor(300, {
    competitorId: 'CUTCSA_50',
    tipo_evento: 'adelantado',
    recorrido: '8 de Octubre',
    sentido: 'ida',
    tiempo_ventaja: 7,
    unidades_detectadas: 1,
    distancia_metros: 450
  });
  console.log('Alerta de competidor adelantado:');
  console.log(JSON.stringify(alertCompetitor1, null, 2));
  console.log();

  // 7. Generar alerta de competidor con frecuencia aumentada
  console.log('7️⃣  GENERAR ALERTA: RIVAL CON FRECUENCIA AUMENTADA\n');
  const alertCompetitor2 = await masterOrchestrator.alertFromCompetitor(300, {
    competitorId: 'CUTCSA_50',
    tipo_evento: 'frecuencia aumentada',
    recorrido: '8 de Octubre',
    sentido: 'ida',
    unidades_detectadas: 3,
    frecuencia_rival: 6.5
  });
  console.log('Alerta de frecuencia rival:');
  console.log(JSON.stringify(alertCompetitor2, null, 2));
  console.log();

  // 8. Generar alerta de OPORTUNIDAD (rival roto)
  console.log('8️⃣  GENERAR ALERTA: OPORTUNIDAD - RIVAL FUERA DE SERVICIO\n');
  const alertOpportunity = await masterOrchestrator.alertFromCompetitor(300, {
    competitorId: 'CUTCSA_50',
    tipo_evento: 'roto / fuera de servicio',
    recorrido: '8 de Octubre',
    sentido: 'ida',
    tiempo_ventaja: -5
  });
  console.log('Alerta de oportunidad:');
  console.log(JSON.stringify(alertOpportunity, null, 2));
  console.log();

  // 9. Ver historial de alertas
  console.log('9️⃣  HISTORIAL DE ALERTAS\n');
  const history = masterOrchestrator.getAlertHistory();
  console.log(`Total de alertas generadas: ${history.length}`);
  console.log(`Últimas 3 alertas:`);
  history.slice(-3).forEach((alert, index) => {
    console.log(`  [${index + 1}] ${alert.alerta_id} — ${alert.tipo}`);
  });
  console.log();

  // 10. Filtrar historial por línea y tipo
  console.log('🔟 FILTRAR HISTORIAL\n');
  const filtered = masterOrchestrator.getAlertHistory({
    lineId: 300,
    tipo: 'ALERTA_RIVAL_ADELANTADO'
  });
  console.log(`Alertas de línea 300 tipo "RIVAL_ADELANTADO": ${filtered.length}`);
  console.log();

  // 11. Ver estadísticas
  console.log('1️⃣1️⃣  ESTADÍSTICAS DE ALERTAS\n');
  const stats = masterOrchestrator.getAlertStatistics();
  for (const [lineId, data] of Object.entries(stats)) {
    console.log(`Línea ${lineId}:`);
    console.log(`  Total: ${data.total}`);
    console.log(`  Por tipo: ${JSON.stringify(data.por_tipo)}`);
    console.log(`  Por sentido: ${JSON.stringify(data.por_sentido)}`);
  }
  console.log();

  // 12. Ejemplo: Línea 310
  console.log('1️⃣2️⃣  EJEMPLO: LÍNEA 310\n');
  const line310 = masterOrchestrator.getLineEcosystem(310);
  if (line310) {
    const alertLine310 = await masterOrchestrator.requestAlert(310, {
      tipo: 'ALERTA_FRECUENCIA_BAJA',
      recorrido: 'Maldonado - Ida',
      sentido: 'ida',
      tiempo_minutos: 0,
      mensaje: 'Frecuencia de paso ha aumentado más de 2 minutos sobre lo teórico',
      acciones: ['Despachar unidad de emergencia desde terminal']
    });
    console.log('Alerta Línea 310:');
    console.log(JSON.stringify(alertLine310, null, 2));
  }
  console.log();

  // 13. Casos de uso complejos
  console.log('1️⃣3️⃣  CASO COMPLEJO: SIMULACIÓN DE TURNO\n');
  console.log('Escenario: Mañana de congestión en línea 300\n');

  // Evento 1: Congestión detectada
  const evento1 = await masterOrchestrator.requestAlert(300, {
    tipo: 'ALERTA_RETRASO',
    recorrido: 'Centro - Ida',
    sentido: 'ida',
    tiempo_minutos: 6,
    mensaje: 'Congestión en 8 de Octubre',
    acciones: ['Acelerar próximas unidades']
  });
  console.log(`[06:45] Evento 1 — Congestión detectada`);
  console.log(`        → ${evento1.alerta_id}`);

  // Evento 2: Rival adelantado aprovecha congestión
  const evento2 = await masterOrchestrator.alertFromCompetitor(300, {
    competitorId: 'CUTCSA_50',
    tipo_evento: 'adelantado',
    recorrido: '8 de Octubre',
    sentido: 'ida',
    tiempo_ventaja: 5
  });
  console.log(`[06:52] Evento 2 — Rival CUTCSA se adelanta`);
  console.log(`        → ${evento2.alerta_id}`);
  console.log(`        → Acción: ${evento2.acciones_recomendadas[0]}`);

  // Evento 3: Oportunidad por rival varado
  const evento3 = await masterOrchestrator.alertFromCompetitor(300, {
    competitorId: 'COME_100',
    tipo_evento: 'roto / sin movimiento',
    recorrido: 'Corredor Agraciada',
    sentido: 'ida'
  });
  console.log(`[07:15] Evento 3 — Rival COME fuera de servicio`);
  console.log(`        → ${evento3.alerta_id}`);
  console.log(`        → ⭐ OPORTUNIDAD CRÍTICA`);

  console.log();
  console.log('╔════════════════════════════════════════════╗');
  console.log('║        Ejemplos Completados Exitosamente   ║');
  console.log('╚════════════════════════════════════════════╝\n');
}

// Ejecutar
runExamples().catch(console.error);
