import sqlDb from '../config/database';
import { logger } from '../config/logger';

export interface OperationalFinancialImpact {
  hora: number;
  validacionesPromedio: number;
  demandaPorMinuto: number;
  demoraPromedioMin: number;
  pasajerosEnRiesgo: number;
  perdidaEconomicaEstimada: number;
}

export interface CompetitorFinancialDrain {
  lineaCompetidor: string;
  agenciaCompetidor: string;
  nombreEmpresaCompetidor: string;
  porcentajeSolapamiento: number;
  fugaPasajerosEstimadaMes: number;
  fugaEconomicaEstimadaMes: number;
}

export interface CorrelationAnalysisResult {
  lineaId: string;
  agencyId: string;
  sentido: 'IDA' | 'VUELTA';
  periodoDias: number;
  validacionesTotalesMes: number;
  ingresoEstimadoBaseMes: number;
  demoraPromedioGlobalMin: number;
  pasajerosTotalesEnRiesgoMes: number;
  fugaEconomicaTotalMes: number;
  impactoFinancieroSobreIngresoPct: number;
  detallePorHora: OperationalFinancialImpact[];
  competidoresDrenandoIngresos: CompetitorFinancialDrain[];
  picoDeFugaEconomica: {
    hora: number;
    perdidaHora: number;
    causa: string;
  } | null;
  sugerenciasEstrategicas: string[];
}

class CrossModuleCorrelationService {
  private readonly PRECIO_BOLETO_MONTEVIDEO = 56.0; // Pesos URU promedio
  private readonly DIAS_COMERCIALES_MES = 22;       // Días hábiles comerciales promedio

  /**
   * Realiza el cruce definitivo inter-módulos segmentado por DESTINO (Sentido):
   * Venta de Boletos (GTFS Segmentado) + Demoras Reales (GPS) + Competencia (Corredor Geográfico)
   */
  async analyzeOperationalFinancialCorrelation(
    lineaId: string,
    agencyId: string = '70', // Por defecto UCOT
    sentido: 'IDA' | 'VUELTA' = 'IDA',
    diasHistorico: number = 14
  ): Promise<CorrelationAnalysisResult> {
    try {
      const cleanSentido = sentido.toUpperCase() === 'VUELTA' ? 'VUELTA' : 'IDA';
      logger.info(`[CorrelationEngine] Iniciando análisis segmentado para línea ${lineaId}, Destino: ${cleanSentido} (agencia: ${agencyId})`);

      // FASE 5.21 (2026-05-17): se ELIMINA el mapeo GTFS de paradas por
      // dirección + el scan de stm_validaciones_mensual (33M filas con
      // whereIn de cientos de codigo_parada) → causaba timeout >30s
      // ("Simulador da error"). Se usa la MV STM ya agregada por
      // línea/hora/mes (dato oficial idéntico, sin scan masivo). La demanda
      // STM es a nivel línea (el split por sentido lo aporta el GPS de
      // demoras, que sí es por sentido) — honesto y rápido.
      const codEmpresaMap: Record<string, number> = { '70': 70, '10': 10, '20': 20, '50': 50 };
      const codEmpresa = codEmpresaMap[agencyId] || 70;

      const ultMesRow = (await sqlDb('mv_stm_demanda_linea_hora')
        .where('cod_empresa', codEmpresa)
        .where('dsc_linea', lineaId)
        .max('mes as m')
        .first()) as { m: string | null } | undefined;

      const rawValidaciones = ultMesRow?.m
        ? ((await sqlDb('mv_stm_demanda_linea_hora')
            .select('hora')
            .sum('validaciones as total_validaciones')
            .where('cod_empresa', codEmpresa)
            .where('dsc_linea', lineaId)
            .where('mes', ultMesRow.m)
            .where('tipo_dia', 'habil')
            .groupBy('hora')
            .orderBy('hora')) as Array<{ hora: number; total_validaciones: string }>)
        : [];

      const mapValidaciones = new Map<number, number>();
      let validacionesTotales = 0;
      rawValidaciones.forEach((row: any) => {
        const v = parseInt(row.total_validaciones || 0, 10);
        mapValidaciones.set(parseInt(row.hora, 10), v);
        validacionesTotales += v;
      });

      // FASE 5.21 (2026-05-17): ELIMINADO el fallback que INYECTABA curvas de
      // demanda inventadas (picos 450/500) cuando no había STM real. Eso es
      // exactamente el dato fabricado por el que IMM rechazó el sistema. Si
      // no hay validaciones STM reales para esta línea/sentido, se devuelve
      // un resultado HONESTO "sin datos" en vez de simular una fuga económica.
      if (validacionesTotales === 0) {
        logger.warn(`[CorrelationEngine] Sin validaciones STM reales para ${lineaId} (${cleanSentido}) — devuelvo sin-datos honesto`);
        return {
          lineaId,
          agencyId,
          sentido: cleanSentido,
          periodoDias: diasHistorico,
          validacionesTotalesMes: 0,
          ingresoEstimadoBaseMes: 0,
          demoraPromedioGlobalMin: 0,
          pasajerosTotalesEnRiesgoMes: 0,
          fugaEconomicaTotalMes: 0,
          impactoFinancieroSobreIngresoPct: 0,
          detallePorHora: [],
          competidoresDrenandoIngresos: [],
          picoDeFugaEconomica: null,
          sugerenciasEstrategicas: [
            `Sin datos STM oficiales de validaciones para la línea ${lineaId} en el recorrido ${cleanSentido}. No se estima fuga económica para no reportar cifras inventadas — se requiere ingesta STM de esta línea.`,
          ],
        };
      }

      // 2. Obtener demoras promedio del histórico GPS filtrando únicamente este sentido
      const since = new Date(Date.now() - diasHistorico * 24 * 60 * 60 * 1000);
      
      // FASE 5.21 (2026-05-17): se filtraba/agrupaba por timestamp_gps (sin
      // índice) → seq scan de 32M filas y timeout 30s ("Simulador da error").
      // created_at es ~el mismo instante (ms de diferencia) y SÍ está indexado
      // por idx_ve_linea_created (linea, created_at). Una sola línea en N días
      // son miles de filas → respuesta inmediata, mismo dato real.
      const rawDemoras = await sqlDb('vehicle_events')
        .select(sqlDb.raw("EXTRACT(HOUR FROM created_at) as hora"))
        .avg('desviacion_min as avg_delay')
        .count('id as total_eventos')
        .where('linea', lineaId)
        .where('agency_id', agencyId)
        .where('sentido', cleanSentido) // Filtro geográfico de telemetría operacional
        .whereNotNull('desviacion_min')
        .where('created_at', '>=', since)
        .groupByRaw("EXTRACT(HOUR FROM created_at)")
        .orderByRaw("EXTRACT(HOUR FROM created_at)");

      const mapDemoras = new Map<number, number>();
      let sumaDemorasTotales = 0;
      let conteoHorasConDatos = 0;
      
      rawDemoras.forEach((row: any) => {
        const h = Math.floor(Number(row.hora));
        const d = Math.max(0, Number(row.avg_delay || 0)); 
        mapDemoras.set(h, d);
        sumaDemorasTotales += d;
        conteoHorasConDatos++;
      });

      const demoraPromedioGlobal = conteoHorasConDatos > 0 ? sumaDemorasTotales / conteoHorasConDatos : 0;

      // 3. Obtener líneas competidoras filtrando solapamiento por este sentido específico
      const rawCompetidores = await sqlDb('corridor_overlap')
        .select('linea_b', 'agency_b', 'pct_a_in_b', 'data_jsonb')
        .where('linea_a', lineaId)
        .where('agency_a', agencyId)
        .where('sentido_a', cleanSentido) // Solapamiento exacto para esta dirección
        .where('same_empresa', false)
        .orderBy('pct_a_in_b', 'desc')
        .limit(5);

      let solapamientoCompetitivoTotalPct = 0;
      const competidores: CompetitorFinancialDrain[] = [];

      rawCompetidores.forEach((comp: any) => {
        const pct = parseFloat(comp.pct_a_in_b || 0);
        const empresaName = comp.data_jsonb?.empresaB || `Operador ${comp.agency_b}`;
        
        competidores.push({
          lineaCompetidor: comp.linea_b,
          agenciaCompetidor: comp.agency_b,
          nombreEmpresaCompetidor: empresaName,
          porcentajeSolapamiento: pct,
          fugaPasajerosEstimadaMes: 0, 
          fugaEconomicaEstimadaMes: 0  
        });
        solapamientoCompetitivoTotalPct += pct;
      });

      const factorCompetenciaNeto = Math.min(1.0, solapamientoCompetitivoTotalPct / 100);

      // 4. Ejecutar la correlación horaria segmentada
      const detalleHorario: OperationalFinancialImpact[] = [];
      let pasajerosEnRiesgoMesAcumulados = 0;
      let perdidaEconomicaMesAcumulada = 0;
      
      let maxPerdidaHora = -1;
      let horaPicoFuga = -1;

      for (let h = 5; h <= 23; h++) {
        const validacionesMesHora = mapValidaciones.get(h) || 0;
        const validacionesDiaHora = validacionesMesHora > 0 ? (validacionesMesHora / 30) : 0;
        const demandaPorMinuto = validacionesDiaHora / 60;
        
        const demoraMin = mapDemoras.has(h) ? mapDemoras.get(h)! : (demoraPromedioGlobal > 0 ? demoraPromedioGlobal : 3.5);
        
        const pasajerosEnRiesgoDia = demoraMin * demandaPorMinuto * factorCompetenciaNeto;
        const perdidaDia = pasajerosEnRiesgoDia * this.PRECIO_BOLETO_MONTEVIDEO;

        const pasajerosEnRiesgoMes = pasajerosEnRiesgoDia * this.DIAS_COMERCIALES_MES;
        const perdidaMes = perdidaDia * this.DIAS_COMERCIALES_MES;

        pasajerosEnRiesgoMesAcumulados += pasajerosEnRiesgoMes;
        perdidaEconomicaMesAcumulada += perdidaMes;

        if (perdidaMes > maxPerdidaHora) {
          maxPerdidaHora = perdidaMes;
          horaPicoFuga = h;
        }

        detalleHorario.push({
          hora: h,
          validacionesPromedio: Math.round(validacionesDiaHora),
          demandaPorMinuto: parseFloat(demandaPorMinuto.toFixed(3)),
          demoraPromedioMin: parseFloat(demoraMin.toFixed(1)),
          pasajerosEnRiesgo: Math.round(pasajerosEnRiesgoMes),
          perdidaEconomicaEstimada: Math.round(perdidaMes)
        });
      }

      // 5. Distribuir la fuga económica entre rivales de esta dirección
      if (solapamientoCompetitivoTotalPct > 0) {
        competidores.forEach(c => {
          const ratioDeFuga = c.porcentajeSolapamiento / solapamientoCompetitivoTotalPct;
          c.fugaPasajerosEstimadaMes = Math.round(pasajerosEnRiesgoMesAcumulados * ratioDeFuga);
          c.fugaEconomicaEstimadaMes = Math.round(perdidaEconomicaMesAcumulada * ratioDeFuga);
        });
      }

      // 6. Indicadores de dirección y sugerencias
      const ingresoEstimadoBaseMes = (validacionesTotales / 30) * this.DIAS_COMERCIALES_MES * this.PRECIO_BOLETO_MONTEVIDEO;
      const ingresoPotencialTotal = ingresoEstimadoBaseMes + perdidaEconomicaMesAcumulada;
      const impactoPct = ingresoPotencialTotal > 0 ? (perdidaEconomicaMesAcumulada / ingresoPotencialTotal) * 100 : 0;

      const sugerencias: string[] = [];
      
      const nombreRecorrido = cleanSentido === 'IDA' ? 'IDA (al centro)' : 'VUELTA (hacia terminal)';
      
      if (demoraPromedioGlobal > 8) {
        sugerencias.push(
          `AJUSTE DE TIEMPO DE VIAJE EN ${nombreRecorrido.toUpperCase()}: El retraso global de ${demoraPromedioGlobal.toFixed(1)} min en este recorrido revela saturación vial. Los competidores están capitalizando el pasaje acumulado.`
        );
      }

      if (horaPicoFuga !== -1 && maxPerdidaHora > 5000) {
        sugerencias.push(
          `INTERVENCIÓN RENTABLE A LAS ${horaPicoFuga}:00 HS (RECORRIDO ${cleanSentido}): En este pico se pierden $${Math.round(maxPerdidaHora).toLocaleString()} URU/mes. Adelantar 4-5 minutos la partida en este sentido específico captura la demanda estacional.`
        );
      }

      if (competidores.length > 0 && competidores[0].fugaEconomicaEstimadaMes > 12000) {
        sugerencias.push(
          `DISPUTA DE PARADAS VS LÍNEA ${competidores[0].lineaCompetidor} (${competidores[0].nombreEmpresaCompetidor}): Es el principal drenador del recorrido de ${cleanSentido}, sustrayendo $${competidores[0].fugaEconomicaEstimadaMes.toLocaleString()} URU/mes por solapamiento.`
        );
      }

      if (sugerencias.length === 0) {
        sugerencias.push(`El recorrido de ${nombreRecorrido} se encuentra blindado y con óptimos niveles de puntualidad.`);
      }

      const pico = horaPicoFuga !== -1 ? {
        hora: horaPicoFuga,
        perdidaHora: Math.round(maxPerdidaHora),
        causa: `Pico de demanda en el trayecto de ${nombreRecorrido} expuesto a retraso operativo.`
      } : null;

      logger.info(`[CorrelationEngine] Análisis finalizado con éxito para ${lineaId} (${cleanSentido}). Pérdida: $${Math.round(perdidaEconomicaMesAcumulada)}`);

      return {
        lineaId,
        agencyId,
        sentido: cleanSentido,
        periodoDias: diasHistorico,
        validacionesTotalesMes: Math.round(validacionesTotales),
        ingresoEstimadoBaseMes: Math.round(ingresoEstimadoBaseMes),
        demoraPromedioGlobalMin: parseFloat(demoraPromedioGlobal.toFixed(1)),
        pasajerosTotalesEnRiesgoMes: Math.round(pasajerosEnRiesgoMesAcumulados),
        fugaEconomicaTotalMes: Math.round(perdidaEconomicaMesAcumulada),
        impactoFinancieroSobreIngresoPct: parseFloat(impactoPct.toFixed(2)),
        detallePorHora: detalleHorario,
        competidoresDrenandoIngresos: competidores,
        picoDeFugaEconomica: pico,
        sugerenciasEstrategicas: sugerencias
      };

    } catch (error: any) {
      logger.error(`[CorrelationEngine] Error crítico generando análisis de dirección: ${error?.message || error}`);
      throw error;
    }
  }
}

export const crossModuleCorrelationService = new CrossModuleCorrelationService();
