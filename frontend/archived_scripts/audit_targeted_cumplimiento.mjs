import { chromium } from 'playwright';
import path from 'path';

const URL_BASE = 'http://localhost:3006';
const OUTPUT_DIR = 'c:\\Users\\Usuario\\Desktop\\SkillRoute clon';

async function run() {
  console.log('Starting targeted compliance audit...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  try {
    await page.goto(`${URL_BASE}/login`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForSelector('input', { timeout: 5000 });
    const inputs = await page.$$('input');
    await inputs[0].fill('329');
    await inputs[1].fill('Skill329');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Red Metropolitana', { timeout: 15000 });
    
    const targetUrl = `${URL_BASE}/dashboard/traffic/cumplimiento`;
    console.log(`Navigating to target URL: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    console.log('Waiting for 25 seconds to allow 7-day aggregations to complete computing...');
    await page.waitForTimeout(25000);
    
    const screenshotPath = path.join(OUTPUT_DIR, 'audit_cumplimiento_extended.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to: ${screenshotPath}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

run();
