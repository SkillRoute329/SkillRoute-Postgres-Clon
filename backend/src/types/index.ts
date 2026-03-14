/**
 * Definiciones de tipos TypeScript para TransformaFacil 2.0
 */

import { Request } from 'express';

// ─── AUTH ─────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  internalNumber: string;
  fullName: string;
  role: 'SuperAdmin' | 'Admin' | 'Inspector' | 'Driver' | 'User';
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────
export interface LoginPayload {
  internalNumber: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

// ─── VEHÍCULOS ────────────────────────────────────────────────────────────
export interface Vehicle {
  id: string;
  internalNumber: string;
  plate: string;
  model: string;
  lastCheckStatus?: string;
  lastCheckDate?: Date;
  currentDriver?: string;
  status: 'available' | 'maintenance' | 'service' | 'disabled';
}

// ─── INSPECCIONES ─────────────────────────────────────────────────────────
export interface FleetCheck {
  id?: string;
  vehicleId: string;
  driverId: string;
  driverLegajo: string;
  status: 'OK' | 'WARNING' | 'CRITICAL';
  notas: string;
  photos: string[];
  checkType: 'pre-service' | 'post-service' | 'maintenance';
  timestamp?: Date;
}

// ─── CARTONES (SERVICIOS) ─────────────────────────────────────────────────
export interface Carton {
  id?: string;
  serviceNumber: string;
  line: string;
  variant?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  startTime?: string;
  endTime?: string;
  km?: number;
  updatedAt?: Date;
  updatedBy?: string;
}

// ─── API RESPONSES ────────────────────────────────────────────────────────
export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: any;
  timestamp?: string;
}

export interface ApiPaginatedResponse<T = any> {
  ok: boolean;
  data: T[];
  total: number;
  page?: number;
  pageSize?: number;
  timestamp?: string;
}

// ─── ERRORES PERSONALIZADOS ──────────────────────────────────────────────
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// ─── LOGGER ──────────────────────────────────────────────────────────────
export interface LogContext {
  userId?: string;
  requestId?: string;
  path?: string;
  method?: string;
}
