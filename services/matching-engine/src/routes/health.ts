import { Router, Request, Response } from 'express';
import { cacheStats } from '../lib/shapeCache';
import { ALGO_VERSION } from '../lib/senseInference';

const router = Router();

let lastInferAt: string | null = null;
const startedAt = Date.now();

export function updateLastInferAt(ts: string): void {
  lastInferAt = ts;
}

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: ALGO_VERSION,
    uptimeS: Math.floor((Date.now() - startedAt) / 1000),
    lastInferAt,
    shapeCache: cacheStats(),
  });
});

export default router;
