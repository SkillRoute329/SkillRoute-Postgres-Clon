import { test, expect } from '@playwright/test';

// Configuration
const BASE_URL = 'http://localhost:5174'; // Or production URL if preferred
const USER_ID = '329';
const PASSWORD = '329';

test.describe('TransformaFacil Validation Suite', () => {
  test('Login and Navigation to Service Matrix', async ({ page }) => {
    // 1. Visit Login
    await page.goto(`${BASE_URL}/login`);

    // 2. Fill Credentials
    await page.fill('input[type="text"]', USER_ID); // Adjust selector if needed
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button:has-text("Ingresar")');

    // 3. Verify Dashboard Load
    await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
    await expect(page.locator('text=Hola,')).toBeVisible();

    // 4. Navigate to Service Matrix
    // Assuming sidebar navigation structure based on Sidebar.tsx
    await page.click('text=Tránsito'); // Open Traffic group
    await page.click('text=Matriz de Servicio');

    // 5. Validation: History Sidebar
    const sidebar = page.locator('div.w-64.bg-slate-900'); // Sidebar class from ServiceMatrix.tsx
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator('text=Historial Cloud')).toBeVisible();

    // 6. Validation: Tab Interface (requires a loaded file or mock)
    // Check if "Subir Local" button exists
    await expect(page.locator('button:has-text("Subir Local (XLSX)")')).toBeVisible();

    console.log('✅ Service Matrix Navigation & Interface Elements Verified');
  });

  test('Inspector Control & Report Generation', async ({ page }) => {
    // 1. Login (re-login or use storage state in real implement)
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="text"]', USER_ID);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button:has-text("Ingresar")');

    await page.waitForURL(`${BASE_URL}/dashboard`);

    // 2. Navigate to Traffic Statistics (where report button is)
    await page.click('text=Tránsito');
    await page.click('text=Estadísticas');

    // 3. Verify Download Button
    const downloadBtn = page.locator('button:has-text("Descargar Reporte")');
    await expect(downloadBtn).toBeVisible();

    // 4. Trigger Download (Optional: verify download event)
    // const downloadPromise = page.waitForEvent('download');
    // await downloadBtn.click();
    // const download = await downloadPromise;
    // console.log(`✅ Download triggered: ${download.suggestedFilename()}`);
  });
});
