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

    // 1. Validar y navegar a la pestaña "Tiempos de Viaje"
    const runTimesTabBtn = page.getByRole('button', { name: /Tiempos de Viaje/i });
    await expect(runTimesTabBtn).toBeVisible({ timeout: 15000 });
    await runTimesTabBtn.click();

    // Validar título y presencia de filtros en la pestaña
    await expect(page.getByRole('heading', { name: 'Análisis de Tiempos de Viaje (Run Times)' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Sentido', { exact: true })).toBeVisible();
    await expect(page.getByText('Rango de Días', { exact: true })).toBeVisible();

    // 2. Validar y navegar a la pestaña "Tiempos de Parada"
    const stopDwellTabBtn = page.getByRole('button', { name: /Tiempos de Parada/i });
    await expect(stopDwellTabBtn).toBeVisible({ timeout: 15000 });
    await stopDwellTabBtn.click();

    // Validar título y presencia de filtros y controles
    await expect(page.getByRole('heading', { name: 'Tiempos de Detención en Paradas (Stop Dwell Times)' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder('Buscar parada por nombre...')).toBeVisible();
    await expect(page.getByText('Dwell Medio', { exact: true })).toBeVisible();
  });
});
