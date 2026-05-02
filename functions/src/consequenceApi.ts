/**
 * /consequencePreview — Motor de Consecuencias (HTTP endpoint)
 * =============================================================
 * Dado un evento operativo, simula la cascada completa de efectos
 * sin escribir datos reales. Es un "¿qué pasa si...?" en tiempo real.
 *
 * POST /consequencePreview
 * Body: { evento: EventoOperativo, contexto?: Partial<ContextoConsecuencia> }
 * Response: ResultadoPropagacion
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { propagarEvento, ContextoConsecuencia, EventoOperativo } from './consequenceEngine';
import { obtenerReglasEmpresa } from './rules/index';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const consequencePreview = onRequest(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 30 },
  async (req, res) => {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Solo POST' }); return; }

    try {
      const { evento, contexto: contextoOverride } = req.body as {
        evento: EventoOperativo;
        contexto?: Partial<ContextoConsecuencia>;
      };

      if (!evento?.tipo || !evento?.empresaId) {
        res.status(400).json({ ok: false, error: 'evento.tipo y evento.empresaId son requeridos' });
        return;
      }

      const reglas = obtenerReglasEmpresa(evento.empresaId);
      if (!reglas) {
        res.status(422).json({
          ok: false,
          error: `Empresa ${evento.empresaId} no tiene reglas configuradas aún.`,
          empresasDisponibles: ['70'],
        });
        return;
      }

      // Construir contexto real desde Firestore (o usar override para testing)
      const contexto = await construirContexto(evento, contextoOverride);

      const resultado = propagarEvento(evento, reglas, contexto);

      res.status(200).json({ ok: true, ...resultado });
    } catch (err: any) {
      console.error('[consequencePreview] error:', err);
      res.status(500).json({ ok: false, error: err?.message ?? 'Error interno' });
    }
  }
);

// ── Construye el contexto consultando Firestore ───────────────────────────────

async function construirContexto(
  evento: EventoOperativo,
  override: Partial<ContextoConsecuencia> = {}
): Promise<ContextoConsecuencia> {
  const db = getFirestore();
  const empresaId = evento.empresaId;

  // Contexto base (con defaults seguros)
  let contexto: ContextoConsecuencia = {
    ausenciasUltimos30Dias: 0,
    reservasDisponibles: [],
    viajesAfectados: 3,       // default conservador
    otpActualLinea: 90,
    busesEnLinea: 10,
    pasajerosPromedio: 35,
    ...override,
  };

  try {
    // Si el evento involucra un conductor, buscar sus ausencias recientes
    const conductorId = (evento as any).conductorId;
    if (conductorId && !override.ausenciasUltimos30Dias) {
      const hace30Dias = new Date();
      hace30Dias.setDate(hace30Dias.getDate() - 30);
      const snap = await db
        .collection('licencias_personal')
        .where('employeeId', '==', conductorId)
        .where('empresaId', '==', empresaId)
        .where('startDate', '>=', hace30Dias.toISOString().slice(0, 10))
        .get();
      contexto.ausenciasUltimos30Dias = snap.size;
    }

    // Buscar conductores de reserva disponibles (estado libre)
    if (!override.reservasDisponibles) {
      const fecha = (evento as any).fecha ?? new Date().toISOString().slice(0, 10);
      const snap = await db
        .collection('daily_shifts')
        .where('empresaId', '==', empresaId)
        .where('date', '==', fecha)
        .where('estado', '==', 'reserva_disponible')
        .limit(5)
        .get();
      contexto.reservasDisponibles = snap.docs.map((d) => ({
        id: d.id,
        nombre: d.data().conductorNombre ?? 'Conductor de reserva',
      }));
    }

    // OTP actual de la línea
    const lineaId = (evento as any).lineaId;
    if (lineaId && !override.otpActualLinea) {
      const otpSnap = await db
        .collection('otp_daily')
        .where('lineaId', '==', lineaId)
        .where('empresaId', '==', empresaId)
        .orderBy('fecha', 'desc')
        .limit(1)
        .get();
      if (!otpSnap.empty) {
        contexto.otpActualLinea = otpSnap.docs[0]!.data().otp ?? 90;
      }
    }

    // Viajes afectados: contar servicios del turno
    const turnoId = (evento as any).turnoId;
    if (turnoId && !override.viajesAfectados) {
      const turnoDoc = await db.collection('daily_shifts').doc(turnoId).get();
      if (turnoDoc.exists) {
        const data = turnoDoc.data();
        contexto.viajesAfectados = data?.tripCount ?? 3;
        contexto.busesEnLinea = data?.busesEnLinea ?? 10;
      }
    }
  } catch (_e) {
    // Si Firestore falla, usar los defaults — no bloquear la simulación
  }

  return contexto;
}
