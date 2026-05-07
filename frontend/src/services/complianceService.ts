// Servicio de cumplimiento — consulta /api/compliance/regulador
// SPEC_CUMPLIMIENTO_V2_FRONTEND_2026_05.md §2.7

import { RegulatoryData, Granularidad } from '../types/compliance';

const API_BASE = '/api';

function granularidadParam(g: Granularidad): string {
  if (g === 'MONTHLY') return 'mensual';
  if (g === 'WEEKLY')  return 'semanal';
  return 'diaria';
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchRegulatoryData(
  token: string,
  agencyId: string | 'all',
  from: Date,
  to: Date,
  granularity: Granularidad,
): Promise<RegulatoryData> {
  const params = new URLSearchParams({
    empresa: agencyId,
    desde: fmtDate(from),
    hasta: fmtDate(to),
    granularidad: granularidadParam(granularity),
  });

  const res = await fetch(`${API_BASE}/compliance/regulador?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`compliance/regulador ${res.status}: ${body}`);
  }

  return res.json() as Promise<RegulatoryData>;
}

export async function exportRegulatoryPDF(
  token: string,
  period: { desde: string; hasta: string },
  operators: string[],
  sections: string[],
): Promise<{ url: string; sha256: string; expiresAt: string }> {
  const res = await fetch(`${API_BASE}/compliance/regulador/export`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ period, operators, sections }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`export ${res.status}: ${body}`);
  }

  return res.json();
}
