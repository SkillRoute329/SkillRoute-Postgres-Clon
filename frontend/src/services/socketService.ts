/**
 * Socket.io Client Service - DEPRECATED
 * Migrado a Firebase Firestore onSnapshot.
 * Se mantienen los tipos y firmas vacías para compatibilidad.
 */

// Tipos requeridos por compatibilidad en otros archivos
export interface SocketUser {
  id: string;
  internalNumber: string;
  fullName: string;
  role: 'SuperAdmin' | 'Admin' | 'Inspector' | 'Driver' | 'User';
}

export interface LocationUpdate {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  timestamp: number;
  updatedBy?: string;
}

export interface ServiceStatusChange {
  serviceId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  timestamp: number;
  updatedBy?: string;
}

export interface InspectorAlert {
  inspectorId?: string;
  vehicleId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
}

export interface FleetCheckCompleted {
  checkId: string;
  vehicleId: string;
  status: 'OK' | 'WARNING' | 'CRITICAL';
  timestamp: number;
  completedBy?: string;
}

export interface UserConnected {
  userId: string;
  fullName: string;
  role: string;
  timestamp: number;
}

// Mocks para evitar fallar imports antiguos
export function createSocket(user: SocketUser): any { return null; }
export function getSocket(): any | null { return null; }
export function disconnectSocket(): void { }
export function isConnected(): boolean { return false; }
export function emitLocationUpdate(data: Omit<LocationUpdate, 'timestamp'>) { }
export function emitServiceStatusChange(data: Omit<ServiceStatusChange, 'timestamp'>) { }
export function emitInspectorAlert(data: Omit<InspectorAlert, 'timestamp'>) { }
export function emitFleetCheckCompleted(data: Omit<FleetCheckCompleted, 'timestamp'>) { }
export function joinRoom(roomName: string): void { }
export function leaveRoom(roomName: string): void { }
export function sendPing(): void { }

export function onLocationUpdate(callback: (data: LocationUpdate) => void) { return () => {}; }
export function onServiceStatusChange(callback: (data: ServiceStatusChange) => void) { return () => {}; }
export function onInspectorAlert(callback: (data: InspectorAlert) => void) { return () => {}; }
export function onFleetCheckCompleted(callback: (data: FleetCheckCompleted) => void) { return () => {}; }
export function onUserConnected(callback: (data: UserConnected) => void) { return () => {}; }
export function onUserDisconnected(callback: (data: any) => void) { return () => {}; }
export function onPong(callback: (data: { timestamp: number }) => void) { return () => {}; }
export function onSocketError(callback: (error: any) => void) { return () => {}; }

export default null;
