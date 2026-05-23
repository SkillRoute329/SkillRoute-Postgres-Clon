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
  await page.goto('http://127.0.0.1:3006/dashboard/traffic/centro-turno', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 6000));
  const out = await page.evaluate(() => {
    const body = document.body.innerText;
    const ms = body.match(/hace\s+\d+\s*h(\W|$)/gi) || [];
    return { 
      h1: document.querySelector('h1')?.innerText,
      url: window.location.pathname,
      bodyLen: body.length,
      alertasViejasMatches: ms.slice(0, 10),
      sample: body.slice(0, 500).replace(/\s+/g, ' '),
    };
  });
  console.log('URL final:', out.url);
  console.log('H1:', out.h1);
  console.log('Body len:', out.bodyLen);
  console.log('Coincidencias "hace X h":', out.alertasViejasMatches);
  console.log('\nSample:\n', out.sample);
  await browser.close();
})();
