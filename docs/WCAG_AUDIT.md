# Guía de Accesibilidad Web y Auditoría — WCAG 2.2 Nivel AA

Este documento sirve como base de auditoría y guía de implementación para garantizar que las interfaces visuales de **SkillRoute** cumplan con las **Pautas de Accesibilidad para el Contenido Web (WCAG) versión 2.2 en su nivel AA**.

---

## 1. Principios de Accesibilidad WCAG en SkillRoute

La interfaz de usuario del dashboard ejecutivo, listería y monitoreo se audita bajo los 4 principios fundamentales:

### I. Perceptible (Perceivable)
* **Contraste de Color**: Todo el texto visible en pantalla debe mantener una relación de contraste mínima de **4.5:1** para texto normal y **3:1** para texto grande contra su fondo, cumpliendo la pauta *WCAG 1.4.3*. Esto se fuerza en el frontend a través del uso de la paleta de colores oscuros optimizada (`bg-slate-950`, `text-slate-100`).
* **Imágenes con Texto Alternativo**: Todo elemento gráfico o imagen (como el logo corporativo de UCOT) debe incluir el atributo `alt="..."` descriptivo.

### II. Operable (Operable)
* **Accesibilidad por Teclado**: Cualquier botón, pestaña, input o modal debe ser operable en su totalidad utilizando únicamente el teclado (teclas `Tab`, `Shift+Tab`, `Enter` y `Space`).
* **Indicador de Enfoque (Focus Ring)**: Se prohibe remover el borde de enfoque del navegador (`outline: none`) sin proveer un reemplazo visible y accesible. Usamos anillos de enfoque consistentes en Tailwind (`focus:ring-2 focus:ring-primary-500 focus:outline-none`).
* **Navegación Eficiente**: Uso de elementos semánticos de sección (`<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`) para permitir a los lectores de pantalla saltar bloques repetitivos de menú.

### III. Comprensible (Understandable)
* **Idioma de la Página**: El atributo principal de idioma debe ser configurado correctamente en el archivo index.html (`<html lang="es">`).
* **Consistencia del Menú**: El menú de navegación lateral (`Sidebar.tsx`) y la cabecera mantienen la misma estructura lógica a lo largo de toda la experiencia del usuario.

### IV. Robustez (Robust)
* **Código HTML Semántico y Válido**: Evitar el uso incorrecto de IDs duplicados o etiquetas mal cerradas que impidan a los navegadores o asistentes de voz parsear la página adecuadamente.

---

## 2. Herramientas de Validación y Comando de Auditoría

Para verificar y auditar el estado del cumplimiento de accesibilidad de SkillRoute en desarrollo y producción:

### A. Auditoría con Lighthouse (Chrome DevTools)
1. Abrir la consola de desarrollador en Chrome (`F12`).
2. Ir a la pestaña **Lighthouse**.
3. Seleccionar únicamente la categoría **Accessibility**.
4. Generar reporte.
5. **Criterio de Aceptación**: El score debe mantenerse en **> 95/100** para todas las páginas públicas e internas.

### B. Análisis con `axe-core` / Playwright Accessibility
Podemos automatizar pruebas de accesibilidad integrando `@axe-core/playwright` en la suite de E2E.
Ejemplo de test automatizado:
```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Verificar accesibilidad de la página de Login', async ({ page }) => {
  await page.goto('/login');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

---

## 3. Correcciones Comunes y Buenas Prácticas

Al diseñar o modificar componentes visuales en el frontend de SkillRoute:
1. **Inputs sin Label**: Siempre asociar un `<label>` al input utilizando el atributo `htmlFor` del label y el `id` del input. Si visualmente no se requiere etiqueta, usar la propiedad `aria-label`.
2. **Botones de Iconos**: Botones que solo contienen un ícono de Lucide (ej. un botón de cerrar con una cruz `X`) deben incluir el atributo `aria-label="Cerrar panel"` o similar.
3. **Tablas de Datos**: Asegurar que las cabeceras de tabla utilicen la etiqueta `<th>` con su correspondiente atributo `scope="col"` o `scope="row"` para que los lectores puedan orientar el contexto de la celda al usuario invidente.
