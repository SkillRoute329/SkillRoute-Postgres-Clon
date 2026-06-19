import { test, expect } from '@playwright/test';

const USUARIO = process.env.TEST_USER || '329';
const PASSWORD = process.env.TEST_PASSWORD || 'Skill329';
const BASE = process.env.BASE_URL || 'http://localhost:3006';

test.describe('E2E Consola de Inteligencia de Red (Market Intelligence)', () => {
  test.beforeEach(async ({ page }) => {
    // Iniciar sesión
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="text"]').fill(USUARIO);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
  });

  test('La consola carga correctamente en la ruta unificada y muestra el mapa Leaflet', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/intelligence`);
    await expect(page).toHaveURL(/traffic\/intelligence/);
    
    // Validar cabecera y estado
    await expect(page.getByText('Market Intelligence Console', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('STM VIVO', { exact: false })).toBeVisible();

    // Validar presencia del contenedor del mapa Leaflet
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15000 });
  });

  test('Las pestañas laterales son clickeables e interactúan de forma correcta', async ({ page }) => {
    await page.goto(`${BASE}/dashboard/traffic/intelligence`);
    await expect(page).toHaveURL(/traffic\/intelligence/);

    // 1. Validar Tab Radar (por defecto cargado)
    await expect(page.getByText('Disputas Activas en Corredores', { exact: false })).toBeVisible({ timeout: 10000 });

    // 2. Click en Tab Matriz DRO y verificar presencia de la tabla y controles
    const tabDro = page.getByRole('button', { name: /Matriz DRO/i });
    await expect(tabDro).toBeVisible();
    await tabDro.click();
    await expect(page.getByText('Direccional Route Overlap (DRO)', { exact: false })).toBeVisible();
    await expect(page.locator('table')).toBeVisible();

    // 3. Click en Tab Simulador Financiero y verificar controles e inputs
    const tabSim = page.getByRole('button', { name: /Simulador/i });
    await expect(tabSim).toBeVisible();
    await tabSim.click();
    await expect(page.getByText('Simulación Operativa y de Ingresos', { exact: false })).toBeVisible();
    await expect(page.getByText('Variación de Frecuencia / Flota:', { exact: false })).toBeVisible();

    // 4. Click en Tab Market Share y verificar gráficos
    const tabMarket = page.getByRole('button', { name: /Market/i });
    await expect(tabMarket).toBeVisible();
    await tabMarket.click();
    await expect(page.getByText('Market Share (Shared km)', { exact: false })).toBeVisible();
    await expect(page.getByText('Resumen Global de Corredores', { exact: false })).toBeVisible();
  });
});
