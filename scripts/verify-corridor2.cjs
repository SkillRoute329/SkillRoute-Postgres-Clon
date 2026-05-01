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

  await page.goto('https://skillroute.web.app/dashboard/traffic/corridor-intelligence', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(6000);

  // Clic en tab "Inteligencia de Corredores"
  try {
    await page.click('button:has-text("Inteligencia de Corredores")', { timeout: 5000 });
    await page.waitForTimeout(5000);
  } catch(e) {
    console.log('Tab click fallido:', e.message);
  }

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  const criticalErrors = errors.filter(e => !e.includes('favicon') && !e.includes('React DevTools'));

  console.log('=== ERRORES CRÍTICOS (' + criticalErrors.length + ') ===');
  criticalErrors.forEach(e => console.log(' -', e.slice(0, 300)));

  console.log('\n=== CONTENIDO VISIBLE ===');
  console.log(bodyText);

  await browser.close();
}

run();
