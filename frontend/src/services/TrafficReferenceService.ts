import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
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

      console.log('🔗 TrafficLinker: Fetching Collections for Linking...');

      // Users
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.forEach((doc) => {
        const d = doc.data();
        const legajo = d.datos_empresa?.legajo || d.internalNumber;
        if (legajo) {
          _usersCache[String(legajo).trim()] = { uid: doc.id, ...d };
        }
      });

      // Vehicles
      const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
      vehiclesSnap.forEach((doc) => {
        const d = doc.data();
        const unit = d.vehicleNumber || d.unitNumber; // Adjust to schema
        if (unit) {
          _vehiclesCache[String(unit).trim()] = { id: doc.id, ...d };
        }
      });

      console.log(
        `🔗 TrafficLinker: Cached ${usersSnap.size} Users, ${vehiclesSnap.size} Vehicles.`,
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
      type: 'LISTA' as const, // Safer default for unknowns
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
      // "VehicleInternalNumber" from Excel usually maps to our Vehicle Number
      // "Driver" might not be in the Excel row depending on parser V2...
      // Wait, ParserV2 for Rotation returns: { vehicleInternalNumber, ... }
      // It currently does NOT extract Driver Legajo/Name explicitly in V2?
      // Need to check V2 parser output again. '' has vehicleInternalNumber, but no explicit 'driverCode'.
      // If the excel has driver info, we need to extract it.
      // Assuming for now Vehicle is the main link in the "Rotation" file provided (Salida).

      // NOTE: The current Rotation file provided (Matriz Salida) lists Service, Time, Line, and Vehicle.
      // It does NOT list Driver usually? The "Matriz de Salida" is usually "Car Assignment".
      // Driver assignment might come from "Distribution".
      // IF NO DRIVER: We create the shift with 'Unassigned' or link via Default Car Owner (future feature).

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
