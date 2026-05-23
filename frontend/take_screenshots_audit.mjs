import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const URL_BASE = 'http://localhost:3006';
const OUTPUT_DIR = 'c:\\Users\\Usuario\\Desktop\\SkillRoute clon';

async function run() {
  console.log('Starting Playwright audit script...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  try {
    // 1. Go to Login
    console.log(`Navigating to ${URL_BASE}/login...`);
    await page.goto(`${URL_BASE}/login`, { waitUntil: 'networkidle', timeout: 20000 });
    
    console.log('Filling login form...');
    // Fill the internal number and password
    // Try to find the input fields. Usually they are identified by type/placeholder/role
    await page.waitForSelector('input', { timeout: 5000 });
    
    // We can use selectors like input[type="text"], input[type="password"] or by placeholder
    const inputs = await page.$$('input');
    console.log(`Found ${inputs.length} input fields.`);
    
    // Typically the first input is the internal number/email, second is password
    await inputs[0].fill('329');
    await inputs[1].fill('Skill329');
    
    console.log('Clicking login button...');
    // Find the login button and click
    await page.click('button[type="submit"], button:has-text("Entrar"), button:has-text("Ingresar"), button:has-text("Login")');
    
    console.log('Waiting for dashboard to load selectors...');
    await page.waitForSelector('text=Red Metropolitana', { timeout: 15000 });
    console.log('Successfully logged in!');
    
    await page.waitForTimeout(3000); // Cool-down

    const screens = [
      {
        name: 'Centro de Mando Unificado',
        url: `${URL_BASE}/dashboard/super-admin/centro-mando`,
        filename: 'audit_cmu.png'
      },
      {
        name: 'Shadow Radar',
        url: `${URL_BASE}/dashboard/traffic/shadow-radar`,
        filename: 'audit_radar.png'
      },
      {
        name: 'Diagnostico Ejecutivo',
        url: `${URL_BASE}/dashboard/traffic/diagnostico-ejecutivo`,
        filename: 'audit_diagnostico.png'
      }
    ];

    for (const screen of screens) {
      console.log(`Navigating to ${screen.name} (${screen.url})...`);
      // Use 'domcontentloaded' instead of 'networkidle' to prevent hanging on websocket/polling pages
      await page.goto(screen.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      
      console.log('Waiting 12 seconds for data and components to render completely...');
      await page.waitForTimeout(12000);
      
      const screenshotPath = path.join(OUTPUT_DIR, screen.filename);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot saved for ${screen.name}: ${screenshotPath}`);
    }

  } catch (error) {
    console.error('An error occurred during the audit script:', error);
    // Take fallback error screenshot
    try {
      const errorScreenshot = path.join(OUTPUT_DIR, 'audit_error.png');
      await page.screenshot({ path: errorScreenshot });
      console.log(`Saved error fallback screenshot: ${errorScreenshot}`);
    } catch (e) {}
  } finally {
    await browser.close();
    console.log('Audit script finished and browser closed.');
  }
}

run();
