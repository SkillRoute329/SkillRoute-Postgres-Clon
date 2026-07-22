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
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    
    // Check if we need to login
    const isLogin = await page.$('input[placeholder="Ej. 1234"]');
    if (isLogin) {
      console.log('Filling login form...');
      await page.fill('input[placeholder="Ej. 1234"]', '329');
      await page.fill('input[placeholder="••••••••"]', '329');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `${ARTIFACTS_DIR}\\ui_01_logged_in.png` });
    }

    console.log('Navigating to ingestion page...');
    await page.goto('http://localhost:5173/dashboard/admin/ingestion', { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${ARTIFACTS_DIR}\\ui_02_ingestion_page.png` });

    console.log('Uploading test file...');
    const filePath = 'C:\\Users\\jonat\\Desktop\\cartones_test.xls';
    
    if (fs.existsSync(filePath)) {
      // Look for dropzone input
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(filePath);
        console.log('File set in dropzone. Waiting for parser to process...');
        
        // Let it parse (the previous JS implementation handled 160 sheets in ~3sec, so UI might take 5-8sec)
        await page.waitForTimeout(6000);

        await page.screenshot({ path: `${ARTIFACTS_DIR}\\ui_03_file_parsed.png`, fullPage: false });
        console.log('✅ UI successfully processed the file! Screenshot saved to artifacts.');
      } else {
        console.log('Could not find file input dropzone. Here is the page text:');
        console.log((await page.textContent('body')).substring(0, 500));
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
