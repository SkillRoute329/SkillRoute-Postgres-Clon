// Verifica que corridor-intelligence redirige al login (DEMO_MODE=false activo)
const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://skillroute.web.app/dashboard/traffic/corridor-intelligence', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await page.waitForTimeout(3000);

  const url = page.url();
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));

  console.log('URL final:', url);
  console.log('Title:', title);
  console.log('¿Redirigió al login?', url.includes('/login') ? '✅ SÍ' : '❌ NO — sigue en ruta protegida');
  console.log('\nContenido:');
  console.log(bodyText);

  await browser.close();
}

run();
