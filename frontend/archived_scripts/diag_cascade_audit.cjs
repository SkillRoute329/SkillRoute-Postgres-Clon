// Verifica que el dashboard auditor de cascada carga, muestra KPIs y la tabla.
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e).slice(0, 150)));

  try {
    await page.goto('http://127.0.0.1:3006/login', { waitUntil: 'networkidle2', timeout: 60000 });
    // Login real con los inputs del form (lo que el AuthContext sabe parsear)
    await new Promise((r) => setTimeout(r, 1500));
    const inputs = await page.$$('input');
    await inputs[0].type('329');
    await inputs[1].type('Skill329');
    // Buscar y clickear el submit
    const submitBtn = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('button')).find((b) => /Ingresar/i.test(b.textContent || ''));
    });
    if (submitBtn) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
        submitBtn.click(),
      ]);
    }
    await new Promise((r) => setTimeout(r, 3000));
    // Navegar al sub-path
    await page.goto('http://127.0.0.1:3006/dashboard/super-admin/cascade-audit', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 5000));

    const stats = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.innerText ?? '';
      const kpis = Array.from(document.querySelectorAll('.text-2xl')).map((el) => (el).innerText);
      const rowsCount = document.querySelectorAll('tbody tr').length;
      const tbody = document.querySelector('tbody')?.innerText ?? '';
      const sinEventos = /Sin eventos/i.test(tbody);
      const url = window.location.href;
      const user = localStorage.getItem('skillroute_user') || '';
      const sample = document.body.innerText.slice(0, 400);
      return { h1, kpis, rowsCount, sinEventos, url, user, sample };
    });

    console.log('═══ CASCADE AUDIT ═══');
    console.log('Título:', stats.h1);
    console.log('KPIs:', JSON.stringify(stats.kpis));
    console.log('Filas tabla:', stats.rowsCount);
    console.log('Sin eventos?', stats.sinEventos);
    console.log('URL:', stats.url);
    console.log('User:', stats.user.slice(0, 200));
    console.log('Body sample:', stats.sample);
    console.log('PageErrors:', pageErrors.length === 0 ? '(ninguno)' : pageErrors.join('\n  '));
  } catch (e) {
    console.log('FATAL', String(e).slice(0, 200));
  } finally {
    await browser.close();
  }
})();
