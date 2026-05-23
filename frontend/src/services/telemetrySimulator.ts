import { apiClient } from '../clients/apiClient';
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
        // GeoPoint stored as lat/lng object (Firestore GeoPoint replacement)
        const posicion = { latitude: center.lat + offsetLat, longitude: center.lng + offsetLng };
        const heading = Math.floor(Math.random() * 360);

        const ucotUnit = {
          id: `sim-ucot-${lineId}`,
          empresa: 'UCOT',
          codigoLinea: lineId,
          posicion,
          lat: posicion.latitude,
          lng: posicion.longitude,
          updatedAt: new Date().toISOString(),
          estado: 'EN_RUTA',
          heading,
          isSimulated: true,
        };
        newBatch.push(ucotUnit);

        // Inyectar en backend (intentar)
        apiClient.put('/api/db/viajes_activos/' + encodeURIComponent(ucotUnit.id), ucotUnit).catch(() => {});

        if (Math.random() > 0.4) {
          const rLine = rivalLines[Math.floor(Math.random() * rivalLines.length)];
          const rPosicion = {
            latitude: center.lat + offsetLat + (Math.random() - 0.5) * 0.005,
            longitude: center.lng + offsetLng + (Math.random() - 0.5) * 0.005,
          };
          const rivalUnit = {
            id: `sim-rival-${rLine}-${lineId}`,
            empresa: 'COMPETENCIA',
            codigoLinea: rLine,
            posicion: rPosicion,
            lat: rPosicion.latitude,
            lng: rPosicion.longitude,
            updatedAt: new Date().toISOString(),
            heading: Math.floor(Math.random() * 360),
            isSimulated: true,
          };
          newBatch.push(rivalUnit);
          apiClient.put('/api/db/viajes_activos/' + encodeURIComponent(rivalUnit.id), rivalUnit).catch(() => {});
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
