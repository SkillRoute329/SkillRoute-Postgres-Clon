import * as fs from 'fs';
import * as path from 'path';

const logDir = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const auditLogPath = path.join(logDir, 'audit_trail.log');

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface AuditLogEntry {
  timestamp: string;
  level: LogLevel;
  userId: string;
  operation: string;
  details?: unknown;
}

/**
 * Motor de Logs Forenses (Cumplimiento ISO 27001 / ISO 25010)
 * Registra eventos de seguridad en formato JSON estructurado rígido.
 * Escribe localmente, prohibiendo la dependencia de la nube.
 */
export function writeAuditLog(level: LogLevel, userId: string, operation: string, details?: unknown): void {
  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    userId,
    operation,
    ...(details && { details })
  };

  const jsonString = JSON.stringify(entry) + '\n';
  
  // Escritura física asíncrona garantizando inmutabilidad secuencial (append only)
  fs.appendFile(auditLogPath, jsonString, { encoding: 'utf8', mode: 0o644 }, (err) => {
    if (err) {
      console.error('FATAL: Imposible persistir registro de auditoría forense', err);
    }
  });
}
