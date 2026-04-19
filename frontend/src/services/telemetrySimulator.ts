import { db } from '../config/firebase';
import { collection, doc, setDoc, Timestamp, GeoPoint } from 'firebase/firestore';
import { LINEAS_UCOT_BASE } from './ucotLinesService';
import { tacticalDataBus } from './tacticalDataBus';

/**
 * Simulador de Telemetría Geotáctica.
 * Inyecta unidades UCOT y Rivales.
 */
export const TelemetrySimulator = {
  active: false,
  timer: null as any,
  localCache: [] as any[],

  start: async () => {
    if (TelemetrySimulator.active) return;
    TelemetrySimulator.active = true;

    console.log('🚀 [SIMULATOR] AGENTES ACTIVADOS. Inyectando telemetría...');

    const center = { lat: -34.85, lng: -56.16 };

    TelemetrySimulator.timer = setInterval(async () => {
      if (!TelemetrySimulator.active) return;

      // Inyectamos 12 líneas de UCOT cada ciclo para asegurar cobertura
      const selectedLines = [...LINEAS_UCOT_BASE].sort(() => 0.5 - Math.random()).slice(0, 12);
      const rivalLines = ['103', '110', '169', '185', '121', '128'];

      const newBatch: any[] = [];

      for (const lineId of selectedLines) {
        const offsetLat = (Math.random() - 0.5) * 0.05;
        const offsetLng = (Math.random() - 0.5) * 0.05;
        const pos = new GeoPoint(center.lat + offsetLat, center.lng + offsetLng);
        const heading = Math.floor(Math.random() * 360);

        const ucotUnit = {
          id: `sim-ucot-${lineId}`,
          empresa: 'UCOT',
          codigoLinea: lineId,
          posicion: pos,
          updatedAt: Timestamp.now(),
          estado: 'EN_RUTA',
          heading,
          isSimulated: true,
        };
        newBatch.push(ucotUnit);

        // Inyectar en Firestore (intentar)
        setDoc(doc(db, 'viajes_activos', ucotUnit.id), ucotUnit, { merge: true }).catch(() => {});

        if (Math.random() > 0.4) {
          const rLine = rivalLines[Math.floor(Math.random() * rivalLines.length)];
          const rPos = new GeoPoint(
            center.lat + offsetLat + (Math.random() - 0.5) * 0.005,
            center.lng + offsetLng + (Math.random() - 0.5) * 0.005,
          );
          const rivalUnit = {
            id: `sim-rival-${rLine}-${lineId}`,
            empresa: 'COMPETENCIA',
            codigoLinea: rLine,
            posicion: rPos,
            updatedAt: Timestamp.now(),
            heading: Math.floor(Math.random() * 360),
            isSimulated: true,
          };
          newBatch.push(rivalUnit);
          setDoc(doc(db, 'viajes_activos', rivalUnit.id), rivalUnit, { merge: true }).catch(
            () => {},
          );
        }
      }

      // IMPORTANTE: Broadcast directo al bus de datos para el Radar
      tacticalDataBus.broadcast(newBatch);
    }, 4000);
  },

  stop: () => {
    console.log('🛑 [SIMULATOR] AGENTES DESACTIVADOS.');
    TelemetrySimulator.active = false;
    if (TelemetrySimulator.timer) {
      clearInterval(TelemetrySimulator.timer);
      TelemetrySimulator.timer = null;
    }
  },
};
