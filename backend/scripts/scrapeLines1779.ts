import { fetchLineSchedule, frecuenciaLineaDominante, TipoDia } from '../src/services/stmHorariosScraperService';

const LINES = ['17', '79'];
const DIAS: TipoDia[] = ['Hábiles', 'Sábados', 'Domingos'];

(async () => {
  for (const linea of LINES) {
    for (const tipoDia of DIAS) {
      try {
        const h = await fetchLineSchedule(linea, tipoDia);
        const freq = frecuenciaLineaDominante(h);
        console.log(`\n=== LÍNEA ${linea} / ${tipoDia} ===`);
        console.log(`total salidas: ${h.totalSalidas}  freq dominante: ${freq} min`);
        for (const v of h.variantes) {
          const primera = v.salidas[0]?.desde ?? '—';
          const ultima = v.salidas[v.salidas.length - 1]?.desde ?? '—';
          console.log(`  • ${v.origen} → ${v.destino}   salidas=${v.salidas.length}   ${primera}..${ultima}`);
        }
      } catch (e) {
        console.error(`ERROR línea=${linea} tipoDia=${tipoDia}:`, (e as Error).message);
      }
    }
  }
})();
