import nearestPointOnLine from '@turf/nearest-point-on-line';
import length from '@turf/length';
import along from '@turf/along';
import bearing from '@turf/bearing';
import distance from '@turf/distance';
import { point, lineString, Feature, LineString } from '@turf/helpers';
import { ShapePoint } from '../types';

export { nearestPointOnLine, length, along, bearing, distance, point, lineString };
export type { Feature, LineString };

// Diferencia angular mínima entre dos bearings (0..180)
export function angularDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// Bearing tangente al shape en el punto de snap (interpolación local ±20m)
export function computeTangentAtSnap(
  geoLine: Feature<LineString>,
  snapDistAlongKm: number
): number | null {
  const totalKm = length(geoLine, { units: 'kilometers' });
  if (totalKm < 0.001) return null;
  const epsilon = 0.02; // 20m
  const d1 = Math.max(0, snapDistAlongKm - epsilon);
  const d2 = Math.min(totalKm, snapDistAlongKm + epsilon);
  if (Math.abs(d2 - d1) < 0.001) return null;
  const p1 = along(geoLine, d1, { units: 'kilometers' });
  const p2 = along(geoLine, d2, { units: 'kilometers' });
  return bearing(p1, p2);
}

// Convierte el array de puntos del shape a GeoJSON LineString de Turf
export function pointsToGeoJSON(points: ShapePoint[]): Feature<LineString> | null {
  if (points.length < 2) return null;
  const coords = points.map(p => [p.lng, p.lat] as [number, number]);
  return lineString(coords);
}

// Normalización de strings para comparación fuzzy (quita tildes, minúsculas)
export function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

// Distancia de Levenshtein
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Coincidencia fuzzy (threshold ≤2 chars Levenshtein, o substring)
export function fuzzyMatch(a: string, b: string): boolean {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return levenshtein(na, nb) <= 2;
}

// Diferencia en minutos entre dos strings HH:MM:SS (a - b)
export function diffMin(a: string, b: string): number {
  const toMin = (t: string) => {
    const [h, m, s] = t.split(':').map(Number);
    return h * 60 + m + (s ?? 0) / 60;
  };
  return toMin(a) - toMin(b);
}

// Distancia haversine en metros entre dos puntos {lat, lng}
export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const p1 = point([a.lng, a.lat]);
  const p2 = point([b.lng, b.lat]);
  return distance(p1, p2, { units: 'meters' });
}
