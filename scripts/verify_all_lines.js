/**
 * Verificación exhaustiva de TODAS las líneas UCOT:
 * - Carga de cada línea y sus variantes
 * - Verificación de que cada variante tiene coordenadas únicas (diferente recorrido)
 * - Verificación del botón de desvíos
 * - Verificación del modal DesvioEditor
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3005';
const NAV_URL = `${BASE_URL}/dashboard/traffic/navigation`;
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'test-verify-lines');

if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
    defaultViewport: { width: 1400, height: 900 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  
  // Suppress console noise
  page.on('console', () => {});
  page.on('pageerror', () => {});

  const results = {
    totalLines: 0,
    totalVariants: 0,
    linesWithRoutes: 0,
    linesWithStops: 0,
    uniqueRoutes: 0,
    desvioButtonFound: false,
    desvioEditorWorks: false,
    lineDetails: [],
    errors: [],
  };

  try {
    console.log('=== VERIFICACIÓN EXHAUSTIVA DE LÍNEAS UCOT ===\n');

    // 1. Navigate and wait for load
    console.log('1. Navegando al módulo...');
    await page.goto(NAV_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(5000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_initial_load.png'), fullPage: false });

    // 2. Get all available options from the "Recorrido" select
    console.log('2. Obteniendo todas las opciones de recorrido...');
    const recorridoOptions = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      let recorridoSelect = null;
      for (const s of selects) {
        const label = s.getAttribute('aria-label') || '';
        if (label.includes('recorrido') || label.includes('Recorrido')) {
          recorridoSelect = s;
          break;
        }
      }
      if (!recorridoSelect) {
        // Fallback: the last select is usually the recorrido
        recorridoSelect = selects[selects.length - 1];
      }
      if (!recorridoSelect) return [];
      return Array.from(recorridoSelect.options).map(o => ({
        value: o.value,
        text: o.textContent.trim()
      }));
    });

    console.log(`   Encontradas ${recorridoOptions.length} variantes de recorrido:`);
    recorridoOptions.forEach(o => console.log(`     - ${o.value}: ${o.text}`));
    results.totalVariants = recorridoOptions.length;

    // Count unique line numbers
    const uniqueLines = new Set();
    recorridoOptions.forEach(o => {
      const match = o.value.match(/^(\d+)/);
      if (match) uniqueLines.add(match[1]);
    });
    results.totalLines = uniqueLines.size;
    console.log(`   = ${uniqueLines.size} líneas únicas\n`);

    // 3. Check desvío button BEFORE starting any trip
    console.log('3. Verificando botón de desvío...');
    const desvioBtn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => 
        b.textContent.toLowerCase().includes('agregar') && b.textContent.toLowerCase().includes('desv')
      );
      return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
    });
    
    if (desvioBtn) {
      console.log(`   ✅ Botón encontrado: "${desvioBtn.text}" (disabled: ${desvioBtn.disabled})`);
      results.desvioButtonFound = true;
    } else {
      console.log('   ❌ Botón de desvío NO encontrado');
    }

    // 4. Click desvío button and verify modal
    if (desvioBtn && !desvioBtn.disabled) {
      console.log('4. Verificando DesvioEditor...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => 
          b.textContent.toLowerCase().includes('agregar') && b.textContent.toLowerCase().includes('desv')
        );
        if (btn) btn.click();
      });
      await sleep(1000);

      const modalContent = await page.evaluate(() => {
        // Check for modal overlay
        const modal = document.querySelector('[class*="fixed"][class*="inset"]');
        if (!modal) return null;

        const title = modal.querySelector('h3')?.textContent?.trim() || '';
        const buttons = Array.from(modal.querySelectorAll('button')).map(b => b.textContent.trim());
        const labels = Array.from(modal.querySelectorAll('label')).map(l => l.textContent.trim());
        const selects = Array.from(modal.querySelectorAll('select')).map(s => ({
          options: Array.from(s.options).map(o => o.textContent.trim())
        }));
        const textareas = modal.querySelectorAll('textarea').length;
        const inputs = modal.querySelectorAll('input[type="text"]').length;
        
        return { title, buttons, labels, selects, textareas, inputs };
      });

      if (modalContent) {
        console.log(`   ✅ Modal DesvioEditor abierto:`);
        console.log(`      Título: "${modalContent.title}"`);
        console.log(`      Labels: ${modalContent.labels.join(', ')}`);
        console.log(`      Selects: ${JSON.stringify(modalContent.selects)}`);
        console.log(`      Botones: ${modalContent.buttons.join(', ')}`);
        results.desvioEditorWorks = true;
        
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_desvio_editor.png'), fullPage: false });

        // Close modal
        await page.evaluate(() => {
          const closeBtn = document.querySelector('[aria-label="Cerrar"]');
          if (closeBtn) closeBtn.click();
        });
        await sleep(500);
      } else {
        console.log('   ❌ Modal de desvío NO apareció');
      }
    }

    // 5. Iterate through EACH line variant and verify it has a route
    console.log('\n5. Verificando cada variante de recorrido...\n');
    const routeHashes = new Map(); // to detect duplicate routes

    for (let i = 0; i < recorridoOptions.length; i++) {
      const opt = recorridoOptions[i];
      process.stdout.write(`   [${i + 1}/${recorridoOptions.length}] ${opt.value} (${opt.text.substring(0, 50)})... `);

      // Change the recorrido select
      await page.evaluate((val) => {
        const selects = document.querySelectorAll('select');
        let recorridoSelect = null;
        for (const s of selects) {
          const label = s.getAttribute('aria-label') || '';
          if (label.includes('recorrido') || label.includes('Recorrido')) {
            recorridoSelect = s;
            break;
          }
        }
        if (!recorridoSelect) recorridoSelect = selects[selects.length - 1];
        if (recorridoSelect) {
          recorridoSelect.value = val;
          recorridoSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, opt.value);

      await sleep(3000); // Wait for data to load

      // Check if route polyline exists and get paradas
      const lineInfo = await page.evaluate(() => {
        // Check for paradas in sidebar
        const paradasHeader = document.querySelector('[class*="text-slate-500"]');
        const paradasCount = paradasHeader?.textContent?.match(/(\d+)\s*parada/)?.[1] || '0';
        
        // Get parada names
        const paradasElements = document.querySelectorAll('[class*="overflow-auto"] [class*="rounded"]');
        const paradas = Array.from(paradasElements).slice(0, 5).map(el => {
          const name = el.querySelector('[class*="text-slate-200"], [class*="text-white"]');
          return name?.textContent?.trim() || el.textContent?.trim().substring(0, 40);
        }).filter(Boolean);

        // Check for SVG paths in the map (polylines rendered by Leaflet)
        const svgPaths = document.querySelectorAll('.leaflet-overlay-pane svg path, .leaflet-overlay-pane path');
        const hasRoute = svgPaths.length > 0;

        // Get first path's d attribute to compare routes
        let routeHash = '';
        if (svgPaths.length > 0) {
          const d = svgPaths[0].getAttribute('d') || '';
          routeHash = d.substring(0, 100); // First 100 chars as a hash
        }

        // Check for "Sin coordenadas" message
        const noCoords = document.body.textContent.includes('Sin coordenadas');

        return {
          paradasCount: parseInt(paradasCount) || 0,
          paradas,
          hasRoute,
          routeHash,
          noCoords,
        };
      });

      const detail = {
        code: opt.value,
        name: opt.text,
        paradas: lineInfo.paradasCount,
        hasRoute: lineInfo.hasRoute,
        firstParadas: lineInfo.paradas,
        unique: true,
      };

      // Check uniqueness
      if (lineInfo.routeHash && routeHashes.has(lineInfo.routeHash)) {
        detail.unique = false;
        detail.duplicateOf = routeHashes.get(lineInfo.routeHash);
      } else if (lineInfo.routeHash) {
        routeHashes.set(lineInfo.routeHash, opt.value);
      }

      if (lineInfo.hasRoute) results.linesWithRoutes++;
      if (lineInfo.paradasCount > 0) results.linesWithStops++;
      if (detail.unique && lineInfo.hasRoute) results.uniqueRoutes++;

      results.lineDetails.push(detail);

      // Status emoji
      const routeIcon = lineInfo.hasRoute ? '✅' : '❌';
      const stopsIcon = lineInfo.paradasCount > 0 ? `📍${lineInfo.paradasCount}` : '⚠️0';
      const uniqueIcon = detail.unique ? '' : `🔁=${detail.duplicateOf}`;
      console.log(`${routeIcon} ruta ${stopsIcon} paradas ${uniqueIcon}`);

      // Take screenshot for a few key lines
      if (['17a', '17b', '300a', '300b', '329a', '329b', 'cc1a', 'cc1b'].includes(opt.value)) {
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `line_${opt.value}.png`),
          fullPage: false
        });
      }
    }

    // 6. Test "Iniciar Viaje GPS" button
    console.log('\n6. Verificando botón Iniciar Viaje GPS...');
    // Go back to line 17a
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      let recorridoSelect = null;
      for (const s of selects) {
        const label = s.getAttribute('aria-label') || '';
        if (label.includes('recorrido') || label.includes('Recorrido')) {
          recorridoSelect = s;
          break;
        }
      }
      if (!recorridoSelect) recorridoSelect = selects[selects.length - 1];
      if (recorridoSelect && recorridoSelect.options.length > 0) {
        recorridoSelect.value = recorridoSelect.options[0].value;
        recorridoSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(2000);
    
    const iniciarBtn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent.includes('Iniciar Viaje'));
      return btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null;
    });

    if (iniciarBtn) {
      console.log(`   ✅ Botón encontrado: "${iniciarBtn.text}" (disabled: ${iniciarBtn.disabled})`);
      
      // Click it
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes('Iniciar Viaje'));
        if (btn) btn.click();
      });
      await sleep(2000);

      // Verify trip is active
      const tripActive = await page.evaluate(() => {
        return document.body.textContent.includes('Viaje en curso') || 
               document.body.textContent.includes('Viaje activo');
      });

      console.log(`   ${tripActive ? '✅' : '❌'} Viaje activo: ${tripActive}`);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_viaje_activo.png'), fullPage: false });

      // Verify "Finalizar Viaje" button exists
      const finalizarBtn = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(b => b.textContent.includes('Finalizar Viaje'));
      });
      console.log(`   ${finalizarBtn ? '✅' : '❌'} Botón Finalizar Viaje presente: ${finalizarBtn}`);

      // Stop trip
      if (finalizarBtn) {
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(b => b.textContent.includes('Finalizar Viaje'));
          if (btn) btn.click();
        });
        await sleep(1000);
      }
    } else {
      console.log('   ❌ Botón Iniciar Viaje no encontrado');
    }

  } catch (err) {
    results.errors.push(err.message);
    console.error('ERROR:', err.message);
  }

  await browser.close();

  // Final Report
  console.log('\n' + '='.repeat(60));
  console.log('         REPORTE FINAL DE VERIFICACIÓN');
  console.log('='.repeat(60));
  console.log(`  Líneas únicas:            ${results.totalLines}`);
  console.log(`  Variantes totales:        ${results.totalVariants}`);
  console.log(`  Variantes con ruta:       ${results.linesWithRoutes}/${results.totalVariants}`);
  console.log(`  Variantes con paradas:    ${results.linesWithStops}/${results.totalVariants}`);
  console.log(`  Rutas únicas (no dup.):   ${results.uniqueRoutes}`);
  console.log(`  Botón desvío:             ${results.desvioButtonFound ? '✅' : '❌'}`);
  console.log(`  DesvioEditor funcional:   ${results.desvioEditorWorks ? '✅' : '❌'}`);
  console.log(`  Errores:                  ${results.errors.length}`);
  console.log('='.repeat(60));

  // Show any lines WITHOUT routes
  const noRouteLines = results.lineDetails.filter(d => !d.hasRoute);
  if (noRouteLines.length > 0) {
    console.log('\n  ⚠️ Variantes SIN ruta renderizada:');
    noRouteLines.forEach(d => console.log(`     - ${d.code}: ${d.name.substring(0, 60)}`));
  }

  // Show duplicate routes  
  const dupLines = results.lineDetails.filter(d => !d.unique);
  if (dupLines.length > 0) {
    console.log('\n  🔁 Variantes con ruta DUPLICADA:');
    dupLines.forEach(d => console.log(`     - ${d.code} = misma ruta que ${d.duplicateOf}`));
  }

  // Overall verdict
  const pctRoute = results.totalVariants > 0 ? Math.round(results.linesWithRoutes / results.totalVariants * 100) : 0;
  const pctStops = results.totalVariants > 0 ? Math.round(results.linesWithStops / results.totalVariants * 100) : 0;
  
  console.log(`\n  📊 Cobertura de rutas: ${pctRoute}%`);
  console.log(`  📊 Cobertura de paradas: ${pctStops}%`);
  
  if (pctRoute >= 80 && results.desvioButtonFound && results.desvioEditorWorks) {
    console.log('\n  ✅✅✅ MÓDULO DE NAVEGACIÓN: APROBADO ✅✅✅');
  } else {
    console.log('\n  ⚠️ MÓDULO NECESITA MEJORAS');
  }

  // Save detailed report
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'verification_report.json'),
    JSON.stringify(results, null, 2)
  );
  console.log(`\n  Reporte guardado en: ${SCREENSHOTS_DIR}/verification_report.json`);
  console.log(`  Screenshots guardados en: ${SCREENSHOTS_DIR}/\n`);
})();
