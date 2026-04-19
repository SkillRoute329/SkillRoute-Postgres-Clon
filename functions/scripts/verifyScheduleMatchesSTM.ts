/**
 * Comprueba que el horario que devuelve /api/ucot/schedule/:linea
 * en PRODUCCIÓN coincide con lo que devuelve STM en vivo (scraper directo).
 *
 * Uso: npx ts-node scripts/verifyScheduleMatchesSTM.ts 300 Hábiles
 */
import { fetchLineSchedule } from '../src/stmHorariosScraper';
import axios from 'axios';

const ENDPOINT_BASE = 'https://ucot-gestor-cloud.web.app';

async function main() {
  const linea = process.argv[2] || '300';
  const tipoDia = (process.argv[3] as 'Hábiles' | 'Sábados' | 'Domingos') || 'Hábiles';

  console.log(`\n=== Verificando línea ${linea} / ${tipoDia} ===\n`);

  // 1. STM directo (verdad en vivo)
  const stm = await fetchLineSchedule(linea, tipoDia);
  const salidasSTM = stm.variantes.flatMap((v) =>
    v.salidas.map((s) => ({ desde: s.desde, hacia: s.hacia, origen: v.origen, destino: v.destino })),
  );
  salidasSTM.sort((a, b) => a.desde.localeCompare(b.desde));

  console.log(`STM directo:`);
  console.log(`  totalSalidas: ${stm.totalSalidas}`);
  console.log(`  variantes: ${stm.variantes.length}`);
  console.log(`  frecDominante: ${stm.frecuenciaDominanteMin}`);
  console.log(`  primer salida: ${salidasSTM[0]?.desde} (${salidasSTM[0]?.origen} → ${salidasSTM[0]?.destino})`);
  console.log(`  última salida: ${salidasSTM[salidasSTM.length - 1]?.desde}`);

  // 2. Endpoint productivo
  const res = await axios.get(`${ENDPOINT_BASE}/api/ucot/schedule/${encodeURIComponent(linea)}`, {
    timeout: 15000,
  });
  const data = res.data;
  const dia = data?.dias?.[tipoDia];
  if (!dia) {
    console.log(`\n❌ El endpoint productivo NO tiene datos para ${linea}/${tipoDia}`);
    return;
  }
  const salidasDom = (dia.salidasDominante || []) as { desde: string; hacia: string; origen?: string; destino?: string }[];

  console.log(`\nEndpoint producción (/api/ucot/schedule/${linea}):`);
  console.log(`  totalSalidas: ${dia.totalSalidas}`);
  console.log(`  variantes.length: ${dia.variantes?.length}`);
  console.log(`  salidasDominante.length: ${salidasDom.length}`);
  console.log(`  frecDominante: ${dia.frecuenciaDominanteMin}`);
  console.log(`  primer salida: ${salidasDom[0]?.desde} (${salidasDom[0]?.origen} → ${salidasDom[0]?.destino})`);
  console.log(`  última salida: ${salidasDom[salidasDom.length - 1]?.desde}`);

  // 3. Comparación
  const setSTM = new Set(salidasSTM.map((s) => `${s.desde}|${s.origen}→${s.destino}`));
  const setProd = new Set(salidasDom.map((s) => `${s.desde}|${s.origen}→${s.destino}`));

  const soloSTM = [...setSTM].filter((k) => !setProd.has(k));
  const soloProd = [...setProd].filter((k) => !setSTM.has(k));

  console.log(`\n🔎 Comparación:`);
  console.log(`  match: ${setSTM.size === setProd.size && soloSTM.length === 0 ? '✅ IDÉNTICO' : '⚠️ DIVERGENCIA'}`);
  console.log(`  |STM|=${setSTM.size}  |Prod|=${setProd.size}`);
  if (soloSTM.length > 0) {
    console.log(`  Salidas solo en STM (${soloSTM.length}): ${soloSTM.slice(0, 5).join(', ')}${soloSTM.length > 5 ? '...' : ''}`);
  }
  if (soloProd.length > 0) {
    console.log(`  Salidas solo en Prod (${soloProd.length}): ${soloProd.slice(0, 5).join(', ')}${soloProd.length > 5 ? '...' : ''}`);
  }

  // 4. Frecuencia programada que reporta fleet-intel ahora
  const fleet = await axios.get(`${ENDPOINT_BASE}/api/ucot/fleet-intel`, { timeout: 15000 });
  const lineaFleet = fleet.data.lineas.find((l: any) => l.lineId === linea);
  if (lineaFleet) {
    console.log(`\n📊 fleet-intel (${linea}):`);
    console.log(`  tipoDiaHoy reportado: ${fleet.data.tipoDia}`);
    console.log(`  horaMontevideo: ${fleet.data.horaMontevideo}`);
    console.log(`  busesActivos: ${lineaFleet.busesActivos}`);
    console.log(`  frecuenciaProgramadaMin: ${lineaFleet.frecuenciaProgramadaMin}`);
    console.log(`  frecuenciaRealMin: ${lineaFleet.frecuenciaRealMin} (debe ser null)`);
    console.log(`  brechaPct: ${lineaFleet.brechaPct} (debe ser null)`);
    console.log(`  horaInicioProgramada: ${lineaFleet.horaInicioProgramada}`);
    console.log(`  horaFinProgramada: ${lineaFleet.horaFinProgramada}`);

    // Cuento manualmente cuántas salidas STM hay en ventana ±30min alrededor de hora Mvd
    const hhmm = fleet.data.horaMontevideo;
    const tipoDiaHoy = fleet.data.tipoDia;
    if (tipoDiaHoy === tipoDia) {
      const target = Number(hhmm.split(':')[0]) * 60 + Number(hhmm.split(':')[1]);
      let count = 0;
      for (const s of salidasSTM) {
        const m = Number(s.desde.split(':')[0]) * 60 + Number(s.desde.split(':')[1]);
        if (m >= target - 30 && m <= target + 30) count++;
      }
      const freqEsperada = count >= 2 ? Math.round(60 / count) : null;
      console.log(`\n  ✓ STM tiene ${count} salidas entre ${hhmm}±30min`);
      console.log(`  ✓ Frecuencia esperada: ${freqEsperada}min → reportada: ${lineaFleet.frecuenciaProgramadaMin}min`);
      console.log(`  ${freqEsperada === lineaFleet.frecuenciaProgramadaMin ? '✅ COINCIDE' : '⚠️ NO COINCIDE'}`);
    }
  }
}

main().catch((e) => {
  console.error('ERROR:', e?.message || e);
  process.exit(1);
});
