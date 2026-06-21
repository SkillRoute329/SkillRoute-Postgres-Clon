import { test, expect } from '@playwright/test';

const USUARIO = '329';
const PASSWORD = 'Skill329';

test.describe('Pruebas de Editor de Red (Remix Moat) - TransformaFacil 2.0', () => {
  test('Usuario inicia sesión y navega al Editor de Red', async ({ page }) => {
    // 1. Ir a login
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="text"]').fill(USUARIO);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Ingresar/i }).click();

    // 2. Esperar llegar al dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });

    // 3. Hacer clic en "Editor de Red (Remix)" en la barra lateral
    const menuLink = page.getByRole('link', { name: /Editor de Red/i });
    await expect(menuLink).toBeVisible();
    await menuLink.click();

    // 4. Verificar redirección a la página del editor de red
    await expect(page).toHaveURL(/\/dashboard\/traffic\/network-editor/);

    // 5. Verificar elementos del encabezado y botones globales
    await expect(page.getByRole('heading', { name: /Planificación y Editor de Red/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Importar GTFS/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Exportar GTFS/i })).toBeVisible();

    // 6. Verificar selectores y parámetros en el panel izquierdo
    await expect(page.getByText(/Línea de Operación/i)).toBeVisible();
    await expect(page.getByText(/Parámetros Operativos/i)).toBeVisible();
    await expect(page.getByText(/Secuencia de Paradas/i)).toBeVisible();

    // 7. Verificar el conmutador de capas del censo
    await expect(page.getByText(/Capas del Censo:/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Población/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ingresos/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Edad Media/i })).toBeVisible();

    // 8. Verificar métricas financieras en el panel derecho
    await expect(page.getByText(/Impacto Financiero/i)).toBeVisible();
    await expect(page.getByText(/ROI Estimado/i)).toBeVisible();

    // 9. Verificar métricas de equidad y semáforo de impacto
    await expect(page.getByRole('heading', { name: /Equidad Territorial Latam/i })).toBeVisible();
    await expect(page.getByText(/Evaluación de Impacto \(Title VI\)/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Descargar Reporte PDF/i })).toBeVisible();
  });
});
