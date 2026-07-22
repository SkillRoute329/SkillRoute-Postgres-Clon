import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`PAGE ERROR: ${msg.text()}`);
    } else {
      console.log(`PAGE LOG: ${msg.text()}`);
    }
  });

  page.on('pageerror', error => {
    console.log(`PAGE EXCEPTION: ${error.message}`);
  });

  page.on('requestfailed', request => {
    console.log(`REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`);
  });

  try {
    await page.goto('http://127.0.0.1:3006', { waitUntil: 'networkidle2' });
    console.log('Page loaded successfully');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
  } catch (e) {
    console.error('Error navigating:', e);
  } finally {
    await browser.close();
  }
})();
