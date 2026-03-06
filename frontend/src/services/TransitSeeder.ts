import {
  collection,
  getDocs,
  doc,
  setDoc,
  writeBatch,
  query,
  where,
  Timestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { DailyShift, ServiceDefinition, ScheduleMatrix } from '../types/traffic';
import type { ParsedData, ServiceData } from '../utils/ExcelParserV2';

// Cache for quick lookups
const _usersIndex: Record<string, { uid: string; name: string }> = {};
const _vehiclesIndex: Record<string, { id: string; status: string }> = {};
let _cacheLoaded = false;

export const TransitSeeder = {
  /**
   * 1. LOAD MASTER REFERENCE COLLECTIONS (Users & Vehicles)
   * Reads existing collections to enable linking.
   */
  async loadMasterIndices() {
    if (_cacheLoaded) return;

    console.log('TransitSeeder: Loading Master Indices...');
    try {
      // Users Index (by internalNumber/legajo)
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.forEach((d) => {
        const data = d.data();
        const legajo = String(data.datos_empresa?.legajo || data.internalNumber || '').trim();
        const name =
          `${data.datos_personales?.nombre || ''} ${data.datos_personales?.apellido || ''}`.trim();
        if (legajo) {
          _usersIndex[legajo] = { uid: d.id, name: name || 'Usuario Sin Nombre' };
        }
      });

      // Vehicles Index (by number)
      const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
      vehiclesSnap.forEach((d) => {
        const data = d.data();
        const num = String(data.vehicleNumber || data.unitNumber || '').trim();
        if (num) {
          _vehiclesIndex[num] = { id: d.id, status: data.status || 'OK' };
        }
      });

      _cacheLoaded = true;
      console.log(
        `TransitSeeder: Indexed ${_usersIndex.length} users and ${_vehiclesIndex.length} vehicles.`,
      );
    } catch (e) {
      console.warn('TransitSeeder: Failed to load indices (Offline?)', e);
    }
  },

  /**
   * UNIVERSAL IMPORTER ROUTER
   * Decides what to do based on file type detected by ParserV2
   */
  async importUniversal(
    parsedData: ParsedData,
    forceDate?: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.loadMasterIndices();

    const timestamp = new Date();

    try {
      switch (parsedData.type) {
        case 'ROTACION':
          return await this.importDailyRotation(
            parsedData,
            forceDate || new Date().toISOString().split('T')[0],
          );

        case 'CARTON':
          return await this.importServiceDefinitions(parsedData); // Cartones = Definitions

        case 'BOLETIN': // Fallback for scheds
        case 'MATRIZ_COMPLEJA':
          return await this.importServiceDefinitions(parsedData); // Treat as definitions for now

        default:
          return { success: false, message: 'Tipo de archivo no reconocido por TransitSeeder.' };
      }
    } catch (error: any) {
      console.error('TransitSeeder Error:', error);
      return { success: false, message: `Error crítico: ${error.message}` };
    }
  },

  /** Máximo de operaciones por batch (límite Firestore). */
  BATCH_SIZE: 500,

  /**
   * B. IMPORT SERVICE DEFINITIONS (Cartones)
   * Escribe en service_definitions y en colección cartones (esquema UCOT) en chunks de 500.
   */
  async importServiceDefinitions(parsedData: ParsedData) {
    const services = parsedData.services;
    if (!services.length) return { success: false, message: 'No services found.' };

    let count = 0;
    for (let offset = 0; offset < services.length; offset += this.BATCH_SIZE) {
      const chunk = services.slice(offset, offset + this.BATCH_SIZE);
      const batch = writeBatch(db);

      for (const svc of chunk) {
        const docRef = doc(db, 'service_definitions', String(svc.serviceNumber));
        const def: ServiceDefinition = {
          serviceNumber: svc.serviceNumber,
          lineCode: svc.lineCode,
          trips: (svc.fullSchedule || []).map((trip, i) => ({
            tripId: trip.id || `trip-${i}`,
            startTime: trip.startTime,
            endTime: '',
            direction: 'IDA',
          })),
          headers: svc.stops || [],
          rawMatrix: svc.fullSchedule || [],
        };
        batch.set(docRef, def);
        count++;
      }
      await batch.commit();
    }

    // 5.3 — Escribir también en colección cartones (id: servicioId_minuta). Minuta según día: HABILES | SABADEROS | FESTIVOS.
    const dayType = (parsedData as { dayType?: string }).dayType?.toUpperCase() ?? '';
    const minuta =
      dayType === 'SABADO'
        ? 'SABADEROS'
        : dayType === 'FESTIVO' || dayType === 'DOMINGO'
          ? 'FESTIVOS'
          : parsedData.type === 'CARTON'
            ? 'HABILES'
            : 'HABILES';
    let cartonesCount = 0;
    for (let offset = 0; offset < services.length; offset += this.BATCH_SIZE) {
      const chunk = services.slice(offset, offset + this.BATCH_SIZE);
      const batch = writeBatch(db);
      for (const svc of chunk) {
        const docId = `${svc.serviceNumber}_${minuta}`;
        let stopNames = (svc.stops || []).map((s: string) => String(s).trim()).filter(Boolean);
        const schedule = svc.fullSchedule || [];
        if (stopNames.length === 0 && schedule.length > 0) {
          const firstRow = schedule[0]?.checkpoints ?? [];
          stopNames = firstRow.map((_: string, i: number) => `Punto ${i + 1}`);
        }
        // Construcción del array paradas: una entrada por columna (parada), tiempos = columna de cada viaje en HH:mm
        const paradas = stopNames.map((nombre: string, colIdx: number) => ({
          nombre,
          tiempos: schedule.map(
            (trip: { checkpoints?: string[] }) => trip.checkpoints?.[colIdx] ?? '--:--',
          ),
        }));
        const firstRow = svc.fullSchedule?.[0];
        const turnos = (svc.fullSchedule || []).slice(0, 3).map((trip, i) => ({
          numero: (i + 1) as 1 | 2 | 3,
          inicio: trip.startTime || '--:--',
          fin: (trip as { endTime?: string }).endTime || '--:--',
          duracion: '',
          primerPunto: paradas[0]?.nombre || '',
        }));
        batch.set(
          doc(db, 'cartones', docId),
          {
            servicio: String(svc.serviceNumber),
            linea: svc.lineCode || '',
            minuta,
            nombre: `Cartón ${svc.serviceNumber} ${minuta}`,
            paradas,
            turnos,
            totalHoras: svc.durationMinutes
              ? `${Math.floor(svc.durationMinutes / 60)}:${String(svc.durationMinutes % 60).padStart(2, '0')}`
              : '',
            kilometros: '',
            temporada: 'VERANO_2026', // Requerido para filtro AdminCartones
            tipo_dia: dayType === 'SABADO' ? 'SABADO' : (dayType === 'DOMINGO' || dayType === 'FESTIVO') ? 'DOMINGO' : 'HABIL',
            vigenciaDesde: Timestamp.now(),
            creadoEn: Timestamp.now(),
          },
          { merge: true },
        );
        cartonesCount++;
      }
      await batch.commit();
    }

    return {
      success: true,
      message: `Se definieron ${count} Servicios (service_definitions) y ${cartonesCount} cartones en colección cartones.`,
    };
  },

  /**
   * C. IMPORT DAILY ROTATION (Daily Shifts)
   * Procesa la totalidad de parsedData.services en chunks de 500 con writeBatch.
   */
  async importDailyRotation(parsedData: ParsedData, dateISO: string) {
    const services = parsedData.services;
    let count = 0;

    for (let offset = 0; offset < services.length; offset += this.BATCH_SIZE) {
      const chunk = services.slice(offset, offset + this.BATCH_SIZE);
      const batch = writeBatch(db);

      for (const svc of chunk) {
        const shiftId = `${dateISO}_${svc.serviceNumber}`;
        const docRef = doc(db, 'daily_shifts', shiftId);

        const vehicleInfo = _vehiclesIndex[String(svc.vehicleInternalNumber)];
        const vehicleData = vehicleInfo
          ? {
              id: vehicleInfo.id,
              number: svc.vehicleInternalNumber!,
              status: vehicleInfo.status as any,
            }
          : { id: 'UNKNOWN', number: svc.vehicleInternalNumber || '?', status: 'UNKNOWN' as any };

        const driverData = {
          id: 'UNASSIGNED',
          internalNumber: '?',
          fullName: 'SIN ASIGNAR',
          type: 'LISTA' as const,
          isMissing: false,
        };

        const shift: DailyShift = {
          id: shiftId,
          date: dateISO,
          serviceNumber: svc.serviceNumber,
          lineCode: svc.lineCode,
          startTime: svc.startTime,
          endTime: svc.endTime ?? '',
          startLocation: 'SALIDA',
          endLocation: svc.destination || 'GUARDA',
          vehicle: vehicleData,
          driver: driverData,
          status: 'SCHEDULED',
          createdAt: Timestamp.now(),
        };

        batch.set(docRef, shift);
        count++;
      }
      await batch.commit();
    }
    return {
      success: true,
      message: `Generados ${count} Turnos Diarios para ${dateISO}.`,
    };
  },
};
