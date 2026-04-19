const puppeteer = require('puppeteer');

async function scrapeLinea(linea) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  console.log('Navigating to STM...');
  await page.goto('https://www.montevideo.gub.uy/app/stm/horarios/');

  console.log(`Entering linea ${linea}...`);
  // fill "nro_linea"
  await page.type('input[name="nro_linea"]', linea);
  // click search or submit
  await page.click('input[type="submit"], button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  
  // Extract schedule tables
  const result = await page.evaluate(() => {
    return document.documentElement.outerHTML;
  });

  console.log("Got HTML fragment (length):", result.length);
  await browser.close();
}

scrapeLinea('300').catch(console.error);
