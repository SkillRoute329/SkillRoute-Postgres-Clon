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
const PASSWORD = 'admin123';

test.describe('Pruebas de usuario real - TransformaFacil 2.0', () => {
  test('Usuario entra a la raíz y es redirigido al login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /TransformaFacil 2.0/i })).toBeVisible();
    await expect(page.getByPlaceholder(/usuario|número interno/i)).toBeVisible();
    await expect(page.getByPlaceholder(/contraseña/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Ingresar/i })).toBeVisible();
  });

  test('Usuario inicia sesión y llega al dashboard', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder(/usuario|número interno/i).fill(USUARIO);
    await page.getByPlaceholder(/contraseña/i).fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
    await expect(page.getByRole('heading', { level: 3, name: /Estado del sistema/ })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/Hola,/)).toBeVisible();
    await expect(page.getByText(/SuperAdministrador|SuperAdmin/)).toBeVisible();
  });

  test('Usuario ve estado de la API en el dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/usuario|número interno/i).fill(USUARIO);
    await page.getByPlaceholder(/contraseña/i).fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 3, name: /Estado del sistema/ })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/API:/)).toBeVisible();
    await expect(page.getByText(/Conectada|Comprobando|Sin conexión/)).toBeVisible();
  });

  test('Usuario cierra sesión y vuelve al login', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/usuario|número interno/i).fill(USUARIO);
    await page.getByPlaceholder(/contraseña/i).fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 3, name: /Estado del sistema/ })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: /Cerrar sesión/i }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: /TransformaFacil 2.0/i })).toBeVisible();
  });

  test('Usuario sin sesión que intenta ir al dashboard es redirigido a login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Usuario ve el menú del dashboard (Dashboard, Tránsito, Admin)', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/usuario|número interno/i).fill(USUARIO);
    await page.getByPlaceholder(/contraseña/i).fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 3, name: /Estado del sistema/ })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Dashboard')).toBeVisible();
    await expect(page.getByText('Tránsito')).toBeVisible();
    await expect(page.getByText('Admin')).toBeVisible();
  });
});
