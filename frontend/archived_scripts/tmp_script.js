const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', error => console.error(`[Browser Error] ${error.message}`));

  try {
    const response = await page.goto('http://localhost:3005/', { waitUntil: 'networkidle', timeout: 10000 });
    console.log(`Status: ${response.status()}`);
    console.log(`Body text length:`, (await page.content()).length);
  } catch (e) {
    console.log(`Navigation error: ${e.message}`);
  }

  await browser.close();
})();
