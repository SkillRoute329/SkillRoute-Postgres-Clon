export type Sentido = 'IDA' | 'VUELTA';
export type Confianza = 'HIGH' | 'MEDIUM' | 'LOW' | 'ZERO';
export type Badge = 'OK' | 'IC_VISIBLE' | 'INSUFFICIENT' | 'NO_COVERAGE';

// Evento GPS crudo — campos del API /infer (lng, no lon)
export interface GpsEvent {
  idBus: string;
  agencyId: string;
  linea: string;
  lat: number;
  lng: number;
  bearing: number | null;
  velocidad: number;
  destinoDesc: string | null;
  variante: string | null;
  timestampGPS: string; // ISO 8601
}

// Punto de un shape almacenado en Firestore
export interface ShapePoint {
  lat: number;
  lng: number;
}

// Shape de shapes_cross_operator, convertido para uso interno
export interface Shape {
  docId: string;           // {agencyId}_{linea}_{varianteNum}
  agencyId: string;
  linea: string;
  varianteNum: number;     // 0,2,4...=IDA | 1,3,5...=VUELTA
  sentido: Sentido;
  points: ShapePoint[];    // ordenados inicio→fin
  terminalIda: string | null;    // nombre de la cabecera de inicio
  terminalVuelta: string | null; // nombre de la cabecera de fin
  origen: string | null;
  destino: string | null;
}

// Candidato al hacer snap de un ping a un shape
export interface SnapCandidate {
  shape: Shape;
  snapDistanceM: number;   // distancia perpendicular al shape en metros
  snapDistAlongKm: number; // distancia recorrida desde inicio del shape en km
}

// Resultado de inferirSentido()
export interface SenseInferResult {
  sentido: Sentido | null;
  confianza: Confianza;
  score: number;            // 0..1
  snapDistanceM: number | null;
  snapDistanceTraveledM: number | null;
}

// Timepoint de un viaje GTFS para matching
export interface Timepoint {
  lat: number;
  lng: number;
  scheduled: string; // HH:MM:SS
  stopName: string;
}

// Viaje GTFS candidato para matching
export interface Trip {
  trip_id: string;
  route_id: string;
  direction_id: number; // 0=IDA, 1=VUELTA
  start_time: string;   // HH:MM:SS (hora de salida cabecera)
  service_id: string;
  timepoints: Timepoint[];
}

// Resultado de matchPasadaToTrip()
export interface TripMatch {
  tripId: string;
  score: number;
  matchedTimepoints: number;
  totalTimepoints: number;
}

// Respuesta del /infer para un evento
export interface InferResult {
  idBus: string;
  sentido: Sentido | null;
  confianza: Confianza;
  score: number;
  tripId: string | null;
  snapDistanceM: number | null;
  snapDistanceTraveledM: number | null;
  matchedAt: string;
  algoVersion: string;
}

// Error semántico acumulado en /infer (no falla el request)
export interface InferError {
  idBus: string;
  code: 'SHAPE_NOT_FOUND' | 'SNAP_TOO_FAR' | 'LOW_CONFIDENCE' | 'INVALID_EVENT';
  message: string;
  fallback: { sentido: null; confianza: 'ZERO'; tripId: null };
}

// Job de reprocesamiento guardado en Firestore
export interface ReprocessJob {
  jobId: string;
  agencyId: string | null;
  linea: string | null;
  from: string;
  to: string;
  writeTarget: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'ERROR';
  processedDocs: number;
  estimatedDocs: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  error?: string;
}
