// Verificación específica del módulo Cumplimiento tras los fixes del usuario.
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  await page.goto('http://127.0.0.1:3006/login', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const inputs = await page.$$('input');
  await inputs[0].type('329');
  await inputs[1].type('Skill329');
  const submitBtn = await page.evaluateHandle(() => Array.from(document.querySelectorAll('button')).find((b) => /Ingresar/i.test(b.textContent || '')));
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    submitBtn.click(),
  ]);
  await new Promise((r) => setTimeout(r, 3000));

  await page.goto('http://127.0.0.1:3006/dashboard/traffic/diagnostico-cumplimiento', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 5000));

  const stats = await page.evaluate(() => {
    const body = document.body.innerText;
    const tablas = document.querySelectorAll('tbody tr').length;
    // Buscar botón "Ver atrasos"
    const verAtrasos = !!Array.from(document.querySelectorAll('button')).find((b) => /Ver atrasos/i.test(b.textContent || ''));
    // KPIs visibles
    const kpis = Array.from(document.querySelectorAll('.text-2xl, .text-3xl, .text-xl'))
      .map((el) => (el).innerText?.trim())
      .filter((t) => /^\d/.test(t || ''));
    return { bodyLen: body.length, tablas, verAtrasos, kpisSample: kpis.slice(0, 8), sample: body.slice(0, 250) };
  });

  console.log('═══ Módulo Cumplimiento ═══');
  console.log('Body length:', stats.bodyLen);
  console.log('Filas de tabla:', stats.tablas);
  console.log('Botón "Ver atrasos" presente:', stats.verAtrasos);
  console.log('KPIs muestreados:', stats.kpisSample.join(', '));
  console.log('Body sample:', stats.sample);

  // Si hay tabla, hago click en el primer "Ver atrasos" para verificar modal
  if (stats.verAtrasos) {
    console.log('\n>>> Click en "Ver atrasos"...');
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => /Ver atrasos/i.test(x.textContent || ''));
      if (b) (b).click();
    });
    await new Promise((r) => setTimeout(r, 2500));
    const modal = await page.evaluate(() => {
      const m = document.querySelector('[class*="z-[2100]"]');
      return m ? m.textContent?.slice(0, 300).replace(/\s+/g, ' ') : null;
    });
    console.log('Modal abierto:', modal ?? '(no visible)');
  }

  await browser.close();
})();
