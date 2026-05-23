import { apiClient } from '../clients/apiClient';
import type { DailyShift } from '../types/traffic';
import type { ParsedData } from '../utils/ExcelParserV2';

// Cache to avoid thousands of reads
const _usersCache: Record<string, any> = {};
const _vehiclesCache: Record<string, any> = {};

export const TrafficReferenceService = {
  // 1. PRE-LOAD CACHES (Efficient)
  async preloadReferences() {
    try {
      // Check cache validity (simple check)
      if (Object.keys(_usersCache).length > 0) return;

      console.log('TrafficLinker: Fetching Collections for Linking...');

      // Users
      const usersResult = await apiClient.get('/api/db/users', { query: { limit: 5000 } }) as any[];
      const usersArr = Array.isArray(usersResult) ? usersResult : [];
      usersArr.forEach((d: any) => {
        const legajo = d.datos_empresa?.legajo || d.internalNumber;
        if (legajo) {
          _usersCache[String(legajo).trim()] = { uid: d.id, ...d };
        }
      });

      // Vehicles
      const vehiclesResult = await apiClient.get('/api/db/vehicles', { query: { limit: 5000 } }) as any[];
      const vehiclesArr = Array.isArray(vehiclesResult) ? vehiclesResult : [];
      vehiclesArr.forEach((d: any) => {
        const unit = d.vehicleNumber || d.unitNumber;
        if (unit) {
          _vehiclesCache[String(unit).trim()] = { id: d.id, ...d };
        }
      });

      console.log(
        `TrafficLinker: Cached ${usersArr.length} Users, ${vehiclesArr.length} Vehicles.`,
      );
    } catch (e) {
      console.error('TrafficLinker Cache Error:', e);
    }
  },

  // 2. RESOLVE DRIVER
  resolveDriver(internalNumber: string) {
    const clean = String(internalNumber).trim();
    const found = _usersCache[clean];
    if (found) {
      const firstName = found.datos_personales?.nombre || found.firstName || 'Unknown';
      const lastName = found.datos_personales?.apellido || found.lastName || '';

      return {
        id: found.uid,
        internalNumber: clean,
        fullName: `${firstName} ${lastName}`,
        type: 'EFECTIVO' as const,
      };
    }

    return {
      id: 'UNKNOWN',
      internalNumber: clean,
      fullName: 'PERSONAL NO REGISTRADO',
      type: 'LISTA' as const,
    };
  },

  // 3. RESOLVE VEHICLE
  resolveVehicle(vehicleNumber: string) {
    const clean = String(vehicleNumber).trim();
    const found = _vehiclesCache[clean];

    if (found) {
      return {
        id: found.id,
        number: clean,
        status: (found.status === 'maintenance' ? 'BROKEN' : 'OK') as 'OK' | 'BROKEN',
      };
    }

    return {
      id: 'UNKNOWN',
      number: clean,
      status: 'UNKNOWN' as const,
    };
  },

  // 4. TRANSFORM ROTATION DATA -> DAILY SHIFT (The Magic)
  async processRotationImport(parsedData: ParsedData, date: string): Promise<DailyShift[]> {
    await this.preloadReferences();

    if (parsedData.type !== 'ROTACION') {
      console.warn('TrafficLinker: Wrong data type for Rotation Logic');
      return [];
    }

    return parsedData.services.map((svc) => {
      const vehicle = this.resolveVehicle(svc.vehicleInternalNumber || '0000');

      return {
        id: `${date}_${svc.serviceNumber}`,
        date,
        serviceNumber: svc.serviceNumber,
        lineCode: svc.lineCode,
        startTime: svc.startTime,
        endTime: svc.endTime || '00:00',
        startLocation: 'SALIDA',
        endLocation: 'GUARDA',
        vehicle,
        driver: {
          id: 'UNASSIGNED',
          internalNumber: '???',
          fullName: 'SIN ASIGNAR',
          type: 'LISTA',
        },
        status: 'SCHEDULED',
      };
    });
  },
};
