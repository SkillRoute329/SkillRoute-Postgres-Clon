import { test, expect } from '@playwright/test';

test('Generate Presentation Screenshots', async ({ page }) => {
  // 1. Configuración de Viewport para alta calidad
  await page.setViewportSize({ width: 1366, height: 768 });

  // 2. Login Screen (Usando puerto 3000 Local para velocidad)
  console.log('📸 Navegando al Login...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'presentation_assets/1_Portada_Login.png' });

  // 3. Bypass a Dashboard (Método Programático - Más seguro que clicks)
  console.log('🚀 Entrando a Simulación...');
  await page.evaluate(() => {
    sessionStorage.setItem('TRANSFORMA_SIMULATION_MODE', 'true');
    window.location.href = '/dashboard/traffic/service-matrix';
  });

  // Esperar a que cargue el dashboard
  await page.waitForTimeout(3000); // Dar tiempo a animaciones y datos falsos
  await page.screenshot({ path: 'presentation_assets/2_Matriz_Operativa.png' });

  // 4. Panel de Flota (Fleet)
  console.log('🚌 Navegando a Flota...');
  await page.goto('http://localhost:3000/dashboard/fleet/vehicles', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'presentation_assets/3_Estado_Flota.png' });

  // 5. Módulo de RRHH/Mi Espacio
  console.log('👤 Navegando a Mi Espacio...');
  await page.goto('http://localhost:3000/dashboard/my-shifts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'presentation_assets/4_Portal_Conductor.png' });

  console.log('✅ Capturas listas en /presentation_assets');
});
