import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3005/', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshot.png', fullPage: true });
    console.log("Screenshot saved!");
  } catch (e) {
    console.log(`Navigation error: ${e.message}`);
  }

  await browser.close();
})();
