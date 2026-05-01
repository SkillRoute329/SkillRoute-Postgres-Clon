const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('[JS] ' + err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('[console] ' + msg.text());
  });

  try {
    const res = await page.goto('https://skillroute.web.app/dashboard/traffic/corridor-intelligence', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(8000); // esperar carga de datos Firestore
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 800));
    const title = await page.title();

    const criticalErrors = errors.filter(e => !e.includes('favicon') && !e.includes('React DevTools'));

    console.log('HTTP:', res ? res.status() : 0);
    console.log('Title:', title);
    console.log('Errores críticos:', criticalErrors.length);
    if (criticalErrors.length) criticalErrors.forEach(e => console.log(' -', e.slice(0, 250)));
    console.log('\nContenido visible:');
    console.log(bodyText);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

run();
