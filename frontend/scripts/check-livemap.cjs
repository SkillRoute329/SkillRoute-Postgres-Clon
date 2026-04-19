const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`CONSOLE ERROR: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(`PAGE ERROR: ${err.message}`);
  });

  try {
    console.log("Navigating to login...");
    await page.goto('http://localhost:3005/login');
    await page.waitForTimeout(1000);
    
    console.log("Clicking login button...");
    await page.click('button[type="submit"]');
    
    // Wait for the redirect to dashboard
    await page.waitForTimeout(2000);
    
    console.log("Navigating to live-map...");
    await page.goto('http://localhost:3005/dashboard/traffic/live-map');
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'C:\\Users\\jonat\\.gemini\\antigravity\\screenshot-livemap.png' });
    console.log("Screenshot saved.");
  } catch (err) {
    console.error("Script failed:", err);
  } finally {
    if (errors.length > 0) {
      console.log("=== ERRORS DETECTED ===");
      errors.forEach(e => console.log(e));
    } else {
      console.log("=== NO ERRORS DETECTED ===");
    }
    await browser.close();
  }
})();
