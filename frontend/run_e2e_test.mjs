import { chromium } from 'playwright';

(async () => {
  console.log('Iniciando prueba E2E (UCOT Pilot)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Navegar al home
    console.log('Navegando a http://localhost:3006 ...');
    await page.goto('http://localhost:3006', { waitUntil: 'networkidle' });

    // Esperar a que renderice
    await page.waitForTimeout(2000);

    // 2. Login (vamos a usar un empleado admin de ucot)
    // El seed de DB ya debería tener un user ucot admin si usamos AdminRRHH o ingresamos con pin maestro.
    // Wait, si la BD está vacía, tal vez el login fallback funcione.
    // Probemos con "329" (chofer normal) o un admin.
    console.log('Intentando login como Admin (admin/admin o 329)...');
    
    // Si la pantalla pide internalNumber y password:
    await page.fill('input[placeholder="Ej: 329"]', 'admin');
    await page.fill('input[placeholder="••••••••"]', 'admin');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(3000);
    
    // Tomar screenshot para ver dónde estamos
    await page.screenshot({ path: 'screenshot_after_login.png' });
    console.log('Screenshot guardado en screenshot_after_login.png');

    // 3. Verificamos si estamos en dashboard
    const url = page.url();
    console.log('URL post-login:', url);

  } catch (err) {
    console.error('Error durante E2E:', err);
    await page.screenshot({ path: 'screenshot_error.png' });
  } finally {
    await browser.close();
  }
})();
