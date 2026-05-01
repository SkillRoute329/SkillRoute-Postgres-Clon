// Verifica los 6 módulos del demo path en producción
// DEMO_MODE=true → no requiere autenticación

const { chromium } = require('playwright');

const BASE = 'https://skillroute.web.app';

const ROUTES = [
  { name: 'CEO Dashboard V7', path: '/dashboard/traffic/ceo' },
  { name: 'Fleet Monitor',    path: '/dashboard/traffic/fleet-monitor' },
  { name: 'Inteligencia Corredores', path: '/dashboard/traffic/corridor-intelligence' },
  { name: 'Radar Competencia', path: '/dashboard/traffic/competitor-intelligence' },
  { name: 'Incidencias',      path: '/dashboard/traffic/incidents' },
  { name: 'BRT 2027',         path: '/dashboard/traffic/brt' },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const results = [];

  for (const route of ROUTES) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    try {
      const res = await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);

      const title = await page.title();
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
      const status = res ? res.status() : 0;

      const criticalErrors = errors.filter(e =>
        !e.includes('Warning') &&
        !e.includes('React DevTools') &&
        !e.includes('favicon')
      );

      results.push({
        name: route.name,
        path: route.path,
        httpStatus: status,
        title,
        errors: criticalErrors,
        snippet: bodyText.replace(/\s+/g, ' ').trim(),
        ok: criticalErrors.length === 0,
      });
    } catch (err) {
      results.push({
        name: route.name,
        path: route.path,
        httpStatus: 0,
        errors: [err.message],
        snippet: '',
        ok: false,
      });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log('\n=== VERIFICACIÓN DEMO PATH — ' + new Date().toISOString() + ' ===\n');
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`${icon} ${r.name} (${r.path})`);
    console.log(`   HTTP: ${r.httpStatus} | Title: ${r.title}`);
    if (r.errors.length) {
      console.log(`   ERRORES (${r.errors.length}):`);
      r.errors.forEach(e => console.log(`     - ${e.slice(0, 200)}`));
    }
    console.log(`   Texto: ${r.snippet.slice(0, 150)}`);
    console.log();
  }

  const passed = results.filter(r => r.ok).length;
  console.log(`\nRESUMEN: ${passed}/${results.length} módulos OK`);
  process.exit(passed === results.length ? 0 : 1);
}

run().catch(err => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
