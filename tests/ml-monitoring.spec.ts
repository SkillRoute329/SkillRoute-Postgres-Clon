import { test, expect } from '@playwright/test';

const USUARIO = '329';
const PASSWORD = 'Skill329';

test.describe('Pruebas de Monitoreo ML - TransformaFacil 2.0', () => {
  test('Usuario administrador inicia sesión y navega a Monitoreo ML', async ({ page }) => {
    // 1. Ir a login
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="text"]').fill(USUARIO);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    // 2. Esperar llegar al dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });

    // 3. Hacer clic en "Monitoreo ML" en la barra lateral
    const menuLink = page.getByRole('link', { name: /Monitoreo ML/i });
    await expect(menuLink).toBeVisible();
    await menuLink.click();

    // 4. Verificar redirección a la página de monitoreo
    await expect(page).toHaveURL(/\/dashboard\/admin\/ml-monitoring/);

    // 5. Verificar elementos clave en la página
    await expect(page.getByRole('heading', { name: /Monitoreo de ETA Predictivo/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Re-entrenar Modelo/i })).toBeVisible();

    // 6. Verificar las tarjetas de KPIs
    await expect(page.getByText(/Error Absoluto Medio/i)).toBeVisible();
    await expect(page.getByText(/Ajuste R²/i)).toBeVisible();
    await expect(page.getByText(/Deriva de Datos \(Drift\)/i)).toBeVisible();
    
    // 7. Verificar gráficos
    await expect(page.getByText(/Evolución del Error/i)).toBeVisible();
    await expect(page.getByText(/Volumen Histórico/i)).toBeVisible();
  });
});
