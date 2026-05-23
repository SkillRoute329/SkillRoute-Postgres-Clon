// Auditoría semántica: por cada pantalla, mide la CALIDAD del dato visible.
// No solo si carga sin error, sino si muestra dato real, agregados con
// detalle, alertas frescas, etc.
const puppeteer = require('puppeteer');

// Rutas reales del sidebar (App.tsx). Eliminadas las URLs inventadas que
// generaban falsos positivos "REDIRECCIONADAS".
const RUTAS = [
  // traffic (pantallas con contenido propio, sin redirect)
  '/dashboard/traffic/planificacion',
  '/dashboard/traffic/listero',
  '/dashboard/traffic/navigation',
  '/dashboard/traffic/centro-turno',
  '/dashboard/traffic/fleet-monitor',
  '/dashboard/traffic/diagnostico-cumplimiento',
  '/dashboard/traffic/incidents',
  '/dashboard/traffic/ceo',
  '/dashboard/traffic/competitor-intelligence',
  '/dashboard/traffic/analisis-critico',
  '/dashboard/traffic/diagnostico-ejecutivo',
  '/dashboard/traffic/corridor-intelligence',
  '/dashboard/traffic/corridor-map',
  '/dashboard/traffic/brt',
  '/dashboard/traffic/financiero',
  '/dashboard/traffic/inspector-control',
  '/dashboard/traffic/analytics',
  '/dashboard/traffic/personal',
  '/dashboard/traffic/otp',
  '/dashboard/traffic/cumplimiento',
  // fleet
  '/dashboard/fleet',
  // admin
  '/dashboard/admin/rrhh',
  '/dashboard/admin/asignacion-vehiculos',
  '/dashboard/admin/sistema',
  '/dashboard/admin/regulatorio',
  '/dashboard/admin/regulatorio/cumplimiento',
  '/dashboard/admin/balances',
  '/dashboard/admin/users',
  '/dashboard/admin/communications',
  '/dashboard/admin/cartones',
  '/dashboard/admin/disruptions',
  '/dashboard/admin/parametros-operativos',
  // super-admin
  '/dashboard/super-admin/centro-mando',
  '/dashboard/super-admin/gantt-red',
  '/dashboard/super-admin/motor-consecuencias',
  '/dashboard/super-admin/cascade-audit',
  '/dashboard/super-admin/motor-config',
  '/dashboard/super-admin/auditoria-imm',
  '/dashboard/super-admin/operadores',
  '/dashboard/super-admin/motor-health',
  '/dashboard/super-admin/tenants',
  // driver
  '/dashboard/driver/compliance',
  '/dashboard/driver/mi-linea',
  // operaciones / abl / personal
  '/dashboard/market',
  '/dashboard/my-balance',
  '/dashboard/operations/distribution',
  '/dashboard/abl/penalizations',
];

function categorize(stats) {
  const issues = [];
  if (stats.errors) issues.push(`${stats.errors} errores técnicos`);
  if (stats.empty404 > 0) issues.push(`${stats.empty404} respuestas vacías`);
  // FASE 5.39 (2026-05-23): umbral mínimo para "sin datos" — 5+ instancias.
  // Una o dos por pantalla es legítimo (un solo registro ausente). Solo
  // alerta si la pantalla está saturada de ese texto.
  if (stats.sinDatos >= 5) issues.push(`${stats.sinDatos}× "sin datos"/—/null`);
  // FASE 5.39: KPIs en cero ahora requiere ≥5 totales Y ≥50% en cero,
  // para no alertar cuando un dashboard tiene cientos de KPIs y un puñado
  // legítimamente en 0 (ej. "0 ausencias hoy").
  if (stats.numericKpis >= 5 && stats.zeroKpis >= Math.max(3, stats.numericKpis * 0.5)) {
    issues.push(`${stats.zeroKpis}/${stats.numericKpis} KPIs en 0`);
  }
  if (stats.alertasViejas > 0) issues.push(`alertas >24h: ${stats.alertasViejas}`);
  if (stats.demo > 0) issues.push(`${stats.demo} indicios de demo/mock`);
  if (stats.bodyLen < 800) issues.push(`pantalla casi vacía (${stats.bodyLen} chars)`);
  if (stats.tablesRows === 0 && stats.expectsTable) issues.push('tabla esperada sin filas');
  return issues;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // Login
  await page.goto('http://127.0.0.1:3006/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const inputs = await page.$$('input');
  await inputs[0].type('329');
  await inputs[1].type('Skill329');
  const submitBtn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('button')).find((b) => /Ingresar/i.test(b.textContent || ''));
  });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    submitBtn.click(),
  ]);
  await new Promise((r) => setTimeout(r, 3000));
  console.log('Login OK\n');

  const reportes = [];

  for (const ruta of RUTAS) {
    const errores = [];
    const fail4xx = [];
    const empty200 = [];
    const onError = (e) => errores.push(String(e?.message ?? e).slice(0, 100));
    const onResp = async (r) => {
      const s = r.status();
      const url = r.url();
      if (!url.includes('/api/')) return;
      if (s >= 400) {
        fail4xx.push(`[${s}] ${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 60)}`);
      } else if (s === 200) {
        try {
          const text = await r.text();
          if (text.length < 200 && (text.includes('"data":[]') || text.includes('"total":0') || text === '[]')) {
            empty200.push(url.replace(/^https?:\/\/[^/]+/, '').slice(0, 60));
          }
        } catch { /* */ }
      }
    };

    const failedRaw = [];
    const onFail = (r) => {
      if (failedRaw.length < 10) failedRaw.push(`${r.failure()?.errorText ?? '?'} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 80)}`);
    };
    page.on('pageerror', onError);
    page.on('response', onResp);
    page.on('requestfailed', onFail);

    try {
      await page.goto('http://127.0.0.1:3006' + ruta, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      errores.push('NAV: ' + String(e?.message ?? e).slice(0, 80));
    }

    const finalUrl = await page.evaluate(() => window.location.pathname);
    const wasRedirected = finalUrl !== ruta;
    const stats = await page.evaluate(() => {
      const body = document.body.innerText;
      // Conteos cualitativos — FASE 5.39 (2026-05-23): regex más estrictos
      // para reducir falsos positivos:
      //   - "sin datos" sólo cuenta si es respuesta REAL del backend (no
      //     etiquetas tipo "Sin marca", "Sin asignar", "Sin observaciones").
      //   - "placeholder" excluido de demo (es atributo HTML legítimo y a
      //     veces aparece en innerText de inputs sin valor).
      const sinDatos = (body.match(/sin\s+(datos|conexi[óo]n|registros|resultados)|no\s+hay\s+(datos|registros|resultados|alertas)|datos\s+no\s+disponibles|empty\s+state/gi) || []).length;
      const demo = (body.match(/\b(mock|demo-data|stub-data|simulaci[óo]n|lorem\s+ipsum|TODO:|FIXME:)\b/gi) || []).length;
      const guiones = (body.match(/—/g) || []).length; // "—" repetidos sospechan de columnas sin dato
      // KPIs numéricos
      const numbers = Array.from(document.querySelectorAll('div, span, h1, h2, h3'))
        .map((el) => (el).innerText?.trim())
        .filter((t) => t && /^-?\d{1,4}(\.\d+)?$/.test(t));
      const zeroKpis = numbers.filter((n) => n === '0' || n === '0.0').length;
      // Filas de tabla
      const tablesRows = document.querySelectorAll('tbody tr').length;
      // ¿Hay tablas en pantalla?
      const hasTable = document.querySelectorAll('table').length > 0;
      // Alertas con horas (heurística: detectar "hace X h" donde X > 24)
      const alertasViejasMatch = body.match(/hace\s+(\d+)\s*h(\W|$)/gi) || [];
      const alertasViejas = alertasViejasMatch
        .map((m) => { const n = m.match(/\d+/); return n ? parseInt(n[0], 10) : 0; })
        .filter((n) => n > 24).length;
      return {
        bodyLen: body.length,
        sinDatos,
        demo,
        guiones,
        numericKpis: numbers.length,
        zeroKpis,
        tablesRows,
        expectsTable: hasTable,
        alertasViejas,
        sample: body.slice(0, 120).replace(/\s+/g, ' '),
      };
    });

    page.off('pageerror', onError);
    page.off('response', onResp);
    page.off('requestfailed', onFail);

    reportes.push({
      ruta,
      finalUrl,
      wasRedirected,
      errores: errores.length,
      fail4xx: fail4xx.length,
      fail4xxDetail: fail4xx.slice(0, 3),
      empty200: empty200.length,
      empty200Detail: empty200.slice(0, 3),
      failedRaw: failedRaw.slice(0, 5),
      ...stats,
    });
  }

  // Reporte
  console.log('═══ AUDITORÍA SEMÁNTICA POR MÓDULO ═══\n');

  let critical = [];
  let warning = [];
  let ok = [];

  const redirected = [];
  for (const r of reportes) {
    if (r.wasRedirected) {
      // No es bug — la ruta no existe en el router y fue redirigida.
      redirected.push(r);
      continue;
    }
    const issues = categorize(r);
    if (r.errores > 0 || r.fail4xx > 0 || r.bodyLen < 500) {
      critical.push({ r, issues: [...issues, ...(r.errores > 0 ? ['pageerror'] : []), ...(r.fail4xx > 0 ? [`${r.fail4xx} req fail`] : [])] });
    } else if (issues.length > 0) {
      warning.push({ r, issues });
    } else {
      ok.push(r);
    }
  }

  if (redirected.length > 0) {
    console.log(`\n↩ REDIRECCIONADAS (ruta no existe, cae a otra): ${redirected.length}`);
    redirected.forEach((r) => console.log(`   · ${r.ruta} → ${r.finalUrl}`));
  }

  console.log(`✓ OK (sin problemas detectados): ${ok.length}`);
  ok.forEach((r) => console.log(`   · ${r.ruta}`));

  console.log(`\n⚠ ADVERTENCIA (carga pero algo no cuadra): ${warning.length}`);
  warning.forEach(({ r, issues }) => {
    console.log(`   ✗ ${r.ruta}`);
    console.log(`        ${issues.join(' · ')}`);
  });

  console.log(`\n✗ CRÍTICO (error técnico o casi vacía): ${critical.length}`);
  critical.forEach(({ r, issues }) => {
    console.log(`   ✗ ${r.ruta}`);
    console.log(`        ${issues.join(' · ')}`);
    if (r.fail4xxDetail?.length > 0) {
      r.fail4xxDetail.forEach((d) => console.log(`        4xx: ${d}`));
    }
    if (r.failedRaw?.length > 0) {
      r.failedRaw.forEach((d) => console.log(`        fail: ${d}`));
    }
  });

  // Acumulación de endpoints que fallan común
  const endpointCount = new Map();
  reportes.forEach((r) => {
    (r.fail4xxDetail || []).concat(r.failedRaw || []).forEach((line) => {
      const path = (line.match(/\/api\/[^?\s]+|\/historic[^?\s]*|\/penetration[^?\s]*/g) || [])[0];
      if (path) endpointCount.set(path, (endpointCount.get(path) ?? 0) + 1);
    });
  });
  if (endpointCount.size > 0) {
    console.log('\n══ ENDPOINTS QUE FALLAN EN MÚLTIPLES PANTALLAS ══');
    Array.from(endpointCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .forEach(([ep, n]) => console.log(`   ${n}× ${ep}`));
  }

  console.log(`\n──────────\nResumen: ${ok.length}/${reportes.length} OK · ${warning.length} con advertencias · ${critical.length} críticas · ${redirected.length} rutas inexistentes (redirect)`);

  await browser.close();
})().catch((e) => { console.log('FATAL', String(e).slice(0, 300)); process.exit(1); });
