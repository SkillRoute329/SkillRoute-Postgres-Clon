// Verifica que la corrección de `lines` haya destrabado SystemDoctor.
// Login → /system-doctor → leer el panel "DB" y reportar Lines/Users.
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 250)));
  page.on('requestfailed', r => errors.push(`REQFAIL ${r.failure()?.errorText} ${r.url().slice(0,120)}`));

  try {
    await page.goto('http://127.0.0.1:3006/login', { waitUntil: 'networkidle2', timeout: 60000 });
    // Login
    await page.waitForSelector('input', { timeout: 10000 });
    const inputs = await page.$$('input');
    if (inputs.length < 2) throw new Error('Login form missing');
    await inputs[0].type('329');
    await inputs[1].type('Skill329');
    const btn = await page.$('button');
    if (!btn) throw new Error('Login button missing');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      btn.click(),
    ]);
    await new Promise(r => setTimeout(r, 3000));
    // Ir a SystemDoctor
    await page.goto('http://127.0.0.1:3006/system-doctor', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));
    // Extraer el bloque DB
    // Probar lectura directa del endpoint vía fetch desde el contexto de la página
    await new Promise(r => setTimeout(r, 4000));
    const apiResult = await page.evaluate(async () => {
      const tok = localStorage.getItem('skillroute_jwt') || '';
      const hdr = { Authorization: `Bearer ${tok}` };
      const calls = await Promise.all([
        fetch('/api/db/lines?limit=1', { headers: hdr }).then(r => r.json().then(j => ({ name: 'db/lines', status: r.status, total: j.total }))),
        fetch('/api/db/inspections?limit=1', { headers: hdr }).then(r => r.json().then(j => ({ name: 'db/inspections', status: r.status, total: j.total }))),
        fetch('/api/db/fichas_medicas?limit=1', { headers: hdr }).then(r => r.json().then(j => ({ name: 'db/fichas_medicas', status: r.status, total: j.total }))),
        fetch('/api/db/shift_categories?limit=1', { headers: hdr }).then(r => r.json().then(j => ({ name: 'db/shift_categories', status: r.status, total: j.total }))),
        fetch('/api/db/penalty_rules?limit=1', { headers: hdr }).then(r => r.json().then(j => ({ name: 'db/penalty_rules', status: r.status, total: j.total }))),
        fetch('/api/db/scrapping_logs?limit=1', { headers: hdr }).then(r => r.json().then(j => ({ name: 'db/scrapping_logs', status: r.status, total: j.total }))),
        // POSITIONS — sin auth, debe responder
        fetch('/api/positions').then(r => r.json().then(j => ({ name: '/api/positions', status: r.status, total: j.total, fuente: j.fuente }))),
        fetch('/api/positions/cutcsa').then(r => r.json().then(j => ({ name: '/api/positions/cutcsa', status: r.status, total: j.total }))),
      ]);
      return { tokenLen: tok.length, calls };
    });
    console.log('=== Endpoints (autenticado desde el navegador real) ===');
    console.log(JSON.stringify(apiResult, null, 2));
    const text = await page.evaluate(() => document.body.innerText);
    const html = await page.evaluate(() => document.body.innerHTML.slice(0, 800));
    const dbLine = (text.match(/Lines:\s*\d+.*Users:\s*\d+/i) || [])[0] || '(no se encontró bloque Lines/Users)';
    const url = page.url();
    console.log('URL final:', url);
    console.log('Línea DB del SystemDoctor:', dbLine);
    console.log('Body len:', text.length);
    console.log('HTML head:', html);
    console.log('Errores:', errors.slice(0, 5).join('\n') || '(ninguno)');
  } catch (e) {
    console.log('FATAL', String(e).slice(0, 300));
    console.log('Errores:', errors.slice(0, 5).join('\n'));
  } finally {
    await browser.close();
  }
})();
