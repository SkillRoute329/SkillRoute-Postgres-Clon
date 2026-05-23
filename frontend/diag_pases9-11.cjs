// E2E pases 9, 10, 11: motor config / modal cascada / auditoría IMM.
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
    // Login real
    await page.goto('http://127.0.0.1:3006/login', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    const inputs = await page.$$('input');
    await inputs[0].type('329');
    await inputs[1].type('Skill329');
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

    const tests = [
      { name: 'Motor Config', url: 'http://127.0.0.1:3006/dashboard/super-admin/motor-config', expect: /Configuraci.n del Motor de Consecuencias/i },
      { name: 'Reporte IMM',  url: 'http://127.0.0.1:3006/dashboard/super-admin/auditoria-imm',  expect: /Auditor.a Regulatoria/i },
      { name: 'Cascade Audit', url: 'http://127.0.0.1:3006/dashboard/super-admin/cascade-audit', expect: /Auditor.a del Motor/i },
    ];

    for (const t of tests) {
      pageErrors.length = 0;
      await page.goto(t.url, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 4000));
      const found = await page.evaluate((re) => {
        const m = document.body.innerText.match(new RegExp(re, 'i'));
        return m ? m[0] : null;
      }, t.expect.source);
      console.log(`${found ? '✓' : '✗'} ${t.name.padEnd(15)} → ${found ?? '(no encontrado)'}`);
      if (pageErrors.length) {
        console.log('  PageErrors:', pageErrors.join(' | '));
      }
    }

    // E2E modal: click en un evento del widget de la pantalla cascade-audit
    console.log('\n--- Modal de detalle ---');
    await page.goto('http://127.0.0.1:3006/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 4000));
    // Abrir el widget
    const abrioWidget = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        x.getAttribute('title')?.includes('Propagaci'),
      );
      if (b) { (b).click(); return true; }
      return false;
    });
    console.log('Widget abierto:', abrioWidget);
    if (abrioWidget) {
      await new Promise((r) => setTimeout(r, 1500));
      // Click en el primer item cascade
      const click = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('li.cursor-pointer'));
        if (items.length === 0) return { ok: false, reason: 'no hay items clickeables' };
        (items[0]).click();
        return { ok: true, total: items.length };
      });
      console.log('Click item:', JSON.stringify(click));
      await new Promise((r) => setTimeout(r, 2500));
      const modalText = await page.evaluate(() => {
        const modal = document.querySelector('[class*="z-[2000]"]');
        return modal ? modal.textContent?.slice(0, 200) : null;
      });
      console.log('Modal contenido:', modalText ? modalText.replace(/\s+/g, ' ').slice(0, 180) : '(no visible)');
    }
  } catch (e) {
    console.log('FATAL', String(e).slice(0, 200));
  } finally {
    await browser.close();
  }
})();
