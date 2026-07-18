import { chromium } from 'playwright';

const TESTS = [
  { name: 'UCOT', id: '329', pass: 'Skill329' },
  { name: 'CUTCSA', id: '500', pass: 'SkillUser!' },
  { name: 'IMM Regulador', id: '999', pass: 'SkillUser!' }
];

(async () => {
  console.log('Iniciando prueba E2E Multi-Tenant (UCOT, CUTCSA, IMM)...');
  const browser = await chromium.launch({ headless: true });
  
  try {
    for (const testUser of TESTS) {
      console.log(`\n=== Testeando Login: ${testUser.name} ===`);
      
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        console.log('Navegando a http://localhost:3006/login ...');
        await page.goto('http://localhost:3006/login', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        console.log(`Ingresando credenciales de ${testUser.name}...`);
        await page.fill('input[placeholder="Ej: 329"]', testUser.id);
        await page.fill('input[placeholder="••••••••"]', testUser.pass);
        await page.click('button[type="submit"]');

        await page.waitForTimeout(3000);
        
        const url = page.url();
        console.log(`URL post-login para ${testUser.name}: ${url}`);
        
        const screenshotName = `screenshot_after_login_${testUser.name.replace(' ', '_')}.png`;
        await page.screenshot({ path: screenshotName });
        console.log(`Screenshot guardado: ${screenshotName}`);

      } catch (e) {
        console.error(`Error durante test de ${testUser.name}:`, e);
      } finally {
        await context.close();
      }
    }
  } catch (err) {
    console.error('Error global durante E2E:', err);
  } finally {
    await browser.close();
    console.log('\nPruebas E2E completadas.');
  }
})();
