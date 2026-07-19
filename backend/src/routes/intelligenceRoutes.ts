import { Router } from 'express';
import { getCompetitors, getMonthlyTrends } from '../controllers/intelligenceController';

const router = Router();

// Endpoint para obtener los competidores de una línea específica basado en el solapamiento estático.
router.get('/competitors', getCompetitors);

// Endpoint para obtener las tendencias mensuales de boletos (carga) entre dos líneas que compiten.
router.get('/trends', getMonthlyTrends);

export default router;
