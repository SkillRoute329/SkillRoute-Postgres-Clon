const { chromium } = require('@playwright/test');

(async () => {
  console.log('Starting UI Verification of Populated DB...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const ARTIFACTS_DIR = 'C:\\Users\\jonat\\.gemini\\antigravity\\brain\\95eba2f2-c3dc-4a88-a115-899d3caba0ec';

  try {
    console.log('Navigating to login...');
    await page.goto('http://localhost:5175/login', { waitUntil: 'domcontentloaded' });
    
    // Check if we need to login
    const isLogin = await page.$('input[placeholder="Ej. 1234"]');
    if (isLogin) {
      console.log('Filling login form...');
      await page.fill('input[placeholder="Ej. 1234"]', '329');
      await page.fill('input[placeholder="••••••••"]', '329');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(4000);
    }

    console.log('Navigating to Admin Cartones UI...');
    await page.goto('http://localhost:5175/dashboard/admin/cartones', { waitUntil: 'domcontentloaded' });
    
    console.log('Waiting for Firebase load...');
    await page.waitForTimeout(8000); // Wait for loading all services from firebase
    await page.screenshot({ path: `${ARTIFACTS_DIR}\\ui_06_admin_cartones_populated.png`, fullPage: true });

    // Check if CONVENCIONAL folder is rendered (it only renders if services match)
    const textContent = await page.textContent('body');
    if (textContent.includes('CONVENCIONAL') || textContent.includes('PISO BAJO')) {
      console.log('✅ UI successfully verified! Cartones folders are loaded and visible.');
    } else {
      console.log('⚠️ Could not verify folders. Ensure database has cartones with temporada=VERANO_2026');
      console.log(textContent.substring(0, 300));
    }

  } catch (err) {
    console.error('Error during Playwright interaction:', err);
  } finally {
    await browser.close();
  }

})();
