import { apiClient } from '../clients/apiClient';

export type IncidentType = 'MECANICA' | 'ACCIDENTE' | 'EVASION' | 'DEMORA';

export const IncidentService = {
  // Transactional Create: Incident Doc + Vehicle Status Update (sequential calls replacing writeBatch)
  reportIncident: async (
    vehicleId: string,
    type: IncidentType,
    reporterId: string,
    reporterName: string,
  ) => {
    try {
      const statusMap: Record<IncidentType, string> = {
        MECANICA: 'EN_TALLER',
        ACCIDENTE: 'FUERA_DE_SERVICIO',
        EVASION: 'ACTIVO', // Evasión doesn't necessarily stop the fleet
        DEMORA: 'ACTIVO', // Delay keeps it active but late
      };

      // 1. Create Incident Document
      const incidentResult = await apiClient.post('/api/db/incidencias', {
        vehicleId,
        type,
        status: 'ABIERTO',
        priority: 'ALTA',
        createdAt: new Date().toISOString(),
        reportedBy: {
          uid: reporterId,
          name: reporterName,
        },
        description: `Reporte rápido desde Dispatch Panel: ${type}`,
      }) as { id: string };

      // 2. Update Vehicle Status
      const newStatus = statusMap[type];
      if (newStatus !== 'ACTIVO') {
        await apiClient.put('/api/db/vehiculos/' + encodeURIComponent(vehicleId), {
          state: newStatus,
          statusMessage: `Incidencia: ${type}`,
          lastUpdated: new Date().toISOString(),
        });
      } else {
        await apiClient.put('/api/db/vehiculos/' + encodeURIComponent(vehicleId), {
          lastUpdated: new Date().toISOString(),
        });
      }

      return { success: true, id: incidentResult.id };
    } catch (error) {
      console.error('Error reporting dispatch incident:', error);
      throw error;
    }
  },
};
