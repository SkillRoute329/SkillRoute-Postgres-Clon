const { runCopilot } = require('./src/services/aiOrchestratorService');
const dotenv = require('dotenv');
dotenv.config();

async function verifyBrain() {
  console.log("--- INICIANDO VERIFICACIÓN END-TO-END DE IA SOBERANA ---");
  console.log("Pregunta simulate: '¿Cuántas paradas físicas tenemos mapeadas en total?'");
  
  try {
    const result = await runCopilot([], "¿Cuántas paradas físicas tenemos mapeadas en total en la base de datos local?", "verify-script");
    console.log("\n--- RESULTADO DE LA ORQUESTACIÓN ---");
    console.log(`Intención detectada: ${result.intent}`);
    console.log(`Modelo final: ${result.model}`);
    console.log(`Rondas de pensamiento: ${result.rounds}`);
    console.log(`Latencia Total: ${result.total_latency_ms}ms`);
    
    console.log("\n--- HERRAMIENTAS INVOCADAS POR LA IA ---");
    if(result.tools_used.length === 0) {
      console.log("❌ La IA no invocó ninguna herramienta.");
    } else {
      result.tools_used.forEach((t, i) => {
        console.log(`[${i+1}] Tool: ${t.name} -> Éxito: ${t.ok}`);
        console.log(`    Salida SQL:`, t.result);
      });
    }

    console.log("\n--- RESPUESTA FINAL DE LA IA AL USUARIO ---");
    console.log(`>> "${result.reply}"`);
    
    if(result.reply.includes("4901") || result.tools_used.some(t => t.name === 'get_gtfs_infrastructure_stats')) {
      console.log("\n✅ ÉXITO ABSOLUTO: La IA leyó la base de datos y respondió soberanamente.");
    } else {
      console.log("\n⚠️ ADVERTENCIA: La IA respondió pero no parece haber invocado la herramienta esperada.");
    }
  } catch(err) {
    console.error("CRITICAL ERROR EN VERIFICACIÓN:", err);
  }
  process.exit(0);
}

// Esperar 1 seg para que carguen los módulos
setTimeout(verifyBrain, 1000);
