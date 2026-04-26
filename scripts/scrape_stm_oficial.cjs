/**
 * scrape_stm_oficial.cjs — Scraper one-shot de la página oficial STM/IMM.
 * ========================================================================
 * Scrapea las 140 líneas del catálogo en
 * https://www.montevideo.gub.uy/app/stm/horarios/ y para cada una extrae:
 *   - Shape (LineString) IDA y VUELTA
 *   - Paradas (Points) con nombre y lat/lng
 *
 * Persiste a Firestore como `shapes_cross_operator/{empresa}_{linea}_{sentido}`
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
 *   npm i puppeteer firebase-admin       # si no están
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
const OUT_DIR = path.join(__dirname, '..', 'data', 'stm_scraped');
const ERRORS_FILE = path.join(OUT_DIR, 'errors.json');
const SUCCESS_FILE = path.join(OUT_DIR, 'success.json');

// ─── Mapeo línea → empresa (heurística por código de bus IMM) ────────────────
// Para códigos numéricos, agrupar por rango. Líneas con prefijo letra (CE, BT,
// L, D, G) son típicamente diferenciales/locales — empresa se determina post
// scrapeo cruzando con el endpoint stm-online (que sí reporta codigoEmpresa).
function inferirAgencyId(_lineaCodigo) {
  // Por ahora null: se completa con un cross-merge posterior contra
  // `competidores` o `gps_pings_raw` que sí tienen el codigoEmpresa real.
  return null;
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

// ─── Scraper principal ───────────────────────────────────────────────────────
async function scrapeLinea(page, lineaTexto) {
  await page.goto(STM_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('select[id$="slLinea_input"]', { timeout: 15000 });

  // Inyectar utm21sToLatLng en el contexto de la página
  await page.evaluate(`window.utm21sToLatLng = ${utm21sToLatLng.toString()};`);

  // Seleccionar línea
  const ok = await page.evaluate((linTxt) => {
    const sel = document.querySelector('select[id$="slLinea_input"]');
    const opt = Array.from(sel.options).find((o) => o.text.trim() === linTxt);
    if (!opt) return false;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, lineaTexto);
  if (!ok) return { error: 'linea-no-encontrada', linea: lineaTexto };

  // Click CONSULTAR
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('a, button, .ui-button')].find((e) =>
      /consultar/i.test((e.textContent || '').trim()),
    );
    btn?.click();
  });
  await page.waitForTimeout(4000);

  const result = { linea: lineaTexto, ida: null, vuelta: null };

  for (const tab of ['Ida', 'Vuelta']) {
    // Cambiar tab si existe
    await page.evaluate((t) => {
      const el = [...document.querySelectorAll('a, span, li')].find(
        (e) => e.textContent.trim() === t,
      );
      el?.click();
    }, tab);
    await page.waitForTimeout(1500);

    // Click primer botón Recorrido (2do icono de la primera fila)
    const opened = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      if (rows.length === 0) return false;
      const btns = rows[0].querySelectorAll('a, button, .ui-button');
      if (btns.length < 2) return false;
      btns[1].click();
      return true;
    });
    if (!opened) continue;

    // Esperar mapa.xhtml y que window.map esté listo
    await page.waitForFunction(
      'window.map && typeof window.map.getLayers === "function"',
      { timeout: 15000 },
    );
    // Re-inyectar el converter
    await page.evaluate(`window.utm21sToLatLng = ${utm21sToLatLng.toString()};`);

    // Extraer shape + paradas
    const datos = await page.evaluate(() => {
      const layers = window.map.getLayers().getArray();
      const shape = [];
      const seenSh = new Set();
      const paradas = [];
      const seenP = new Set();
      layers.forEach((l) => {
        const feats =
          l.getSource && l.getSource().getFeatures && l.getSource().getFeatures();
        if (!feats) return;
        feats.forEach((f) => {
          const geom = f.getGeometry && f.getGeometry();
          if (!geom) return;
          if (geom.getType() === 'LineString') {
            geom.getCoordinates().forEach((c) => {
              const ll = window.utm21sToLatLng(c[0], c[1]);
              const k = `${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}`;
              if (!seenSh.has(k)) {
                seenSh.add(k);
                shape.push(ll);
              }
            });
          } else if (geom.getType() === 'Point') {
            const c = geom.getCoordinates();
            const ll = window.utm21sToLatLng(c[0], c[1]);
            const txt = f.get('txt') || '';
            const m = txt.match(/<span class=["']?value["']?>\s*([^<]+?)\s*<\/span>/);
            const nombre = m ? m[1].trim() : null;
            const k = `${ll.lat.toFixed(5)},${ll.lng.toFixed(5)},${nombre || ''}`;
            if (!seenP.has(k)) {
              seenP.add(k);
              paradas.push({ lat: ll.lat, lng: ll.lng, nombre });
            }
          }
        });
      });
      return { shape, paradas };
    });

    result[tab.toLowerCase()] = datos;

    // Volver al listado
    await page.goBack({ waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);
  }
  return result;
}

// ─── Persistencia Firestore ──────────────────────────────────────────────────
async function persistirEnFirestore(db, scrapeResult) {
  const linea = scrapeResult.linea;
  const agencyId = inferirAgencyId(linea); // null por ahora — se cruza después
  for (const sentido of ['ida', 'vuelta']) {
    const data = scrapeResult[sentido];
    if (!data || !data.shape || data.shape.length === 0) continue;
    const sentidoUpper = sentido.toUpperCase();
    const docId = `imm_${linea}_${sentidoUpper}`;
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

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // 1. Levantar el catálogo de líneas
  await page.goto(STM_URL, { waitUntil: 'networkidle2' });
  await page.waitForSelector('select[id$="slLinea_input"]');
  const lineas = await page.evaluate(() => {
    const sel = document.querySelector('select[id$="slLinea_input"]');
    return Array.from(sel.options)
      .filter((o) => o.value && !o.text.includes('Seleccione'))
      .map((o) => o.text.trim());
  });
  console.log(`Catálogo: ${lineas.length} líneas`);

  const success = [];
  const errors = [];

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    console.log(`[${i + 1}/${lineas.length}] ${linea}…`);
    try {
      const r = await scrapeLinea(page, linea);
      if (r.ida || r.vuelta) {
        await persistirEnFirestore(db, r);
        success.push({
          linea,
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

  console.log(`\n=== RESUMEN ===`);
  console.log(`Total: ${lineas.length}`);
  console.log(`OK: ${success.length}`);
  console.log(`Errores: ${errors.length}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
