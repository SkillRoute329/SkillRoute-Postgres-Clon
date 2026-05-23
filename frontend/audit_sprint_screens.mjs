import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const URL_BASE = 'http://localhost:3006';
const OUTPUT_DIR = 'c:\\Users\\Usuario\\Desktop\\SkillRoute clon';

async function run() {
  console.log('Starting Playwright Sprint verification script...');
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
    await page.waitForSelector('input', { timeout: 5000 });
    const inputs = await page.$$('input');
    await inputs[0].fill('329');
    await inputs[1].fill('Skill329');
    
    console.log('Clicking login button...');
    await page.click('button[type="submit"], button:has-text("Entrar"), button:has-text("Ingresar")');
    
    console.log('Waiting for dashboard to load selectors...');
    await page.waitForSelector('text=Red Metropolitana', { timeout: 15000 });
    console.log('Successfully logged in!');
    await page.waitForTimeout(2000);

    const screens = [
      {
        name: 'Centro de Mando Unificado',
        url: `${URL_BASE}/dashboard/super-admin/centro-mando`,
        filename: 'audit_cmu_v2.png'
      },
      {
        name: 'OTP Dashboard',
        url: `${URL_BASE}/dashboard/traffic/otp`,
        filename: 'audit_otp.png'
      },
      {
        name: 'Cumplimiento por Linea (View)',
        url: `${URL_BASE}/dashboard/traffic/cumplimiento`,
        filename: 'audit_cumplimiento.png'
      },
      {
        name: 'Diagnostico Cumplimiento (Hub)',
        url: `${URL_BASE}/dashboard/traffic/diagnostico-cumplimiento`,
        filename: 'audit_diagnostico_cumplimiento.png'
      }
    ];

    for (const screen of screens) {
      console.log(`Navigating to ${screen.name} (${screen.url})...`);
      await page.goto(screen.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      
      console.log('Waiting 12 seconds for classification analytics to populate...');
      await page.waitForTimeout(12000);
      
      const screenshotPath = path.join(OUTPUT_DIR, screen.filename);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot saved for ${screen.name}: ${screenshotPath}`);
    }

  } catch (error) {
    console.error('An error occurred during the verification script:', error);
  } finally {
    await browser.close();
    console.log('Verification script finished and browser closed.');
  }
}

run();
