/**
 * ceo-decisions.ts
 * Endpoints para dashboard CEO - Decisiones ejecutivas en tiempo real
 *
 * INTEGRACIÓN SEGURA: NO modifica rutas existentes
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/ceo/decision-status
 * Estado de todas las decisiones ejecutivas del CEO
 */
router.get('/decision-status', (req: Request, res: Response) => {
  const orchestrator = (req.app as any).locals?.masterOrchestrator;

  if (!orchestrator) {
    return res.status(503).json({
      ok: false,
      message: 'Sistema de agentes no disponible',
    });
  }

  try {
    const ecosystems = orchestrator.getAllEcosystems();
    const stats = orchestrator.getAlertStatistics();

    const decisiones = {
      linea_300: {
        titulo: 'Servicio Directo 300D',
        accion: 'INYECTAR_DIRECTO_300',
        estado: 'pendiente', // o 'ejecutada', 'fallida'
        ingresos_estimados: '$6,400/mes',
        timeline: '15 minutos',
        alertas: (stats[300]?.total || 0),
      },
      linea_306: {
        titulo: 'Expansión Nocturna',
        accion: 'EXPANDIR_HORARIOS_306',
        estado: 'pendiente',
        ingresos_estimados: '$12,000/mes',
        timeline: '10 minutos',
        alertas: (stats[306]?.total || 0),
      },
      linea_316: {
        titulo: 'Carril Preferencial',
        accion: 'PETICION_CARRIL_316',
        estado: 'pendiente',
        ingresos_estimados: '$3,000/mes',
        timeline: '1 semana',
        alertas: (stats[316]?.total || 0),
      },
    };

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      resumen: {
        agentes_activos: ecosystems.reduce((sum, e) => sum + e.totalAgents, 0),
        lineas_monitoreadas: ecosystems.length,
        alertas_totales: Object.values(stats).reduce(
          (sum: number, line: any) => sum + (line.total || 0),
          0
        ),
      },
      decisiones,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'Error obteniendo estado de decisiones',
      error: String(error),
    });
  }
});

/**
 * POST /api/ceo/execute-decision
 * Ejecuta una decisión del CEO
 */
router.post('/execute-decision', async (req: Request, res: Response) => {
  const orchestrator = (req.app as any).locals?.masterOrchestrator;

  if (!orchestrator) {
    return res.status(503).json({
      ok: false,
      message: 'Sistema de agentes no disponible',
    });
  }

  try {
    const { linea, accion, parametros } = req.body;

    if (!linea || !accion) {
      return res.status(400).json({
        ok: false,
        message: 'Campos requeridos: linea, accion',
      });
    }

    // Generar alerta de decisión ejecutiva
    const alert = await orchestrator.requestAlert(linea, {
      tipo: 'ACCION_EJECUTIVA_CEO',
      accion: accion,
      recorrido: parametros?.recorrido || 'Decisión ejecutiva',
      sentido: 'ejecutiva',
      tiempo_minutos: parametros?.tiempo || null,
      mensaje: `Decisión ejecutiva del CEO: ${accion}`,
      acciones: parametros?.acciones || [],
    });

    res.json({
      ok: true,
      alerta: alert,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'Error ejecutando decisión',
      error: String(error),
    });
  }
});

/**
 * GET /api/ceo/impacto-financiero
 * Proyecciones de impacto financiero de decisiones
 */
router.get('/impacto-financiero', (req: Request, res: Response) => {
  const proyecciones = {
    mes_1: {
      linea_300D: { ingresos: 6400, costo: 2000, neto: 4400 },
      linea_306_nocturno: { ingresos: 12000, costo: 3000, neto: 9000 },
      tarifa_premium: { ingresos: 3000, costo: 500, neto: 2500 },
      total_neto: 15900,
      roi_porcentaje: 8.5,
    },
    mes_3: {
      total_neto_acumulado: 47700,
      roi_porcentaje: 25.5,
      cuota_mercado_esperada: '10%',
      otp_esperado: '80%',
    },
    ano_1: {
      ingresos_incrementales: 190800,
      costo_operativo: 72000,
      neto_anual: 118800,
      roi_anual: 102,
    },
  };

  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    proyecciones,
    riesgos: [
      {
        tipo: 'CUTCSA_RESPONDE_AGRESIVA',
        probabilidad: 'ALTA',
        mitigacion: 'Tener plan B con ruta alternativa',
      },
      {
        tipo: 'INGRESOS_REALES_BAJOS_20PCT',
        probabilidad: 'MEDIA',
        mitigacion: 'Ajustar tarifa o frecuencia',
      },
    ],
  });
});

export default router;
