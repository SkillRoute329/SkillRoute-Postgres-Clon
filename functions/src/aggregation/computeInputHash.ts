import * as crypto from 'crypto';

export interface InputHashParams {
  agencyId: string;
  linea: string;
  sentido: string;
  periodo: string;
  granularidad: string;
  totalEvents: number;
  algoVersion: string;
}

export function computeInputHash(params: InputHashParams): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex');
}
