import { crossModuleCorrelationService } from './src/services/crossModuleCorrelationService';

async function run() {
  try {
    console.log(">>> INICIANDO COMPARATIVA SEGMENTADA POR DESTINO (IDA vs VUELTA) - LÍNEA 329\n");
    
    console.log("[1/2] Procesando trayecto de IDA (Hacia el Centro)...");
    const ida = await crossModuleCorrelationService.analyzeOperationalFinancialCorrelation('329', '70', 'IDA', 14);
    
    console.log("\n[2/2] Procesando trayecto de VUELTA (Hacia Terminal)...");
    const vuelta = await crossModuleCorrelationService.analyzeOperationalFinancialCorrelation('329', '70', 'VUELTA', 14);

    console.log("\n==================================================================");
    console.log(`🔍 COMPARATIVA DE COMPORTAMIENTO POR DESTINO: LÍNEA 329 (UCOT)`);
    console.log("==================================================================");
    
    console.log(`\n🚩 TRAYECTO DE IDA (Al Centro):`);
    console.log(`  - Demanda Mensual:       ${ida.validacionesTotalesMes.toLocaleString()} boletos`);
    console.log(`  - Retraso Operativo Med: ${ida.demoraPromedioGlobalMin} minutos`);
    console.log(`  - Fuga Económica/Mes:   $${ida.fugaEconomicaTotalMes.toLocaleString()} URU (${ida.impactoFinancieroSobreIngresoPct}%)`);
    if (ida.picoDeFugaEconomica) {
      console.log(`  - Pico de Pérdida:       ${ida.picoDeFugaEconomica.hora}:00 hs ($${ida.picoDeFugaEconomica.perdidaHora.toLocaleString()} URU)`);
    }

    console.log(`\n🚩 TRAYECTO DE VUELTA (Hacia Terminal):`);
    console.log(`  - Demanda Mensual:       ${vuelta.validacionesTotalesMes.toLocaleString()} boletos`);
    console.log(`  - Retraso Operativo Med: ${vuelta.demoraPromedioGlobalMin} minutos`);
    console.log(`  - Fuga Económica/Mes:   $${vuelta.fugaEconomicaTotalMes.toLocaleString()} URU (${vuelta.impactoFinancieroSobreIngresoPct}%)`);
    if (vuelta.picoDeFugaEconomica) {
      console.log(`  - Pico de Pérdida:       ${vuelta.picoDeFugaEconomica.hora}:00 hs ($${vuelta.picoDeFugaEconomica.perdidaHora.toLocaleString()} URU)`);
    }

    console.log("\n------------------------------------------------------------------");
    console.log("🎯 ANÁLISIS DE DECISIÓN UNIFICADA:");
    
    if (ida.fugaEconomicaTotalMes > vuelta.fugaEconomicaTotalMes) {
      console.log("   >> PRIORIDAD ESTRATÉGICA: TRAYECTO DE IDA.");
      console.log("      Las demoras matinales hacia el centro causan el mayor drenaje de capital.");
    } else {
      console.log("   >> PRIORIDAD ESTRATÉGICA: TRAYECTO DE VUELTA.");
      console.log("      La competencia de la tarde en el regreso a terminal es tu punto crítico de sangrado económico.");
    }
    console.log("==================================================================\n");

  } catch (err) {
    console.error("ERROR TEST:", err);
  } finally {
    process.exit(0);
  }
}

run();
