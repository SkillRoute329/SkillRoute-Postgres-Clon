import express from 'express';
import healthRouter from './routes/health';
import inferRouter from './routes/infer';
import reprocessRouter from './routes/reprocess';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/health', healthRouter);
app.use('/infer', inferRouter);
app.use('/reprocess', reprocessRouter);

// Catch-all para rutas no encontradas
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[matching-engine] Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, () => {
  console.log(`[matching-engine] Servidor iniciado en puerto ${PORT}`);
});

export default app;
