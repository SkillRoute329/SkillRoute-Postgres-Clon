/**
 * /api/listero/* — Programación Diaria y Cascada Operativa
 *
 * Endpoints para:
 * - Gestión de turnos del día
 * - Registro de ausencias de conductores
 * - Asignación de reservas y vehículos de taller
 * - Alertas operativas
 * - Auto-generación de programación diaria
 *
 * Extraído de `intelligenceApi.ts` el 2026-04-24 como parte de la división
 * por dominio (ADR 003).
 */
import * as admin from 'firebase-admin';
import type { Express } from 'express';
import { fechaHoyMVD, hhmmAhoraMontevideo } from '../shared/timeUtils';

const getDb = () => admin.firestore();

// Importancia operativa por línea (para priorización de cobertura)
const IMPORTANCIA_LINEA_MAP: Record<string, number> = {
  '300': 5, '306': 5, '329': 4, '330': 4, '17': 4,
  '316': 4, '328': 3, '370': 3, '79': 3, '396': 2,
};

/**
 * Registra todas las rutas /api/listero/* en la app Express provista.
 */
export function registerListeroRoutes(app: Express) {
  // GET /api/listero/turnos?fecha=&turno=&agencyId=
  // agencyId opcional — si presente filtra por operador. Si ausente, devuelve
  // todos (compat con clientes legacy que no envían agencyId).
  app.get('/api/listero/turnos', async (req, res) => {
    const fecha = String(req.query.fecha || fechaHoyMVD());
    const turno = req.query.turno as string | undefined;
    const agencyId = req.query.agencyId as string | undefined;
    try {
      let q: admin.firestore.Query = getDb().collection('turnos_dia').where('fecha', '==', fecha);
      if (turno && turno !== 'todos') q = q.where('turnoNombre', '==', turno);
      if (agencyId) q = q.where('agencyId', '==', String(agencyId));
      const snap = await q.get();
      const turnos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, turnos });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/listero/turnos
  app.post('/api/listero/turnos', async (req, res) => {
    try {
      const data = { ...req.body, creadoEn: admin.firestore.FieldValue.serverTimestamp() };
      data.fecha = data.fecha || fechaHoyMVD();
      data.estado = data.estado || 'programado';
      const ref = await getDb().collection('turnos_dia').add(data);
      res.json({ ok: true, id: ref.id });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // PATCH /api/listero/turnos/:id
  app.patch('/api/listero/turnos/:id', async (req, res) => {
    try {
      await getDb().collection('turnos_dia').doc(req.params.id).update({
        ...req.body,
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/listero/conductores?agencyId=
  app.get('/api/listero/conductores', async (req, res) => {
    const agencyId = req.query.agencyId as string | undefined;
    try {
      let q: admin.firestore.Query = getDb().collection('personal');
      if (agencyId) q = q.where('agencyId', '==', String(agencyId));
      const snap = await q.get();
      const conductores = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          internalNumber: data.internalNumber || d.id,
          fullName: data.fullName || data.nombre || 'Sin nombre',
          rol: data.rol || data.role || 'Driver',
          estadoHoy: data.estadoHoy || 'disponible',
          turnoAsignado: data.turnoAsignado ?? null,
          lineaAsignada: data.lineaAsignada ?? null,
          vehiculoAsignado: data.vehiculoAsignado ?? null,
          esConductorReserva: data.esConductorReserva ?? (data.rol === 'reserva'),
          telefono: data.telefono ?? null,
        };
      });
      res.json({ ok: true, conductores });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/listero/ausencia
  app.post('/api/listero/ausencia', async (req, res) => {
    const { conductorId, conductorNombre, motivo, fecha } = req.body;
    const fechaHoy: string = fecha || fechaHoyMVD();
    try {
      if (conductorId) {
        await getDb().collection('personal').doc(conductorId).set(
          { estadoHoy: 'ausente', motivoAusencia: motivo, fechaAusencia: fechaHoy },
          { merge: true },
        );
      }

      const turnosSnap = await getDb().collection('turnos_dia')
        .where('conductorId', '==', conductorId)
        .where('fecha', '==', fechaHoy)
        .get();

      const turnosAfectados: string[] = [];
      let lineaId = 'desconocida';
      let importanciaLinea = 3;

      for (const doc of turnosSnap.docs) {
        const td = doc.data() as any;
        if (td.estado === 'programado' || td.estado === 'activo') {
          await doc.ref.update({ estado: 'sin_conductor', actualizadoEn: admin.firestore.FieldValue.serverTimestamp() });
          turnosAfectados.push(doc.id);
          lineaId = td.lineaId || lineaId;
          importanciaLinea = td.importanciaLinea || IMPORTANCIA_LINEA_MAP[td.lineaId] || 3;
        }
      }

      const reservasSnap = await getDb().collection('personal')
        .where('esConductorReserva', '==', true)
        .where('estadoHoy', '==', 'disponible')
        .get();
      const reservasDisponibles = reservasSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      let urgencia: string;
      let tipo: string;
      if (reservasDisponibles.length === 0 && importanciaLinea >= 4) {
        urgencia = 'critica'; tipo = 'infraccion_imminente';
      } else if (importanciaLinea >= 5) {
        urgencia = 'critica'; tipo = 'ausencia_conductor';
      } else if (importanciaLinea >= 4) {
        urgencia = 'alta'; tipo = 'ausencia_conductor';
      } else {
        urgencia = 'media'; tipo = 'ausencia_conductor';
      }

      await getDb().collection('alertas_operativas').add({
        tipo, urgencia, lineaId, conductorId,
        titulo: `Ausencia: ${conductorNombre || conductorId}`,
        mensaje: `${conductorNombre || conductorId} registró ausencia (${motivo}). Línea ${lineaId} afectada. ${reservasDisponibles.length} reservas disponibles.`,
        accionSugerida: reservasDisponibles.length > 0
          ? `Asignar ${reservasDisponibles[0].fullName} como reserva`
          : 'Contactar MTOP para permiso de frecuencia reducida',
        turnosAfectados,
        reservasDisponibles: reservasDisponibles.map((r) => ({ id: r.id, fullName: r.fullName })),
        impactoIngresosUSD: turnosAfectados.length * importanciaLinea * 30,
        atendida: false, fecha: fechaHoy,
        creadoEn: admin.firestore.FieldValue.serverTimestamp(),
      });

      const allSnap = await getDb().collection('turnos_dia').where('fecha', '==', fechaHoy).get();
      const total = allSnap.size;
      const sinConductor = allSnap.docs.filter((d) => (d.data() as any).estado === 'sin_conductor').length;
      if (total > 0 && sinConductor / total > 0.2) {
        await getDb().collection('alertas_operativas').add({
          tipo: 'cobertura_critica', urgencia: 'critica', lineaId: null,
          titulo: 'Cobertura de flota crítica',
          mensaje: `${sinConductor} de ${total} turnos sin conductor (${Math.round((sinConductor / total) * 100)}% sin cubrir).`,
          accionSugerida: 'Activar protocolo de emergencia: llamar al retén completo',
          atendida: false, fecha: fechaHoy,
          creadoEn: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      res.json({ ok: true, turnosAfectados, reservasDisponibles: reservasDisponibles.length, urgencia });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/listero/reserva
  app.post('/api/listero/reserva', async (req, res) => {
    const { turnoId, conductorReservaId, conductorReservaNombre } = req.body;
    try {
      await getDb().collection('turnos_dia').doc(turnoId).update({
        estado: 'cubierto_reserva',
        conductorReservaId, conductorReservaNombre,
        reservaActivada: true,
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (conductorReservaId) {
        await getDb().collection('personal').doc(conductorReservaId).set({ estadoHoy: 'en_servicio' }, { merge: true });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/listero/vehiculos-reserva
  app.get('/api/listero/vehiculos-reserva', async (_req, res) => {
    try {
      const snap = await getDb().collection('vehicles').where('estadoHoy', '==', 'disponible').get();
      const vehiculos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, vehiculos });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/listero/vehiculo-taller
  app.post('/api/listero/vehiculo-taller', async (req, res) => {
    const { vehiculoId, vehiculoInterno, motivo, fecha } = req.body;
    const fechaHoy: string = fecha || fechaHoyMVD();
    try {
      if (vehiculoId) {
        await getDb().collection('vehicles').doc(vehiculoId).set(
          { estadoHoy: 'en_taller', motivoTaller: motivo },
          { merge: true },
        );
      }

      const turnosSnap = await getDb().collection('turnos_dia')
        .where('vehiculoId', '==', vehiculoId)
        .where('fecha', '==', fechaHoy)
        .get();

      const turnosAfectados: string[] = [];
      for (const doc of turnosSnap.docs) {
        const td = doc.data() as any;
        if (td.estado === 'programado' || td.estado === 'activo') {
          await doc.ref.update({ estado: 'sin_conductor', vehiculoEnTaller: true, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() });
          turnosAfectados.push(doc.id);
        }
      }

      await getDb().collection('alertas_operativas').add({
        tipo: 'vehiculo_en_taller', urgencia: 'alta', lineaId: null,
        titulo: `Coche ${vehiculoInterno || vehiculoId} en taller`,
        mensaje: `Coche ${vehiculoInterno || vehiculoId} enviado a taller: ${motivo}. ${turnosAfectados.length} turnos afectados.`,
        accionSugerida: 'Buscar vehículo de reemplazo en el parque disponible',
        turnosAfectados, atendida: false, fecha: fechaHoy,
        creadoEn: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ ok: true, turnosAfectados });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/listero/firma
  app.post('/api/listero/firma', async (req, res) => {
    const { turnoId, horaFirma } = req.body;
    try {
      await getDb().collection('turnos_dia').doc(turnoId).update({
        firmaConductor: true,
        horaFirma: horaFirma || hhmmAhoraMontevideo(),
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/listero/alertas?fecha=&agencyId=
  app.get('/api/listero/alertas', async (req, res) => {
    const fecha = String(req.query.fecha || fechaHoyMVD());
    const historial = req.query.historial === 'true';
    const agencyId = req.query.agencyId as string | undefined;
    try {
      let q: admin.firestore.Query = getDb().collection('alertas_operativas').where('fecha', '==', fecha);
      if (agencyId) q = q.where('agencyId', '==', String(agencyId));
      const snap = await q.get();
      const alertas = snap.docs
        .map((d) => ({ id: d.id, ...d.data() as any }))
        .filter((a) => historial || !a.atendida)
        .sort((a, b) => ((b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0)))
        .slice(0, 50);
      res.json({ ok: true, alertas });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // PATCH /api/listero/alertas/:id/atender
  app.patch('/api/listero/alertas/:id/atender', async (req, res) => {
    try {
      await getDb().collection('alertas_operativas').doc(req.params.id).update({
        atendida: true,
        atendidaEn: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /api/listero/resumen?fecha=&agencyId=
  app.get('/api/listero/resumen', async (req, res) => {
    const fecha = String(req.query.fecha || fechaHoyMVD());
    const agencyId = req.query.agencyId as string | undefined;
    const withAgency = (q: admin.firestore.Query): admin.firestore.Query =>
      agencyId ? q.where('agencyId', '==', String(agencyId)) : q;
    try {
      const [turnosSnap, conductoresSnap, vehiculosSnap, alertasSnap] = await Promise.all([
        withAgency(getDb().collection('turnos_dia').where('fecha', '==', fecha)).get(),
        withAgency(getDb().collection('personal')).get(),
        withAgency(getDb().collection('vehicles')).get(),
        withAgency(getDb().collection('alertas_operativas').where('fecha', '==', fecha).where('atendida', '==', false)).get(),
      ]);

      const turnos = turnosSnap.docs.map((d) => d.data() as any);
      const conductores = conductoresSnap.docs.map((d) => d.data() as any);
      const vehiculos = vehiculosSnap.docs.map((d) => d.data() as any);

      const turnosTotal = turnos.length;
      const turnosCubiertos = turnos.filter((t) =>
        ['activo', 'completado', 'programado', 'cubierto_reserva'].includes(t.estado),
      ).length;
      const turnosSinConductor = turnos.filter((t) => t.estado === 'sin_conductor').length;
      const coberturaFlota = turnosTotal > 0 ? Math.round((turnosCubiertos / turnosTotal) * 100) : 100;

      const lineasEnRiesgoIMM = [
        ...new Set(
          turnos
            .filter((t) => t.estado === 'sin_conductor' && (t.importanciaLinea || 0) >= 4)
            .map((t) => t.lineaId),
        ),
      ].filter(Boolean) as string[];

      res.json({
        ok: true,
        resumen: {
          fecha, turnosTotal, turnosCubiertos, turnosSinConductor,
          conductoresDisponibles: conductores.filter((c) => c.estadoHoy === 'disponible' || c.estadoHoy === 'reserva').length,
          conductoresAusentes: conductores.filter((c) => c.estadoHoy === 'ausente').length,
          conductoresReservaLibres: conductores.filter((c) => c.esConductorReserva && c.estadoHoy === 'disponible').length,
          vehiculosEnTaller: vehiculos.filter((v) => v.estadoHoy === 'en_taller').length,
          coberturaFlota,
          alertasActivas: alertasSnap.size,
          impactoIngresosRiesgoUSD: turnosSinConductor * 150,
          lineasEnRiesgoIMM,
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/listero/generar-programacion
  app.post('/api/listero/generar-programacion', async (req, res) => {
    const fecha: string = String(req.body?.fecha || fechaHoyMVD());
    try {
      const existSnap = await getDb().collection('turnos_dia').where('fecha', '==', fecha).get();
      if (!existSnap.empty) {
        res.json({ ok: true, message: `Ya existen ${existSnap.size} turnos para ${fecha}`, created: 0 });
        return;
      }

      let conductoresSnap = await getDb().collection('personal').get();
      if (conductoresSnap.empty) conductoresSnap = await getDb().collection('users').get();

      let vehiculosSnap = await getDb().collection('vehicles').get();
      if (vehiculosSnap.empty) vehiculosSnap = await getDb().collection('vehiculos').get();

      const conductores = conductoresSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((c) => c.internalNumber || c.legajo || c.fullName || c.nombre);

      const vehiculos = vehiculosSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((v) => v.interno || v.coche || v.numero);

      if (conductores.length === 0) {
        const seedBatch = getDb().batch();
        const nombres = ['Carlos Pérez', 'María González', 'Juan Rodríguez', 'Ana Martínez', 'Luis García', 'Rosa López', 'Miguel Fernández', 'Laura Díaz'];
        nombres.forEach((nombre, i) => {
          const ref = getDb().collection('personal').doc(`C${String(i + 1).padStart(3, '0')}`);
          const [n, a] = nombre.split(' ');
          seedBatch.set(ref, {
            internalNumber: String(100 + i),
            fullName: nombre, firstName: n, lastName: a,
            rol: i === 7 ? 'reserva' : 'Driver',
            estadoHoy: 'disponible',
            esConductorReserva: i >= 6,
            telefono: `09${String(10000000 + i * 7)}`,
            generadoPorSistema: true,
          }, { merge: true });
        });
        await seedBatch.commit();
        const freshSnap = await getDb().collection('personal').get();
        conductores.push(...freshSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      }

      if (vehiculos.length === 0) {
        const vBatch = getDb().batch();
        for (let i = 0; i < 12; i++) {
          const interno = String(115 + i * 7);
          const ref = getDb().collection('vehicles').doc(`VEH${interno}`);
          vBatch.set(ref, {
            interno, numero: interno,
            tipo: i < 4 ? 'electrico' : i < 8 ? 'hibrido' : 'diesel',
            estadoHoy: 'disponible', capacidad: 80,
            anio: 2018 + (i % 5),
            generadoPorSistema: true,
          }, { merge: true });
        }
        await vBatch.commit();
        const freshSnap = await getDb().collection('vehicles').get();
        vehiculos.push(...freshSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      }

      const lineasOperativas = [
        { id: '300', importancia: 5, terminal: 'Instrucciones - Plaza Zitarrosa' },
        { id: '306', importancia: 5, terminal: 'Parque Roosevelt - Casabó' },
        { id: '329', importancia: 4, terminal: 'Punta Carretas - Melilla' },
        { id: '330', importancia: 4, terminal: 'Instrucciones - Ciudadela' },
        { id: '17',  importancia: 4, terminal: 'Punta Carretas - Casabó' },
        { id: '316', importancia: 4, terminal: 'Cno. Maldonado - Pocitos' },
        { id: '328', importancia: 3, terminal: 'Mendoza - Punta Carretas' },
        { id: '370', importancia: 3, terminal: 'Portones - Playa del Cerro' },
        { id: '79',  importancia: 3, terminal: 'Pocitos - Paso de la Arena' },
      ];

      const bloquesTurno = [
        { nombre: 'madrugada', horas: ['04:30', '05:00', '05:30'] },
        { nombre: 'mañana',    horas: ['06:00', '06:30', '07:00', '07:30', '08:00'] },
        { nombre: 'tarde',     horas: ['12:00', '12:30', '13:00', '13:30'] },
        { nombre: 'noche',     horas: ['18:00', '18:30', '19:00', '19:30'] },
      ];

      const batch = getDb().batch();
      let cIdx = 0, vIdx = 0, created = 0;

      for (const linea of lineasOperativas) {
        for (const bloque of bloquesTurno) {
          for (const hora of bloque.horas) {
            const c = conductores[cIdx % conductores.length];
            const v = vehiculos[vIdx % vehiculos.length];
            const [hh, mm] = hora.split(':').map(Number);
            const llegadaMin = hh * 60 + mm + 90;
            const horaLlegada = `${String(Math.floor(llegadaMin / 60) % 24).padStart(2, '0')}:${String(llegadaMin % 60).padStart(2, '0')}`;

            const ref = getDb().collection('turnos_dia').doc();
            batch.set(ref, {
              fecha, conductorId: c.id,
              conductorNombre: c.fullName || c.nombre || `Cond ${c.internalNumber || c.legajo || cIdx}`,
              conductorInterno: String(c.internalNumber || c.legajo || cIdx + 100),
              vehiculoId: v.id,
              vehiculoInterno: String(v.interno || v.coche || v.numero || vIdx + 100),
              lineaId: linea.id, turnoNombre: bloque.nombre, turno: bloque.nombre,
              horaSalida: hora, horaLlegadaEstimada: horaLlegada,
              terminal: linea.terminal, estado: 'programado',
              importanciaLinea: linea.importancia,
              impactoIngresosEstimado: linea.importancia * 30,
              firmaConductor: false, horaFirma: null,
              reservaActivada: false,
              conductorReservaId: null, conductorReservaNombre: null,
              observaciones: null, generadoAutomaticamente: true,
              creadoEn: admin.firestore.FieldValue.serverTimestamp(),
            });
            cIdx++; vIdx++; created++;
          }
        }
      }

      await batch.commit();
      res.json({ ok: true, message: `Programación generada: ${created} turnos para ${fecha}`, created });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}
