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
  await inputs[0].type('329'); await inputs[1].type('Skill329');
  const btn = await page.evaluateHandle(() => Array.from(document.querySelectorAll('button')).find((b) => /Ingresar/i.test(b.textContent || '')));
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    btn.click(),
  ]);
  await new Promise((r) => setTimeout(r, 3000));
  await page.goto('http://127.0.0.1:3006/dashboard/traffic/carton-manager', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 8000));
  const info = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.innerText ?? '(no h1)',
    url: window.location.pathname,
    hasGestor: document.body.innerText.includes('Gestor de Cartones'),
    title: document.title,
  }));
  console.log('URL:', info.url, '· H1:', info.h1, '· title:', info.title);
  console.log('Tiene "Gestor de Cartones":', info.hasGestor);
  const matches = await page.evaluate(() => {
    const body = document.body.innerText;
    const re = /sin\s+(datos|conexi[óo]n|inspecciones|carga|registros)|no\s+(hay\s+)?(datos|registros|resultados)|empty|vac[íi]o/gi;
    const list = [];
    let m;
    while ((m = re.exec(body)) !== null) {
      const ctx = body.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\n/g, ' ');
      list.push(ctx);
      if (list.length > 5) break;
    }
    return list;
  });
  console.log('Matches "sin datos":');
  matches.forEach((m, i) => console.log('  ' + (i+1) + '. ...' + m + '...'));
  await browser.close();
})();
