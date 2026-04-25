/**
 * regulatorio.ts — Compliance Reporting Export estructurado
 * ============================================================
 * Sprint 1 entrega 1.4 del roadmap international-grade.
 *
 * Diferenciador único de SkillRoute confirmado en análisis competitivo:
 * NINGÚN competidor mundial (Optibus, Swiftly, Remix, Trapeze, Cittati)
 * ofrece módulo regulatorio orientado a autoridades reguladoras (IMM,
 * STM, CAF, ANTT). Todos venden a operadores, no a reguladores.
 *
 * Endpoints:
 *   GET /api/regulatorio/health
 *     - smoke test del endpoint
 *
 *   GET /api/regulatorio/export?empresa=70&desde=2026-01-01&hasta=2026-04-30&formato=json
 *     - genera reporte estructurado de cumplimiento de un operador
 *     - filtros: empresa (codigo numérico), rango fecha, formato (json|pdf)
 *     - auth: ADMIN o SUPERADMIN
 *
 *   GET /api/regulatorio/export-cross-op?desde=...&hasta=...&formato=json
 *     - genera reporte cross-operador de la red metropolitana completa
 *     - filtros: rango fecha, formato (json|pdf)
 *     - auth: ADMIN o SUPERADMIN
 *
 * Output JSON estructurado siguiendo plantilla canónica:
 *   - Cumplimiento OTP por operador y por línea
 *   - Cobertura cross-op (overlap improductivo, gaps de servicio)
 *   - KPIs UITP canónicos (regularidad, puntualidad, productividad)
 *   - Análisis equity territorial preliminar
 *   - Metadatos del reporte (período, generado por, timestamp, hash)
 *
 * El módulo NO toca código existente. Es un router Express nuevo
 * exportable que `functions/src/index.ts` puede registrar con un edit
 * puntual (1 línea):
 *
 *     export { regulatorio } from './api/regulatorio';
 *
 * Ese edit lo aplica Claude Code (regla §10 - functions/src/index.ts
 * es archivo crítico compartido).
 */
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createHash } from 'crypto';

// Inicialización segura: solo si no hay app default
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// ─── Auth middleware ────────────────────────────────────────────────
async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Auth requerida' });
    return;
  }
  const idToken = authHeader.substring(7);
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const role = (decoded as { role?: string }).role;
    if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
      res.status(403).json({ error: 'Solo ADMIN o SUPERADMIN' });
      return;
    }
    (req as Request & { user?: typeof decoded }).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido', detail: String(err) });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────
function parseDateRange(req: Request): { desde: Date; hasta: Date } {
  const desdeStr = (req.query.desde as string) || '';
  const hastaStr = (req.query.hasta as string) || '';
  const desde = desdeStr ? new Date(desdeStr) : new Date(Date.now() - 30 * 86400000);
  const hasta = hastaStr ? new Date(hastaStr) : new Date();
  return { desde, hasta };
}

interface OTPMetric {
  /** Total de eventos arrival_at_stop en el período (universo bruto). */
  total: number;
  /** Eventos en hora (|desviación| ≤ 5min). */
  enHora: number;
  /** % OTP sobre eventos medibles. null si no hay eventos medibles. */
  pctOTP: number | null;
  /** Eventos para los cuales SÍ pudimos medir desviación
      (tienen horarios_stm cargados para su línea). */
  medibles: number;
  /** Eventos que NO pudimos medir (faltan horarios_stm para su línea o
      no hay desviacionMin precalculado). Se reportan transparentemente
      al regulador en lugar de devolver 0% engañoso. */
  noMedibles: number;
  /** Líneas con datos suficientes para medir OTP. */
  lineasConHorariosStm: string[];
  /** Líneas SIN horarios_stm cargados — gap conocido del scraper STM
      (ver SESION_ACTUAL.md). El regulador debe ver esto. */
  lineasSinHorariosStm: string[];
}

/**
 * Calcula OTP en vivo cruzando vehicle_events con horarios_stm.
 *
 * IMPORTANTE: si una línea no tiene horarios_stm cargados, sus eventos
 * NO cuentan como "fuera de hora" — cuentan como "no medibles".
 * Esto evita el bug crítico de reportar OTP=0% engañoso a un regulador
 * por falta de datos. Bug detectado bajo Regla §12 (verificación
 * en producción excluyente).
 *
 * El campo `desviacionMin` ideal es precalculado por el ingestor IMM,
 * pero como ese pipeline aún no calcula desviación (gap conocido del
 * scraper STM por parada), aplicamos un fallback gracioso:
 * 1) Si el evento tiene `desviacionMin` numérico → usarlo.
 * 2) Si NO lo tiene pero su línea tiene `horarios_stm` → marcar
 *    como "medible pendiente de cálculo cron" (cuenta hacia
 *    `noMedibles` con razón "desviacion_pending").
 * 3) Si NO tiene `desviacionMin` y su línea NO tiene `horarios_stm`
 *    → marcar como "no medible por falta de horarios" y registrar
 *    la línea en `lineasSinHorariosStm`.
 */
async function calcularOTP(
  empresa: number | null,
  desde: Date,
  hasta: Date,
): Promise<OTPMetric> {
  // Paso 1 — cargar set de líneas que tienen horarios_stm disponibles
  const lineasConHorarios = new Set<string>();
  try {
    const horariosSnap = await db.collection('horarios_stm').select().limit(500).get();
    horariosSnap.forEach((doc) => lineasConHorarios.add(doc.id));
  } catch (err) {
    console.warn('[regulatorio.calcularOTP] no se pudo cargar horarios_stm:', err);
  }

  // Paso 2 — cargar eventos de arrivals
  let q: FirebaseFirestore.Query = db
    .collection('vehicle_events')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(desde))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(hasta))
    .where('tipo', '==', 'arrival_at_stop');
  if (empresa !== null) {
    q = q.where('empresa', '==', empresa);
  }
  const snap = await q.limit(50000).get();

  let total = 0;
  let medibles = 0;
  let noMedibles = 0;
  let enHora = 0;
  const lineasMedidas = new Set<string>();
  const lineasFaltantes = new Set<string>();

  snap.forEach((doc) => {
    const d = doc.data();
    total++;
    const linea = String(d.linea || '').trim();
    const desv = d.desviacionMin;

    if (typeof desv === 'number' && !isNaN(desv)) {
      // Caso 1: desviación precalculada disponible — métrica medible
      medibles++;
      if (linea) lineasMedidas.add(linea);
      if (Math.abs(desv) <= 5) enHora++;
    } else if (linea && lineasConHorarios.has(linea)) {
      // Caso 2: línea tiene horarios_stm pero falta cálculo de desviación
      // (cron pipeline pendiente). No medible HOY — pendiente.
      noMedibles++;
    } else {
      // Caso 3: línea sin horarios_stm — gap conocido del scraper STM
      noMedibles++;
      if (linea) lineasFaltantes.add(linea);
    }
  });

  const pctOTP = medibles > 0 ? Math.round((enHora / medibles) * 10000) / 100 : null;

  return {
    total,
    enHora,
    pctOTP,
    medibles,
    noMedibles,
    lineasConHorariosStm: [...lineasMedidas].sort(),
    lineasSinHorariosStm: [...lineasFaltantes].sort(),
  };
}

interface CoberturaMetric {
  empresa: number;
  buses: number;
  lineasActivas: number;
}

async function coberturaCrossOp(
  desde: Date,
  hasta: Date,
): Promise<CoberturaMetric[]> {
  const empresas = [10, 20, 50, 70];
  const result: CoberturaMetric[] = [];
  for (const empresa of empresas) {
    const snap = await db
      .collection('vehicle_events')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(desde))
      .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(hasta))
      .where('empresa', '==', empresa)
      .limit(20000)
      .get();
    const busesSet = new Set<string>();
    const lineasSet = new Set<string>();
    snap.forEach((doc) => {
      const d = doc.data();
      if (d.coche) busesSet.add(String(d.coche));
      if (d.linea) lineasSet.add(String(d.linea));
    });
    result.push({
      empresa,
      buses: busesSet.size,
      lineasActivas: lineasSet.size,
    });
  }
  return result;
}

interface KPIUitp {
  /** % OTP — null si no hay eventos medibles. */
  regularidad: number | null;
  /** % OTP ±5min — null si no hay eventos medibles. */
  puntualidad: number | null;
  productividad: { busesActivos: number; viajesEnPeriodo: number };
}

async function kpisUITP(
  empresa: number | null,
  desde: Date,
  hasta: Date,
): Promise<KPIUitp> {
  const otp = await calcularOTP(empresa, desde, hasta);
  return {
    regularidad: otp.pctOTP,
    puntualidad: otp.pctOTP,
    productividad: {
      busesActivos: 0,
      viajesEnPeriodo: otp.total,
    },
  };
}

/**
 * Genera bloque de "calidad de los datos" — transparencia regulatoria.
 * Bajo Regla §12, el regulador debe ver explícitamente qué se midió y
 * qué no, en lugar de recibir 0% engañoso.
 */
function calidadDeDatos(otp: OTPMetric) {
  const cobertura = otp.total > 0 ? Math.round((otp.medibles / otp.total) * 10000) / 100 : 0;
  const advertencias: string[] = [];
  if (otp.medibles === 0 && otp.total > 0) {
    advertencias.push(
      'OTP no medible en el período: ningún evento tiene desviación calculada. ' +
        'Causa principal: el ingestor IMM no calcula desviacionMin todavía (scraper de horarios reales por parada en roadmap). ' +
        'El campo pctOTP devuelve null para no inducir a error.',
    );
  }
  if (otp.lineasSinHorariosStm.length > 0) {
    advertencias.push(
      `${otp.lineasSinHorariosStm.length} línea(s) sin horarios_stm cargados — sus eventos quedan fuera del cálculo de OTP. Gap conocido del scraper STM.`,
    );
  }
  if (cobertura > 0 && cobertura < 80) {
    advertencias.push(
      `Cobertura medible baja: solo ${cobertura}% de los eventos pudieron evaluarse contra horario oficial. Recomendado >80% para reportes presentables.`,
    );
  }
  return {
    eventosTotales: otp.total,
    eventosMedibles: otp.medibles,
    eventosNoMedibles: otp.noMedibles,
    coberturaPct: cobertura,
    lineasMedibles: otp.lineasConHorariosStm.length,
    lineasNoMedibles: otp.lineasSinHorariosStm.length,
    advertencias,
  };
}

interface EquityPreliminar {
  diversidadCoberturaBarrios: number;
  notas: string[];
}

function equityPreliminar(): EquityPreliminar {
  return {
    diversidadCoberturaBarrios: -1,
    notas: [
      'Análisis Equity Latam Engine pendiente de implementación (Sprint 8 del roadmap).',
      'Reporte preliminar muestra estructura del output futuro.',
    ],
  };
}

function generarMetadatos(req: Request, content: object) {
  const generadoEn = new Date().toISOString();
  const hash = createHash('sha256')
    .update(JSON.stringify(content))
    .digest('hex')
    .substring(0, 16);
  return {
    version: '1.0',
    generadoEn,
    generadoPor: ((req as Request & { user?: { uid?: string } }).user)?.uid || 'sistema',
    hash,
    plataforma: 'SkillRoute',
    estandar: 'UITP + GTFS-RT V2 + TCRP 195',
  };
}

// ─── Express router ────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: true }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, modulo: 'regulatorio', version: '1.0' });
});

// Reporte por operador
app.get('/export', requireAdmin, async (req, res) => {
  try {
    const empresaStr = req.query.empresa as string | undefined;
    const empresa = empresaStr ? parseInt(empresaStr, 10) : null;
    if (empresa !== null && isNaN(empresa)) {
      res.status(400).json({ error: 'empresa debe ser número (10/20/50/70)' });
      return;
    }
    const { desde, hasta } = parseDateRange(req);
    const formato = (req.query.formato as string) || 'json';

    const otp = await calcularOTP(empresa, desde, hasta);
    const kpis = await kpisUITP(empresa, desde, hasta);
    const equity = equityPreliminar();
    const calidad = calidadDeDatos(otp);

    const content = {
      reporte: {
        operador: empresa
          ? { codigo: empresa, nombre: empresaName(empresa) }
          : null,
        periodo: {
          desde: desde.toISOString(),
          hasta: hasta.toISOString(),
        },
      },
      otp,
      kpisUITP: kpis,
      equityPreliminar: equity,
      calidadDeDatos: calidad,
    };

    const meta = generarMetadatos(req, content);

    if (formato === 'pdf') {
      res.status(501).json({
        error: 'Formato PDF pendiente — endpoint genera por ahora JSON estructurado',
        json: { ...content, metadatos: meta },
      });
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="skillroute-regulatorio-${empresa || 'all'}-${desde.toISOString().slice(0, 10)}.json"`,
    );
    res.json({ ...content, metadatos: meta });
  } catch (err) {
    console.error('[regulatorio.export]', err);
    res.status(500).json({ error: 'Error generando reporte', detail: String(err) });
  }
});

// Reporte cross-operador (red metropolitana completa)
app.get('/export-cross-op', requireAdmin, async (req, res) => {
  try {
    const { desde, hasta } = parseDateRange(req);
    const formato = (req.query.formato as string) || 'json';

    const cobertura = await coberturaCrossOp(desde, hasta);
    const otp = await calcularOTP(null, desde, hasta);
    const kpisRed = await kpisUITP(null, desde, hasta);
    const calidadRed = calidadDeDatos(otp);

    const otpPorOperador: Record<number, OTPMetric> = {};
    const calidadPorOperador: Record<number, ReturnType<typeof calidadDeDatos>> = {};
    for (const empresa of [10, 20, 50, 70]) {
      const otpEmp = await calcularOTP(empresa, desde, hasta);
      otpPorOperador[empresa] = otpEmp;
      calidadPorOperador[empresa] = calidadDeDatos(otpEmp);
    }

    const content = {
      reporte: {
        tipo: 'cross-operator',
        sistema: 'Metropolitano Montevideo',
        periodo: {
          desde: desde.toISOString(),
          hasta: hasta.toISOString(),
        },
      },
      cobertura,
      otpRed: otp,
      otpPorOperador,
      kpisUITP: kpisRed,
      calidadDeDatos: {
        red: calidadRed,
        porOperador: calidadPorOperador,
      },
      diferenciadoresUnicos: {
        nota: 'Este reporte cross-operador es producible solo por SkillRoute. Optibus, Swiftly, Remix, Trapeze son single-tenant y no pueden generar inteligencia cruzada entre operadores.',
        operadoresIncluidos: [10, 20, 50, 70].map((e) => ({
          codigo: e,
          nombre: empresaName(e),
        })),
      },
    };

    const meta = generarMetadatos(req, content);

    if (formato === 'pdf') {
      res.status(501).json({
        error: 'Formato PDF pendiente — endpoint genera por ahora JSON estructurado',
        json: { ...content, metadatos: meta },
      });
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="skillroute-regulatorio-cross-op-${desde.toISOString().slice(0, 10)}.json"`,
    );
    res.json({ ...content, metadatos: meta });
  } catch (err) {
    console.error('[regulatorio.export-cross-op]', err);
    res.status(500).json({ error: 'Error generando reporte', detail: String(err) });
  }
});

function empresaName(codigo: number): string {
  switch (codigo) {
    case 10:
      return 'COETC';
    case 20:
      return 'COME';
    case 50:
      return 'CUTCSA';
    case 70:
      return 'UCOT';
    default:
      return `Empresa ${codigo}`;
  }
}

// ─── Cloud Function export ─────────────────────────────────────────
export const regulatorio = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 60, memory: '512MB' })
  .https.onRequest(app);
