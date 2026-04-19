/**
 * Scrapea las 9 líneas UCOT desde el STM (IMM) y genera un JSON master
 * con variantes OD reales + horarios completos por tipo de día.
 * Destino: frontend/src/data/ucotVariantsMaster.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchLineSchedule,
  frecuenciaPromedioVariante,
  type TipoDia,
  type VarianteHorario,
} from '../src/services/stmHorariosScraperService';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LINES = ['17', '79', '300', '306', '316', '328', '329', '330', '370'];
const DIAS: TipoDia[] = ['Hábiles', 'Sábados', 'Domingos'];

// canonical id: dedupe slash/underscore/trim/case-insensitive
function keyOD(v: VarianteHorario): string {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
  return `${norm(v.origen)} → ${norm(v.destino)}`;
}

interface VarianteOut {
  origen: string;
  destino: string;
  key: string;
  horarios: Record<TipoDia, { salidas: string[]; frecuenciaPromedioMin: number }>;
}

interface LineaOut {
  lineId: string;
  scrapedAt: string;
  variantes: VarianteOut[];
}

(async () => {
  const out: Record<string, LineaOut> = {};

  for (const lineId of LINES) {
    console.log(`\n▶ Scrapeando línea ${lineId}…`);
    const variantesAgg = new Map<string, VarianteOut>();

    for (const tipoDia of DIAS) {
      try {
        const h = await fetchLineSchedule(lineId, tipoDia);
        for (const v of h.variantes) {
          const k = keyOD(v);
          let existing = variantesAgg.get(k);
          if (!existing) {
            existing = {
              origen: v.origen.trim(),
              destino: v.destino.trim(),
              key: k,
              horarios: {} as VarianteOut['horarios'],
            };
            variantesAgg.set(k, existing);
          }
          existing.horarios[tipoDia] = {
            salidas: v.salidas.map((s) => s.desde),
            frecuenciaPromedioMin: frecuenciaPromedioVariante(v),
          };
        }
        console.log(`  ${tipoDia}: ${h.variantes.length} variantes, ${h.totalSalidas} salidas`);
      } catch (e) {
        console.error(`  ERROR ${tipoDia}: ${(e as Error).message}`);
      }
    }

    out[lineId] = {
      lineId,
      scrapedAt: new Date().toISOString(),
      variantes: [...variantesAgg.values()],
    };
  }

  const destDir = resolve(__dirname, '..', '..', 'frontend', 'src', 'data');
  mkdirSync(destDir, { recursive: true });
  const destPath = resolve(destDir, 'ucotVariantsMaster.json');
  writeFileSync(destPath, JSON.stringify(out, null, 2) + '\n');

  console.log(`\n✔ Guardado en ${destPath}`);
  for (const [lineId, data] of Object.entries(out)) {
    console.log(`  ${lineId}: ${data.variantes.length} variantes OD`);
    for (const v of data.variantes) {
      console.log(`    • ${v.key}`);
    }
  }
})();
