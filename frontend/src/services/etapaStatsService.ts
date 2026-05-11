export interface ParadaStat {
  paradaIdx: number;
  stopId: string;
  nombre: string;
  total: number;
  atrasados: number;
  pctEnTiempo: number;
  pctAtrasado: number;
  desviacionMediaMin: number;
  byHour: Record<string, { pctAtrasado: number; desviacionMedia: number }>;
}

export interface EtapaStatsDoc {
  updatedAt: Date;
  paradas: ParadaStat[];
  totalEventos: number;
}

export async function fetchEtapaLineas(agencyId: string): Promise<string[]> {
  return [];
}

export async function fetchEtapaStats(agencyId: string, lineaSeleccionada: string, sentido: number): Promise<EtapaStatsDoc | null> {
  return null;
}
