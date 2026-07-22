// Reproduce el problema en navegador headless y captura EVIDENCIA real:
// navegaciones/recargas, errores de consola y de página, redirecciones.
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  let navs = 0;
  const nav = [];
  const consoleMsgs = [];
  const errors = [];

  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) {
      navs++;
      nav.push(`${new Date().toISOString().slice(11, 19)} -> ${f.url()}`);
    }
  });
  page.on('console', (m) => {
    const t = m.text();
    if (consoleMsgs.length < 60) consoleMsgs.push(`[${m.type()}] ${t.slice(0, 200)}`);
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 250)));
  page.on('requestfailed', (r) => {
    if (errors.length < 40)
      errors.push(`REQFAIL ${r.failure()?.errorText} ${r.url().slice(0, 120)}`);
  });

  try {
    await page.goto('http://127.0.0.1:3006/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e) {
    console.log('goto error:', String(e).slice(0, 150));
  }
  // Observar 22s el comportamiento real (¿recarga sola?).
  await new Promise((r) => setTimeout(r, 22000));

  let rootHtmlLen = -1;
  try {
    rootHtmlLen = await page.evaluate(
      () => (document.getElementById('root') || {}).innerHTML?.length ?? -1,
    );
  } catch {}
  let url = '';
  try {
    url = page.url();
  } catch {}

  console.log('=== RESULTADO ===');
  console.log('Navegaciones del main frame en ~22s:', navs, '(1-2 = normal; muchas = LOOP)');
  console.log('URL final:', url);
  console.log('Tamaño de #root al final:', rootHtmlLen, '(>500 = app montó; 0/-1 = pantalla vacía)');
  console.log('\n--- Navegaciones ---');
  console.log(nav.slice(0, 25).join('\n'));
  console.log('\n--- Errores de página / requests fallidos ---');
  console.log(errors.slice(0, 20).join('\n') || '(ninguno)');
  console.log('\n--- Consola (primeras) ---');
  console.log(consoleMsgs.slice(0, 30).join('\n') || '(vacía)');

  await browser.close();
})().catch((e) => {
  console.log('FATAL', String(e).slice(0, 200));
  process.exit(1);
});
