import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const log = (msg) => { fs.appendFileSync('out.utf8.txt', msg + '\n'); };
  
  page.on('console', msg => log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', error => log(`[Browser Error] ${error.message}`));
  page.on('requestfailed', request => log(`[Request Failed] ${request.url()} - ${request.failure()?.errorText}`));

  try {
    const response = await page.goto('http://localhost:3005/', { waitUntil: 'networkidle', timeout: 10000 });
    log(`Status: ${response?.status()}`);
    await page.waitForTimeout(2000);
    const bodyLength = (await page.content()).length;
    log(`Body text length: ${bodyLength}`);
  } catch (e) {
    log(`Navigation error: ${e.message}`);
  }

  await browser.close();
})();
