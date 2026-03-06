export interface StopTime {
  stopName: string;
  time: string; // HH:mm
}

// A. EL TIEMPO: ScheduleMatrix (Abstract Time)
// Source: BOLETIN.csv / Sabana
export interface ScheduleMatrix {
  id: string; // generated
  lineCode: string;
  variant: string;
  totalDurationMinutes: number;
  checkpoints: StopTime[];
  seasonalCode?: string; // "VERANO 2026"
  createdAt?: any;
}

// B. EL SERVICIO/CARTÓN: ServiceDefinition
// Source: CARTONES.csv
export interface ServiceDefinition {
  id?: string; // serviceNumber
  serviceNumber: string; // Primary Key (e.g., "1001")
  lineCode: string;

  // Linked Schedule (The "Template")
  scheduleId?: string;

  // Structure
  trips: {
    tripId: string;
    startTime: string; // From Schedule
    endTime: string; // From Schedule
    direction: 'IDA' | 'VUELTA';
  }[];

  headers: any[]; // Store original headers
  rawMatrix: any[]; // Store Raw Matrix for UI
}

// C. LA ASIGNACIÓN DIARIA: DailyShift
// Source: R-21.01.2026.csv (Rotation)
export interface DailyShift {
  id: string; // date_serviceNumber e.g. "2026-01-21_1001"
  date: string; // ISO Date YYYY-MM-DD

  // The "What"
  serviceNumber: string; // Link to ServiceDefinition
  lineCode: string;

  // The "Start/End" (Snapshot from Definition or overridden)
  startTime: string;
  endTime: string;
  startLocation: string;
  endLocation: string;

  // The "Who" (Resolver)
  vehicle: {
    id: string; // Firestore ID
    number: string; // "1040"
    status: 'OK' | 'BROKEN' | 'UNKNOWN';
  };

  driver: {
    id: string; // Firestore ID (uid) or 'UNASSIGNED'
    internalNumber: string; // "543"
    fullName: string;
    type: 'EFECTIVO' | 'LISTA' | 'RELIEF';
    isMissing?: boolean; // Flag to indicate if not found in DB
  };

  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt?: any;
}
