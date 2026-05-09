// Export del trigger Cloud Scheduler para aggregation-engine
// SPEC_CUMPLIMIENTO_V2_BACKEND_2026_05.md §3.1
import * as functions from 'firebase-functions/v1';
import { runAggregation } from './aggregationEngine';

// Cron diario 03:00 UY (= 06:00 UTC porque UY es UTC-3)
// Los lunes también calcula WEEKLY; el 1º de mes también MONTHLY.
export const aggregationEngineCron = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('0 6 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    try {
      const result = await runAggregation();
      console.log('[AggregationEngine] Completado:', JSON.stringify(result));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[AggregationEngine] Error fatal:', msg);
    }
    return null;
  });

// Cron intra-día 15:00 UY (= 18:00 UTC) — procesa el día actual con datos parciales.
// PATTERN-001: el cron nocturno solo procesa ayer; este cierra el gap durante el día.
export const aggregationEngineMidDayCron = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .pubsub.schedule('0 18 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const uyNow = new Date(Date.now() - 3 * 3600000);
    const today = uyNow.toISOString().slice(0, 10);
    try {
      const result = await runAggregation(today);
      console.log('[AggregationEngine] MidDay completado:', JSON.stringify(result));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[AggregationEngine] MidDay error:', msg);
    }
    return null;
  });

// HTTP trigger para ejecución manual / testing
export const aggregationEngineNow = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    const targetDate = req.query.date as string | undefined;
    try {
      const result = await runAggregation(targetDate);
      res.json({ ok: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });
