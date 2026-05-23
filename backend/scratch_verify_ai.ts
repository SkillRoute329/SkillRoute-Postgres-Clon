import { runCopilot } from './src/services/aiOrchestratorService';
import * as dotenv from 'dotenv';
dotenv.config();

async function verifyBrain() {
  console.log("--- INICIANDO VERIFICACIÓN END-TO-END DE IA SOBERANA ---");
  console.log("Pregunta simulate: '¿Cuántas paradas físicas tenemos mapeadas en total?'");
  
  try {
    // Ejecuta el copiloto real, con LLMs reales de Ollama.
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
      result.tools_used.forEach((t: any, i: number) => {
        console.log(`[${i+1}] Tool: ${t.name} -> Éxito: ${t.ok}`);
        console.log(`    Salida SQL:`, JSON.stringify(t.result));
      });
    }

    console.log("\n--- RESPUESTA FINAL DE LA IA AL USUARIO ---");
    console.log(`>> "${result.reply}"`);
    
    const invokedCorrectTool = result.tools_used.some((t: any) => t.name === 'get_gtfs_infrastructure_stats');
    if(invokedCorrectTool) {
      console.log("\n✅ ÉXITO ABSOLUTO: La IA invocó la herramienta GTFS SQL correctamente.");
    } else {
      console.log("\n⚠️ ADVERTENCIA: La IA respondió pero no parece haber invocado la herramienta esperada.");
    }
  } catch(err) {
    console.error("CRITICAL ERROR EN VERIFICACIÓN:", err);
  }
  process.exit(0);
}

verifyBrain();
