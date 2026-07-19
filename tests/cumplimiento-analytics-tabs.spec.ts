import { test, expect } from '@playwright/test';

const USUARIO = process.env.TEST_USER || '329';
const PASSWORD = process.env.TEST_PASSWORD || 'Skill329';
const BASE = process.env.BASE_URL || 'http://localhost:3006';

test.describe('E2E Cumplimiento Analytics Tabs', () => {
  test.beforeEach(async ({ page }) => {
    // Iniciar sesión
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="text"]').fill(USUARIO);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
  });

  test('Carga el Hub de Cumplimiento y permite navegar a Tiempos de Viaje y Tiempos de Parada', async ({ page }) => {
    // Ir a la ruta del Hub de Cumplimiento
    await page.goto(`${BASE}/dashboard/traffic/diagnostico-cumplimiento`);
    await expect(page).toHaveURL(/traffic\/diagnostico-cumplimiento/);

    // 1. Click en la tab superior "Análisis Integral de Servicio"
    await page.getByRole('button', { name: /Análisis Integral de Servicio/i }).click();

    // 2. Validar que las secciones están visibles en el layout vertical (ya no hay sub-pestañas)
    await expect(page.getByText('Tiempos de Viaje (Run Times)', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Sentido', { exact: true }).first()).toBeVisible();
    
    // 3. Validar presencia de la sección de Paradas
    await expect(page.getByText('Tiempos en Parada (Dwell Times)', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder('Buscar parada por nombre...')).toBeVisible();
  });
});
