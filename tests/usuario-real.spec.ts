import { test, expect } from '@playwright/test';

/**
 * Pruebas de usuario real: flujos que un usuario ejecuta al usar la app.
 * Base URL: http://localhost:5173 (ver playwright.config.ts)
 *
 * Para que pasen todas las pruebas (incluido login y dashboard):
 * 1. Arranca la app: npm start (en otra terminal o antes).
 * 2. Ejecuta: npm run test:e2e
 * Si solo está el frontend, pasan las 2 pruebas que no requieren login.
 */

const USUARIO = '329';
const PASSWORD = 'Skill329';

test.describe('Pruebas de usuario real - TransformaFacil 2.0', () => {
  test('Usuario entra a la raíz y es redirigido al login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /SkillRoute/i })).toBeVisible();
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Ingresar/i })).toBeVisible();
  });

  test('Usuario inicia sesión y llega al dashboard', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="text"]').fill(USUARIO);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
    await expect(page.getByRole('heading', { level: 1, name: /Hola,/ })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/Hola,/)).toBeVisible();
    await expect(page.getByText(/SuperAdministrador|SuperAdmin/i).first()).toBeVisible();
  });

  test('Usuario ve estado de la API en el dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"]').fill(USUARIO);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: /Hola,/ })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: /EN LÍNEA|LENTO|OFFLINE/i })).toBeVisible();
  });

  test('Usuario cierra sesión y vuelve al login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"]').fill(USUARIO);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: /Hola,/ })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: /Cerrar sesión/i }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /SkillRoute/i })).toBeVisible();
  });

  test('Usuario sin sesión que intenta ir al dashboard es redirigido a login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Usuario ve el menú del dashboard (Dashboard, Tránsito, Admin)', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"]').fill(USUARIO);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: /Hola,/ })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Centro de Mando')).toBeVisible();
    await expect(page.getByText('Servicios en Vía')).toBeVisible();
    await expect(page.getByText('Gestión de Flota')).toBeVisible();
  });
});
