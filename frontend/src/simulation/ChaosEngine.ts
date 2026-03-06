import { db } from '../config/firebase';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  GeoPoint,
  writeBatch,
} from 'firebase/firestore';

export class ChaosEngine {
  private static intervalId: NodeJS.Timeout | null = null;
  private static running = false;
  private static eventCallback: (msg: string) => void = (msg) => console.log(msg);

  static setCallback(cb: (msg: string) => void) {
    this.eventCallback = cb;
  }

  static start() {
    if (this.running) return;
    this.running = true;
    this.log('🚀 [CHAOS ENGINE] Iniciando Simulación de Vida (24H)...');
    this.log('⚠️ PRECAUCIÓN: Estrés constante sobre DB Firestore');

    let cycles = 0;

    this.intervalId = setInterval(async () => {
      cycles++;
      try {
        // 1. GPS MOVEMENT (Heartbeat)
        await this.moveFleet();

        // 2. PASSENGER FLUX
        if (cycles % 2 === 0) await this.updatePassengers();

        // 3. RANDOM BREAKDOWN (Every 60 cycles ~ 5 mins in real time, but here every 5s * 60 = 5m? No, user said 5s heartbeat)
        // Let's make it faster for demo: Every 10 cycles (50s)
        if (cycles % 10 === 0) await this.triggerBreakdown();

        // 4. AUTO REPAIR (Every 5 cycles)
        if (cycles % 5 === 0) await this.attemptRepairs();

        this.log(`⏱️ Ciclo ${cycles} completado. Sistema VIVO.`);
      } catch (e: any) {
        console.error('Chaos Error:', e);
        this.log(`❌ Error en Ciclo: ${e.message}`);
      }
    }, 5000); // 5 Seconds Heartbeat
  }

  static stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.running = false;
    this.log('🛑 [CHAOS ENGINE] Simulación Detenida.');
  }

  private static log(msg: string) {
    const time = new Date().toLocaleTimeString();
    this.eventCallback(`[${time}] ${msg}`);
  }

  // --- LOGIC ---

  private static async moveFleet() {
    const snapshot = await getDocs(collection(db, 'vehiculos'));
    const batch = writeBatch(db);
    let moved = 0;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const currentGeo = data.ubicacion_actual || new GeoPoint(-34.9, -56.1);

      // Random Jitter (0.001 deg ~ 100m)
      const latchg = (Math.random() - 0.5) * 0.002;
      const lngchg = (Math.random() - 0.5) * 0.002;

      batch.update(docSnap.ref, {
        ubicacion_actual: new GeoPoint(currentGeo.latitude + latchg, currentGeo.longitude + lngchg),
        ultima_actualizacion: serverTimestamp(),
      });
      moved++;
    });

    if (moved > 0) {
      await batch.commit();
      // Optional: Reduce log noise
      // this.log(`🛰️ GPS actualizado para ${moved} unidades.`);
    }
  }

  private static async updatePassengers() {
    const snapshot = await getDocs(collection(db, 'vehiculos'));
    const batch = writeBatch(db);

    snapshot.forEach((docSnap) => {
      const current = docSnap.data().pasajeros_actuales || 20;
      // + / - 5 pax
      let next = current + Math.floor(Math.random() * 10 - 4);
      if (next < 0) next = 0;
      if (next > 80) next = 80;

      batch.update(docSnap.ref, { pasajeros_actuales: next });
    });

    await batch.commit();
  }

  private static async triggerBreakdown() {
    // Find an OPERATIONAL vehicle
    // Firestore query or client filter (Client filter simpler for small fleet)
    const snapshot = await getDocs(collection(db, 'vehiculos'));
    const operational = snapshot.docs.filter(
      (d) => d.data().estado_operativo === 'ACTIVO' || !d.data().estado_operativo,
    );

    if (operational.length === 0) return;

    // Pick one
    const victim = operational[Math.floor(Math.random() * operational.length)];
    const carId = victim.id;

    const failures = [
      'Falla de Motor (Alta Temperatura)',
      'Neumático Pinchado',
      'Fallas en Sistema Eléctrico',
      'Aire Acondicionado Goteando',
    ];
    const desc = failures[Math.floor(Math.random() * failures.length)];

    // 1. Mark Vehicle TALLER
    await updateDoc(victim.ref, { estado_operativo: 'TALLER' });

    // 2. Create Incident
    await addDoc(collection(db, 'incidencias'), {
      coche_id: carId,
      descripcion: desc,
      prioridad: 'ALTA',
      estado: 'PENDIENTE',
      reportado_por: 'SYSTEM_CHAOS',
      fecha_reporte: serverTimestamp(),
    });

    this.log(`🔥 [CRITICO] Coche ${carId} reporta: ${desc}. Enviado a TALLER.`);
  }

  private static async attemptRepairs() {
    const snapshot = await getDocs(collection(db, 'vehiculos'));
    const broken = snapshot.docs.filter((d) => d.data().estado_operativo === 'TALLER');

    for (const car of broken) {
      // 50% chance to repair
      if (Math.random() > 0.5) {
        await updateDoc(car.ref, { estado_operativo: 'ACTIVO' });
        this.log(`✅ [TALLER] Coche ${car.id} reparado y devuelto a servicio.`);

        // TODO: Close related incidents? (Complex query, skipping for Speed)
      }
    }
  }
}
