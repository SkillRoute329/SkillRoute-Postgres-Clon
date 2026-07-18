import * as fs from 'fs';
import * as path from 'path';

const logDir = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const auditLogPath = path.join(logDir, 'audit_trail.log');

// Inicialización de un único canal de escritura persistente atómico
const auditStream = fs.createWriteStream(auditLogPath, { flags: 'a', encoding: 'utf8' });

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

// Catálogo Formal de Auditoría (Restringe inyecciones)
export type AuditOperation = 
  | 'AUTH_LOGIN' 
  | 'INCIDENT_CREATE' 
  | 'ROUTE_DEVIATION' 
  | 'ROLE_REVOKE'
  | 'SYSTEM_STARTUP'
  | 'CONFIG_CHANGE';

export interface AuditLogEntry {
  timestamp: string;
  level: LogLevel;
  userId: string;
  operation: AuditOperation;
  details?: unknown;
}

/**
 * Motor de Logs Forenses (Cumplimiento ISO 27001 / ISO 25010)
 * Registra eventos de seguridad en formato JSON estructurado rígido.
 * Escribe localmente, prohibiendo la dependencia de la nube.
 */
export function writeAuditLog(level: LogLevel, userId: string, operation: AuditOperation, details?: unknown): void {
  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    userId,
    operation,
    ...(details && { details })
  };

  const jsonString = JSON.stringify(entry) + '\n';
  
  // Flujo secuencial atómico (Write Stream) sin colisiones I/O
  if (!auditStream.write(jsonString)) {
    auditStream.once('drain', () => {
      // Stream drained
    });
  }
}
