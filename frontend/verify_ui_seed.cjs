const { chromium } = require('@playwright/test');
const fs = require('fs');

(async () => {
  console.log('Starting UI Verification...');
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

    console.log('Navigating to ingestion page...');
    await page.goto('http://localhost:5175/dashboard/admin/ingestion', { waitUntil: 'domcontentloaded' });

    console.log('Uploading test file...');
    const filePath = 'C:\\Users\\jonat\\Desktop\\cartones_test.xls';
    
    if (fs.existsSync(filePath)) {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(filePath);
        console.log('File set in dropzone. Waiting for parser to process...');
        await page.waitForTimeout(10000); // Wait 10s for the parse (163 tabs)

        // Click Sync button (the exact text in UI is 'Sincronizar a Servidor Central')
        const syncButton = await page.$('button:has-text("Servidor Central")');
        if (syncButton) {
           console.log('Clicking Sync Button...');
           await syncButton.click();
           await page.waitForTimeout(10000); // 10s to write batches to firebase
           await page.screenshot({ path: `${ARTIFACTS_DIR}\\ui_04_seeded.png`, fullPage: false });
        } else {
           console.log('Sync button not found. Maybe it finished parsing but button text is different? Dumping HTML snippet:');
           console.log((await page.textContent('body')).substring(0, 300));
        }

        console.log('Navigating to Admin Cartones UI...');
        await page.goto('http://localhost:5175/dashboard/admin/cartones', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(8000); // Wait for loading all services from firebase
        await page.screenshot({ path: `${ARTIFACTS_DIR}\\ui_05_admin_cartones_populated.png`, fullPage: true });

        // Check if CONVENCIONAL folder is rendered (it only renders if services match)
        const textContent = await page.textContent('body');
        if (textContent.includes('CONVENCIONAL') || textContent.includes('PISO BAJO')) {
          console.log('✅ UI successfully processed, seeded, and loaded the file! Cartones folders are verified.');
        } else {
          console.log('⚠️ Could not definitively verify Cartones folders are loaded visually. Check screenshot ui_05.');
        }

      }
    } else {
      console.log('Test file not found.');
    }

  } catch (err) {
    console.error('Error during Playwright interaction:', err);
  } finally {
    await browser.close();
  }

})();
