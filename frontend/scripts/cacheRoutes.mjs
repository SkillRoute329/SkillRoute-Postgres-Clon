/**
 * cacheRoutes.mjs — Descarga recorridos reales de la API STM y los guarda
 * como JSON estático para uso offline/pre-cargado.
 *
 * Uso: node scripts/cacheRoutes.mjs
 *
 * Resultado: src/data/geo/routeCache.json con la geometría real de cada línea.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROXY_BASE = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/montevideoProxy';

// Todas las líneas UCOT + competencia
const LINEAS_UCOT = [
  '300', '306', '316', '317', '328', '329', '330', '370', '371', '379', '396',
  '17', '71', '79', '221',
];

const LINEAS_COMPETENCIA = ['103', '110', '128', '169', '185', '505', '522'];

const ALL_LINES = [...LINEAS_UCOT, ...LINEAS_COMPETENCIA];

function getProxyUrl(endpoint) {
  return `${PROXY_BASE}?endpoint=${encodeURIComponent(endpoint)}`;
}

function extractLatLng(p) {
  if (p.geometry && Array.isArray(p.geometry.coordinates) && p.geometry.coordinates.length >= 2) {
    const [lng, lat] = p.geometry.coordinates;
    return { lat: Number(lat), lng: Number(lng) };
  }
  const lat = Number(p.lat ?? p.latitude ?? p.latitud ?? 0);
  const lng = Number(p.lng ?? p.longitude ?? p.longitud ?? p.lon ?? 0);
  return { lat, lng };
}

function parseRecorrido(data) {
  if (!data) return [];
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (Array.isArray(first) && first.length >= 2) {
      return data.map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }));
    }
    return data
      .map((pt) => extractLatLng(typeof pt === 'object' && pt !== null ? pt : {}))
      .filter((p) => p.lat !== 0 && p.lng !== 0);
  }
  if (typeof data === 'object' && data !== null) {
    const coords =
      data.coordinates ?? data.geometry?.coordinates ?? data.recorrido ?? data.data;
    if (Array.isArray(coords) && coords.length > 0) {
      const first = coords[0];
      if (Array.isArray(first) && first.length >= 2) {
        return coords.map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }));
      }
    }
  }
  return [];
}

function parseParadas(data) {
  const raw = Array.isArray(data)
    ? data
    : Array.isArray(data?.paradas)
      ? data.paradas
      : Array.isArray(data?.data)
        ? data.data
        : [];
  return raw
    .map((p, i) => {
      const { lat, lng } = extractLatLng(typeof p === 'object' && p !== null ? p : {});
      return {
        nombre: String(p.nombre ?? p.name ?? p.descripcion ?? `Parada ${i + 1}`),
        lat,
        lng,
        orden: Number(p.orden ?? p.order ?? i + 1),
      };
    })
    .filter((s) => s.lat !== 0 && s.lng !== 0);
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchLineRoute(lineId, variantIdx) {
  const code = `${lineId}${variantIdx === 0 ? 'a' : 'b'}`;
  console.log(`  → Fetching ${code} (variant ${variantIdx})...`);

  let recorrido = [];
  let paradas = [];

  // Try with variant index first
  try {
    const recRes = await fetchWithTimeout(
      getProxyUrl(`transporteRest/infoTransporte/recorrido/${lineId}/${variantIdx}`)
    );
    recorrido = parseRecorrido(recRes);
  } catch { /* ignore */ }

  // Fallback: try without variant
  if (recorrido.length === 0) {
    try {
      const recRes = await fetchWithTimeout(
        getProxyUrl(`transporteRest/infoTransporte/recorrido/${lineId}`)
      );
      recorrido = parseRecorrido(recRes);
    } catch { /* ignore */ }
  }

  // Fetch paradas
  try {
    const parRes = await fetchWithTimeout(
      getProxyUrl(`transporteRest/infoTransporte/paradas/${lineId}/${variantIdx}`)
    );
    paradas = parseParadas(parRes);
  } catch { /* ignore */ }

  if (paradas.length === 0) {
    try {
      const parRes = await fetchWithTimeout(
        getProxyUrl(`transporteRest/infoTransporte/paradas/${lineId}`)
      );
      paradas = parseParadas(parRes);
    } catch { /* ignore */ }
  }

  // If no recorrido but we have paradas, connect them
  if (recorrido.length === 0 && paradas.length > 1) {
    recorrido = paradas.map((s) => ({ lat: s.lat, lng: s.lng }));
  }

  const source =
    recorrido.length > 0 && paradas.length > 0
      ? 'API_STM'
      : recorrido.length > 0
        ? 'API_STM_RECORRIDO_ONLY'
        : paradas.length > 0
          ? 'API_STM_PARADAS_ONLY'
          : 'EMPTY';

  return {
    code,
    lineId,
    variantIdx,
    recorrido,
    paradas,
    source,
    pointCount: recorrido.length,
    stopCount: paradas.length,
  };
}

async function main() {
  console.log('═══ UCOT Route Cache Generator ═══');
  console.log(`Fetching routes for ${ALL_LINES.length} lines...\n`);

  const cache = {};
  let successCount = 0;
  let emptyCount = 0;

  for (const lineId of ALL_LINES) {
    console.log(`\n📍 Line ${lineId}:`);

    for (const variantIdx of [0, 1]) {
      try {
        const result = await fetchLineRoute(lineId, variantIdx);
        const key = result.code;

        if (result.recorrido.length > 0 || result.paradas.length > 0) {
          cache[key] = result;
          successCount++;
          console.log(
            `    ✅ ${key}: ${result.pointCount} points, ${result.stopCount} stops [${result.source}]`
          );
        } else {
          emptyCount++;
          console.log(`    ⚠️ ${key}: No data available`);
        }
      } catch (err) {
        emptyCount++;
        console.log(`    ❌ ${lineId}${variantIdx === 0 ? 'a' : 'b'}: ${err.message}`);
      }

      // Small delay to not overload the proxy
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Write results
  const outputPath = path.join(__dirname, '..', 'src', 'data', 'geo', 'routeCache.json');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const output = {
    generatedAt: new Date().toISOString(),
    totalLines: ALL_LINES.length,
    cachedVariants: Object.keys(cache).length,
    emptyVariants: emptyCount,
    routes: cache,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n═══ RESULTS ═══`);
  console.log(`✅ Cached: ${successCount} variants with route data`);
  console.log(`⚠️ Empty: ${emptyCount} variants without data`);
  console.log(`📁 Saved to: ${outputPath}`);
}

main().catch(console.error);
