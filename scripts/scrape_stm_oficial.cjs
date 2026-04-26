/**
 * scrape_stm_oficial.cjs — Scraper one-shot de la página oficial STM/IMM.
 * ========================================================================
 * Scrapea las 140 líneas del catálogo en
 * https://www.montevideo.gub.uy/app/stm/horarios/ y para cada una extrae:
 *   - Shape (LineString) IDA y VUELTA
 *   - Paradas (Points) con nombre y lat/lng
 *
 * Persiste a Firestore como `shapes_cross_operator/{agencyId}_{linea}_{sentido}`
 * con la estructura unificada que consume `navigationDataService`.
 *
 * Mecánica probada en sandbox 2026-04-26:
 *   - Página usa OpenLayers en proyección EPSG:32721 (UTM Zone 21S Uruguay).
 *   - El layer 1 contiene LineString (shape de calles).
 *   - Layers 2, 3 contienen Points (paradas) con propiedad `txt` que tiene
 *     HTML con `<span class=value>NOMBRE</span>`.
 *   - La conversión UTM21S→WGS84 está implementada inline (no requiere proj4).
 *
 * Cómo correr:
 *   cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot
 *   node scripts/scrape_stm_oficial.cjs   # ~60-90 min total
 *
 * Variables de entorno requeridas:
 *   GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\serviceAccountKey.json
 *
 * Idempotente: si una línea falla, queda registrada en `errors.json` para
 * reintentar puntualmente.
 */

const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const STM_URL = 'https://www.montevideo.gub.uy/app/stm/horarios/';
const STM_ONLINE_URL = 'https://www.montevideo.gub.uy/buses/rest/stm-online';
const STM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Referer: 'https://www.montevideo.gub.uy/buses/',
  Origin: 'https://www.montevideo.gub.uy',
};

const OUT_DIR = path.join(__dirname, '..', 'data', 'stm_scraped');
const ERRORS_FILE = path.join(OUT_DIR, 'errors.json');
const SUCCESS_FILE = path.join(OUT_DIR, 'success.json');

// ─── Mapeo línea → empresa desde stm-online (se construye en main()) ──────────
// Clave: String(linea), Valor: number (codigoEmpresa: 10=COETC, 20=COME, 50=CUTCSA, 70=UCOT)
let lineaToEmpresa = new Map();

function inferirAgencyId(lineaCodigo) {
  return lineaToEmpresa.get(String(lineaCodigo)) ?? null;
}

// ─── Construir mapa linea→empresa llamando stm-online UNA vez ─────────────────
async function buildLineaToEmpresaMap() {
  console.log('Consultando stm-online para mapear líneas → empresa…');
  try {
    const res = await fetch(STM_ONLINE_URL, {
      method: 'POST',
      headers: STM_HEADERS,
      body: JSON.stringify({ empresa: '-1' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    let mapped = 0;
    for (const f of data.features ?? []) {
      const p = f.properties;
      if (p?.linea && p?.codigoEmpresa) {
        const k = String(p.linea);
        if (!lineaToEmpresa.has(k)) {
          lineaToEmpresa.set(k, Number(p.codigoEmpresa));
          mapped++;
        }
      }
    }
    console.log(`stm-online: ${data.features?.length ?? 0} buses → ${mapped} líneas únicas mapeadas`);
  } catch (e) {
    console.warn(`[WARN] stm-online falló (${e.message}). agencyId quedará null para todas las líneas.`);
  }
}

// ─── Conversión UTM 21S → WGS84 (mismo algoritmo verificado en browser) ──────
function utm21sToLatLng(easting, northing) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const lon0 = (-57 * Math.PI) / 180;
  const FE = 500000;
  const FN = 10000000;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const x = easting - FE;
  const y = northing - FN;
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const J1 = (3 * e1) / 2 - (27 * e1 ** 3) / 32;
  const J2 = (21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32;
  const J3 = (151 * e1 ** 3) / 96;
  const J4 = (1097 * e1 ** 4) / 512;
  const fp =
    mu +
    J1 * Math.sin(2 * mu) +
    J2 * Math.sin(4 * mu) +
    J3 * Math.sin(6 * mu) +
    J4 * Math.sin(8 * mu);
  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);
  const C1 = ep2 * cosFp * cosFp;
  const T1 = tanFp * tanFp;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinFp * sinFp, 1.5);
  const N1 = a / Math.sqrt(1 - e2 * sinFp * sinFp);
  const D = x / (N1 * k0);
  const Q1 = (N1 * tanFp) / R1;
  const Q2 = (D * D) / 2;
  const Q3 = ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24;
  const Q4 =
    ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720;
  const lat = fp - Q1 * (Q2 - Q3 + Q4);
  const Q5 = D;
  const Q6 = ((1 + 2 * T1 + C1) * D ** 3) / 6;
  const Q7 = ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120;
  const lng = lon0 + (Q5 - Q6 + Q7) / cosFp;
  return { lat: (lat * 180) / Math.PI, lng: (lng * 180) / Math.PI };
}

// ─── Extractor de datos del mapa OL (reutilizado por cada sentido) ────────────
const EXTRACT_MAP_DATA_FN = `
(function extractMapData() {
  var layers = window.map.getLayers().getArray();
  var shape = [], seenSh = {}, paradas = [], seenP = {};
  layers.forEach(function(l) {
    var src = l.getSource && l.getSource();
    if (!src || typeof src.getFeatures !== 'function') return;
    src.getFeatures().forEach(function(f) {
      var geom = f.getGeometry && f.getGeometry();
      if (!geom) return;
      if (geom.getType() === 'LineString') {
        geom.getCoordinates().forEach(function(c) {
          var ll = window.utm21sToLatLng(c[0], c[1]);
          var k = ll.lat.toFixed(6) + ',' + ll.lng.toFixed(6);
          if (!seenSh[k]) { seenSh[k] = 1; shape.push(ll); }
        });
      } else if (geom.getType() === 'Point') {
        var c = geom.getCoordinates();
        var ll = window.utm21sToLatLng(c[0], c[1]);
        var txt = f.get('txt') || '';
        var m = txt.match(/<span class=["']?value["']?>\\s*([^<]+?)\\s*<\\/span>/);
        var nombre = m ? m[1].trim() : null;
        var k = ll.lat.toFixed(5) + ',' + ll.lng.toFixed(5) + ',' + (nombre || '');
        if (!seenP[k]) { seenP[k] = 1; paradas.push({ lat: ll.lat, lng: ll.lng, nombre: nombre }); }
      }
    });
  });
  return { shape: shape, paradas: paradas };
})()
`;

// ─── Scraper por sentido (ciclo completo independiente, sin goBack) ───────────
// Razón: goBack() retorna al formulario vacío (estado pre-Consultar), no a la
// lista de resultados. Hacer 2 ciclos completos independientes es más confiable.
async function scrapeLineaSentido(page, lineaTexto, sentido) {
  await page.goto(STM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('select[id$="slLinea_input"]', { timeout: 20000 });
  await page.evaluate(`window.utm21sToLatLng = ${utm21sToLatLng.toString()};`);

  const ok = await page.evaluate((linTxt) => {
    const sel = document.querySelector('select[id$="slLinea_input"]');
    const opt = Array.from(sel.options).find((o) => o.text.trim() === linTxt);
    if (!opt) return false;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, lineaTexto);
  if (!ok) return null;

  // Click Consultar
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('a, button, .ui-button')].find((e) =>
      /consultar/i.test((e.textContent || '').trim()),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 4000));

  // Si es Vuelta, cambiar tab
  if (sentido === 'Vuelta') {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('a, span, li')].find(
        (e) => e.textContent.trim() === 'Vuelta',
      );
      el?.click();
    });
    await new Promise((r) => setTimeout(r, 1500));
  }

  const btnExiste = await page.evaluate(() =>
    !!document.querySelector('button[title="Mostrar recorrido"]'),
  );
  if (!btnExiste) return null;

  // Navegar al mapa — domcontentloaded porque la página carga tiles indefinidamente
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    page.evaluate(() => document.querySelector('button[title="Mostrar recorrido"]').click()),
  ]);

  // Esperar LineString en OL (el shape vectorial llega antes que los tiles raster)
  const lineStringOk = await page
    .waitForFunction(
      `window.map &&
       typeof window.map.getLayers === "function" &&
       window.map.getLayers().getArray().some(function(l) {
         return l.getSource && l.getSource() &&
                typeof l.getSource().getFeatures === "function" &&
                l.getSource().getFeatures().some(function(f) {
                  var g = f.getGeometry && f.getGeometry();
                  return g && g.getType() === "LineString";
                });
       })`,
      { timeout: 20000 },
    )
    .catch(() => null);

  // Fallback: si no hay LineString en 20s, esperar cualquier feature (líneas sin shape)
  if (!lineStringOk) {
    await page
      .waitForFunction(
        `window.map &&
         window.map.getLayers().getArray().some(function(l) {
           return l.getSource && l.getSource() &&
                  typeof l.getSource().getFeatures === "function" &&
                  l.getSource().getFeatures().length > 0;
         })`,
        { timeout: 5000 },
      )
      .catch(() => {});
  }

  await page.evaluate(`window.utm21sToLatLng = ${utm21sToLatLng.toString()};`);
  const datos = await page.evaluate(EXTRACT_MAP_DATA_FN);
  return datos;
}

// ─── Scraper principal (llama scrapeLineaSentido 2 veces: Ida + Vuelta) ───────
async function scrapeLinea(page, lineaTexto) {
  const result = { linea: lineaTexto, ida: null, vuelta: null };
  result.ida = await scrapeLineaSentido(page, lineaTexto, 'Ida').catch((e) => {
    console.error(`  [Ida] ${e.message}`);
    return null;
  });
  result.vuelta = await scrapeLineaSentido(page, lineaTexto, 'Vuelta').catch((e) => {
    console.error(`  [Vuelta] ${e.message}`);
    return null;
  });
  return result;
}

// ─── Persistencia Firestore ──────────────────────────────────────────────────
async function persistirEnFirestore(db, scrapeResult) {
  const linea = scrapeResult.linea;
  const agencyId = inferirAgencyId(linea);
  for (const sentido of ['ida', 'vuelta']) {
    const data = scrapeResult[sentido];
    if (!data || !data.shape || data.shape.length === 0) continue;
    const sentidoUpper = sentido.toUpperCase();
    // Doc ID incluye agencyId cuando lo conocemos, para que navigationDataService
    // pueda buscar por where('agencyId', '==', String(agencyId)) correctamente.
    const prefix = agencyId ? String(agencyId) : 'imm';
    const docId = `${prefix}_${linea}_${sentidoUpper}`;
    await db
      .collection('shapes_cross_operator')
      .doc(docId)
      .set(
        {
          fuente: 'stm_horarios_oficial_imm',
          agencyId: agencyId ? String(agencyId) : null,
          linea,
          sentido: sentidoUpper,
          points: data.shape,
          paradas: data.paradas,
          puntosShape: data.shape.length,
          paradasCount: data.paradas.length,
          generadoEn: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Init Firebase Admin
  admin.initializeApp();
  const db = admin.firestore();

  // 0. Construir mapa línea → empresa desde stm-online (una sola llamada)
  await buildLineaToEmpresaMap();

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // 1. Levantar el catálogo de líneas del dropdown JSF
  await page.goto(STM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('select[id$="slLinea_input"]', { timeout: 20000 });
  const lineasJSF = await page.evaluate(() => {
    const sel = document.querySelector('select[id$="slLinea_input"]');
    return Array.from(sel.options)
      .filter((o) => o.value && !o.text.includes('Seleccione'))
      .map((o) => o.text.trim());
  });
  console.log(`Catálogo JSF: ${lineasJSF.length} líneas`);

  // 2. Cross-check: líneas operando hoy que no están en el dropdown JSF
  const lineasJSFSet = new Set(lineasJSF);
  const lineasExtra = [];
  for (const linea of lineaToEmpresa.keys()) {
    if (!lineasJSFSet.has(linea)) {
      lineasExtra.push(linea);
    }
  }
  if (lineasExtra.length > 0) {
    console.log(`stm-online tiene ${lineasExtra.length} líneas extra (no en JSF): ${lineasExtra.join(', ')}`);
  }

  // Lista completa = JSF + extras de stm-online
  const lineas = [...lineasJSF, ...lineasExtra];
  console.log(`Total a scrapear: ${lineas.length} líneas`);

  const success = [];
  const errors = [];

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const empresa = lineaToEmpresa.get(String(linea));
    const empresaLabel = empresa ? `emp:${empresa}` : 'sin-empresa';
    console.log(`[${i + 1}/${lineas.length}] ${linea} (${empresaLabel})…`);
    try {
      const r = await scrapeLinea(page, linea);
      if (r.ida || r.vuelta) {
        await persistirEnFirestore(db, r);
        success.push({
          linea,
          agencyId: empresa ?? null,
          idaShape: r.ida?.shape?.length ?? 0,
          idaParadas: r.ida?.paradas?.length ?? 0,
          vueltaShape: r.vuelta?.shape?.length ?? 0,
          vueltaParadas: r.vuelta?.paradas?.length ?? 0,
        });
      } else {
        errors.push({ linea, reason: 'no-data' });
      }
    } catch (e) {
      console.error(`Error en ${linea}:`, e.message);
      errors.push({ linea, error: e.message });
    }
    // Persistir progreso cada 10 líneas (recovery)
    if ((i + 1) % 10 === 0) {
      fs.writeFileSync(SUCCESS_FILE, JSON.stringify(success, null, 2));
      fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2));
    }
  }

  fs.writeFileSync(SUCCESS_FILE, JSON.stringify(success, null, 2));
  fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2));
  await browser.close();

  // Resumen por empresa
  const porEmpresa = {};
  for (const s of success) {
    const k = String(s.agencyId ?? 'desconocida');
    porEmpresa[k] = (porEmpresa[k] ?? 0) + 1;
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`Total: ${lineas.length}`);
  console.log(`OK: ${success.length}`);
  console.log(`Errores: ${errors.length}`);
  console.log(`Por empresa:`, porEmpresa);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
