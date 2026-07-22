// Crawler real del navegador autenticado: recorre TODAS las rutas críticas
// del sidebar y captura errores reales por pantalla (pageerror, requests
// 4xx/5xx, console error). Reporta una tabla compacta para identificar
// qué módulos fallan y dónde.
const puppeteer = require('puppeteer');

const RUTAS = [
  // Operación Diaria
  '/dashboard/traffic/planificacion',
  '/dashboard/traffic/listero',
  '/dashboard/traffic/navigation',
  // Control y Monitoreo
  '/dashboard/traffic/centro-turno',
  '/dashboard/traffic/fleet-monitor',
  '/dashboard/traffic/diagnostico-cumplimiento',
  '/dashboard/traffic/incidents',
  // Inteligencia
  '/dashboard/traffic/ceo',
  '/dashboard/traffic/competitor-intelligence',
  '/dashboard/traffic/analisis-critico',
  '/dashboard/traffic/diagnostico-ejecutivo',
  '/dashboard/traffic/corridor-intelligence',
  '/dashboard/traffic/corridor-map',
  '/dashboard/traffic/brt',
  // Financiero
  '/dashboard/traffic/financiero',
  // Flota y personal
  '/dashboard/fleet',
  '/dashboard/admin/rrhh',
  // Administración
  '/dashboard/admin/asignacion-vehiculos',
  '/dashboard/traffic/inspector-control',
  '/dashboard/admin/sistema',
  '/dashboard/admin/regulatorio',
  '/dashboard/admin/regulatorio/cumplimiento',
  '/dashboard/super-admin/centro-mando',
  '/dashboard/super-admin/gantt-red',
  '/dashboard/super-admin/motor-consecuencias',
  // Personal
  '/dashboard/driver/compliance',
  '/dashboard/market',
  '/dashboard/my-balance',
  // Misceláneos importantes del mapa
  '/dashboard/admin/balances',
  '/dashboard/admin/users',
  '/dashboard/admin/whatsapp',
  '/dashboard/admin/tenants',
  '/dashboard/admin/cross-op-coverage',
  '/dashboard/admin/cartones',
  '/dashboard/operations/distribution',
  '/dashboard/traffic/personal-ucot',
  '/dashboard/traffic/distribucion-diaria',
  '/dashboard/traffic/boletin-inspeccion',
  '/dashboard/traffic/carton-manager',
  '/dashboard/traffic/digital-agents',
  '/dashboard/traffic/inspector-capture',
  '/dashboard/traffic/service-analytics',
  '/dashboard/abl/penalizations',
  '/dashboard/driver/alertas-documento',
  '/system-doctor',
];

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  // Login — vía endpoint REST + setear token en localStorage, evita parser
  // frágil de inputs.
  try {
    await page.goto('http://127.0.0.1:3006/login', { waitUntil: 'networkidle2', timeout: 60000 });
    const tokenResult = await page.evaluate(async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNumber: '329', password: 'Skill329' }),
      });
      const j = await r.json();
      const tok = j.data?.token || j.token || '';
      if (tok) {
        localStorage.setItem('skillroute_jwt', tok);
        // Compat con keys legacy por si algún componente la lee
        localStorage.setItem('token', tok);
        if (j.data?.user) localStorage.setItem('skillroute_user', JSON.stringify(j.data.user));
      }
      return { ok: !!tok, len: tok.length };
    });
    if (!tokenResult.ok) throw new Error('login no devolvió token');
    console.log('LOGIN OK (token len=' + tokenResult.len + ')');
  } catch (e) {
    console.log('LOGIN FAIL:', String(e).slice(0, 200));
    await browser.close();
    process.exit(1);
  }

  const reportes = [];

  for (const ruta of RUTAS) {
    const pageErrors = [];
    const failedRequests = [];
    const consoleErrors = [];
    const consoleWarns = [];

    const onError = (e) => pageErrors.push(String(e?.message ?? e).slice(0, 180));
    const onReqFail = (r) => {
      if (failedRequests.length < 20) failedRequests.push(`${r.failure()?.errorText ?? '?'} ${r.url().slice(-60)}`);
    };
    const onConsole = (m) => {
      const type = m.type();
      const text = m.text().slice(0, 200);
      // Ignorar warnings de HMR/Vite
      if (text.includes('[vite]') || text.includes('HMR')) return;
      if (type === 'error' && consoleErrors.length < 10) consoleErrors.push(text);
      if (type === 'warning' && consoleWarns.length < 5) consoleWarns.push(text);
    };
    const onResponse = (r) => {
      const s = r.status();
      const u = r.url();
      // Solo nos importan respuestas API del propio backend (no fonts, no Google)
      if (s >= 400 && (u.includes('/api/') || u.includes('/historic') || u.includes('/penetration'))) {
        const path = u.replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(0, 80);
        const entry = `[${s}] ${path}`;
        if (!failedRequests.includes(entry) && failedRequests.length < 20) failedRequests.push(entry);
      }
    };

    page.on('pageerror', onError);
    page.on('requestfailed', onReqFail);
    page.on('console', onConsole);
    page.on('response', onResponse);

    try {
      await page.goto('http://127.0.0.1:3006' + ruta, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      pageErrors.push('NAV: ' + String(e?.message ?? e).slice(0, 100));
    }

    page.off('pageerror', onError);
    page.off('requestfailed', onReqFail);
    page.off('console', onConsole);
    page.off('response', onResponse);

    reportes.push({
      ruta,
      pageErrors,
      failedRequests,
      consoleErrors,
      consoleWarns,
    });
  }

  // Reporte
  console.log('\n═══ CRAWLER MÓDULOS — Errores REALES por pantalla ═══\n');
  let conErr = 0;
  for (const r of reportes) {
    const total = r.pageErrors.length + r.failedRequests.length + r.consoleErrors.length;
    if (total === 0) {
      console.log(`✓ ${r.ruta}`);
      continue;
    }
    conErr++;
    console.log(`\n✗ ${r.ruta}`);
    if (r.pageErrors.length) {
      console.log('  PageErrors:');
      r.pageErrors.forEach((e) => console.log('   • ' + e));
    }
    if (r.failedRequests.length) {
      console.log('  Failed requests:');
      r.failedRequests.forEach((x) => console.log('   • ' + x));
    }
    if (r.consoleErrors.length) {
      console.log('  Console errors:');
      r.consoleErrors.forEach((x) => console.log('   • ' + x));
    }
  }
  console.log(`\n──────────────────\nResumen: ${reportes.length - conErr}/${reportes.length} pantallas SIN errores | ${conErr} CON errores`);
  await browser.close();
})().catch((e) => { console.log('FATAL', String(e).slice(0, 300)); process.exit(1); });
