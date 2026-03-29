import { db } from '../config/firebase';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';

export type IncidentType = 'MECANICA' | 'ACCIDENTE' | 'EVASION' | 'DEMORA';

export const IncidentService = {
  // Transactional Create: Incident Doc + Vehicle Status Update
  reportIncident: async (
    vehicleId: string,
    type: IncidentType,
    reporterId: string,
    reporterName: string,
  ) => {
    try {
      const batch = writeBatch(db);

      // 1. Create Incident Document (Auto-ID)
      const incidentRef = doc(collection(db, 'incidencias'));
      const statusMap: Record<IncidentType, string> = {
        MECANICA: 'EN_TALLER',
        ACCIDENTE: 'FUERA_DE_SERVICIO',
        EVASION: 'ACTIVO', // Evasión doesn't necessarily stop the fleet
        DEMORA: 'ACTIVO', // Delay keeps it active but late
      };

      batch.set(incidentRef, {
        vehicleId,
        type,
        status: 'ABIERTO',
        priority: 'ALTA',
        createdAt: serverTimestamp(),
        reportedBy: {
          uid: reporterId,
          name: reporterName,
        },
        description: `Reporte rápido desde Dispatch Panel: ${type}`,
      });

      // 2. Update Vehicle Status
      const vehicleRef = doc(db, 'vehiculos', vehicleId);
      const newStatus = statusMap[type];

      // Only update status if it changes the operational state
      if (newStatus !== 'ACTIVO') {
        batch.update(vehicleRef, {
          state: newStatus,
          statusMessage: `Incidencia: ${type}`,
          lastUpdated: serverTimestamp(),
        });
      } else {
        // Just log valid last contact
        batch.update(vehicleRef, {
          lastUpdated: serverTimestamp(),
        });
      }

      await batch.commit();
      return { success: true, id: incidentRef.id };
    } catch (error) {
      console.error('Error reporting dispatch incident:', error);
      throw error;
    }
  },
};
