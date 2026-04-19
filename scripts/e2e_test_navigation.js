/**
 * E2E Test Real del Módulo de Navegación UCOT
 * Usa Puppeteer (Chromium propio) para probar en navegador real.
 * 
 * Prueba:
 * 1. ¿La página carga correctamente?
 * 2. ¿Se ven las líneas UCOT en el selector?
 * 3. ¿Al seleccionar línea 17 aparece el mapa con recorrido real?
 * 4. ¿Se puede iniciar un viaje?
 * 5. ¿Funciona el editor de desvíos?
 * 6. ¿Otras líneas (300, 306, 329) también cargan recorridos?
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'test-screenshots');
const BASE_URL = 'http://localhost:3005';
const NAV_URL = `${BASE_URL}/dashboard/traffic/navigation`;

// Crear directorio de screenshots
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let testResults = [];
let browser, page;

function logTest(name, passed, detail = '') {
  const status = passed ? '✅' : '❌';
  console.log(`  ${status} ${name}${detail ? ' — ' + detail : ''}`);
  testResults.push({ name, passed, detail });
}

async function screenshot(name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`  📸 Screenshot: ${filepath}`);
  return filepath;
}

async function waitAndScreenshot(name, waitMs = 3000) {
  await new Promise(r => setTimeout(r, waitMs));
  return await screenshot(name);
}

async function runTests() {
  console.log('═══════════════════════════════════════');
  console.log('  E2E TEST: Navegador UCOT (Puppeteer)');
  console.log('═══════════════════════════════════════\n');

  // ── LANZAR NAVEGADOR ──
  console.log('🚀 Lanzando Chromium...');
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    defaultViewport: { width: 1920, height: 1080 }
  });
  page = await browser.newPage();
  
  // ── TEST 1: CARGAR PÁGINA ──
  console.log('\n── TEST 1: Carga de página ──');
  try {
    const response = await page.goto(NAV_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    logTest('Página carga HTTP 200', response.status() === 200, `HTTP ${response.status()}`);
    await waitAndScreenshot('01_page_load', 5000);
  } catch (e) {
    logTest('Página carga', false, e.message);
    // Intentar con login primero
    try {
      console.log('  ⚠ Intentando acceder directo...');
      await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 15000 });
      await screenshot('01b_home');
    } catch(e2) {
      logTest('Acceso al servidor', false, e2.message);
    }
  }

  // ── TEST 2: VERIFICAR ELEMENTOS UI ──
  console.log('\n── TEST 2: Elementos de la UI ──');
  try {
    // Esperar a que React renderice
    await new Promise(r => setTimeout(r, 5000));
    await screenshot('02_full_ui');
    
    // Verificar que existe el título o header del navegador
    const pageContent = await page.content();
    logTest('Contiene componente de navegación', 
      pageContent.includes('navigation') || pageContent.includes('Navegador') || pageContent.includes('UCOT'),
      'Buscando "navigation/Navegador/UCOT" en DOM');
    
    // Buscar selectores
    const selects = await page.$$('select');
    logTest('Selectores encontrados', selects.length >= 1, `${selects.length} selectores`);
    
    // Buscar botones
    const buttons = await page.$$('button');
    logTest('Botones encontrados', buttons.length >= 1, `${buttons.length} botones`);
    
    // Buscar mapa (div con clase leaflet o similar)
    const mapExists = await page.evaluate(() => {
      return !!(document.querySelector('.leaflet-container') || 
                document.querySelector('[class*="map"]') ||
                document.querySelector('#map'));
    });
    logTest('Mapa Leaflet presente', mapExists);
    
  } catch (e) {
    logTest('Elementos UI', false, e.message);
  }

  // ── TEST 3: SELECTOR DE LÍNEA ──
  console.log('\n── TEST 3: Selector de línea UCOT ──');
  try {
    // Buscar el select de línea
    const lineSelectOptions = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const sel of selects) {
        const options = [...sel.options].map(o => ({ value: o.value, text: o.text }));
        // Buscar el que tiene líneas de bus
        if (options.some(o => o.text.includes('17') || o.value.includes('17'))) {
          return { found: true, options, selectIndex: [...document.querySelectorAll('select')].indexOf(sel) };
        }
      }
      // Si no encontramos por contenido, devolver el primero con más de 3 opciones
      for (const sel of selects) {
        const options = [...sel.options].map(o => ({ value: o.value, text: o.text }));
        if (options.length > 3) {
          return { found: true, options, selectIndex: [...document.querySelectorAll('select')].indexOf(sel) };
        }
      }
      return { found: false, selectCount: selects.length };
    });
    
    if (lineSelectOptions.found) {
      logTest('Selector de líneas encontrado', true, 
        `${lineSelectOptions.options.length} opciones`);
      
      // Listar las opciones
      const lineOptions = lineSelectOptions.options.filter(o => o.value && o.value !== '');
      console.log(`    Líneas disponibles: ${lineOptions.map(o => o.text || o.value).join(', ')}`);
      
      // Verificar que están las líneas UCOT principales
      const expected = ['17', '71', '79', '300', '306', '316', '328', '329', '330', '370', '396'];
      for (const line of expected) {
        const found = lineOptions.some(o => o.value.includes(line) || o.text.includes(line));
        logTest(`Línea ${line} disponible`, found);
      }
      
      // Seleccionar línea 17
      await page.evaluate((idx) => {
        const sel = document.querySelectorAll('select')[idx];
        for (const opt of sel.options) {
          if (opt.value.includes('17') || opt.text.includes('17')) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }, lineSelectOptions.selectIndex);
      
      await waitAndScreenshot('03_linea17_selected', 3000);
      logTest('Línea 17 seleccionada', true);
      
    } else {
      logTest('Selector de líneas encontrado', false, `${lineSelectOptions.selectCount} selects sin líneas`);
    }
  } catch (e) {
    logTest('Selector de línea', false, e.message);
  }

  // ── TEST 4: MAPA CON POLYLINE ──
  console.log('\n── TEST 4: Mapa con recorrido ──');
  try {
    await new Promise(r => setTimeout(r, 3000));
    
    const mapInfo = await page.evaluate(() => {
      const container = document.querySelector('.leaflet-container');
      if (!container) return { hasMap: false };
      
      // Buscar polylines SVG
      const svgPaths = container.querySelectorAll('path');
      const polylines = [...svgPaths].filter(p => {
        const d = p.getAttribute('d');
        return d && d.length > 100; // Una polilínea real tiene un path largo
      });
      
      // Verificar que hay tiles cargados
      const tiles = container.querySelectorAll('.leaflet-tile-loaded');
      
      return {
        hasMap: true,
        polylineCount: polylines.length,
        longestPathLength: polylines.length > 0 ? Math.max(...polylines.map(p => p.getAttribute('d').length)) : 0,
        tilesLoaded: tiles.length,
        mapSize: { w: container.offsetWidth, h: container.offsetHeight }
      };
    });
    
    logTest('Mapa renderizado', mapInfo.hasMap, 
      mapInfo.hasMap ? `${mapInfo.mapSize.w}x${mapInfo.mapSize.h}px` : 'No encontrado');
    logTest('Polyline de ruta visible', mapInfo.polylineCount > 0, 
      `${mapInfo.polylineCount} polilíneas, path más largo: ${mapInfo.longestPathLength} chars`);
    logTest('Tiles del mapa cargados', mapInfo.tilesLoaded > 0, 
      `${mapInfo.tilesLoaded} tiles`);
    
    await screenshot('04_map_with_route');
  } catch (e) {
    logTest('Mapa con recorrido', false, e.message);
  }

  // ── TEST 5: VERIFICAR VARIANTES/DESTINOS ──
  console.log('\n── TEST 5: Selector de variante/destino ──');
  try {
    const variantInfo = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      // El segundo select normalmente es el de variante/recorrido  
      if (selects.length >= 2) {
        const varSelect = selects[1];
        const options = [...varSelect.options].map(o => ({ value: o.value, text: o.text }));
        return { found: true, options, count: options.length };
      }
      return { found: false, selectCount: selects.length };
    });
    
    if (variantInfo.found && variantInfo.count > 1) {
      logTest('Selector de variantes/destinos', true, `${variantInfo.count} opciones`);
      console.log(`    Variantes: ${variantInfo.options.map(o => o.text).join(' | ')}`);
    } else {
      logTest('Selector de variantes/destinos', variantInfo.found, 
        `${variantInfo.count || 0} opciones`);
    }
  } catch (e) {
    logTest('Selector de variantes', false, e.message);
  }

  // ── TEST 6: BOTÓN INICIAR VIAJE ──
  console.log('\n── TEST 6: Iniciar viaje ──');
  try {
    const viajeBtn = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const btn = buttons.find(b => 
        b.textContent.includes('Iniciar') || 
        b.textContent.includes('viaje') ||
        b.textContent.includes('Viaje'));
      if (btn) {
        return { found: true, text: btn.textContent.trim(), disabled: btn.disabled };
      }
      return { found: false, buttonTexts: buttons.map(b => b.textContent.trim()).slice(0, 10) };
    });
    
    if (viajeBtn.found) {
      logTest('Botón Iniciar Viaje encontrado', true, `"${viajeBtn.text}" disabled=${viajeBtn.disabled}`);
      
      if (!viajeBtn.disabled) {
        // Hacer click
        await page.evaluate(() => {
          const buttons = [...document.querySelectorAll('button')];
          const btn = buttons.find(b => 
            b.textContent.includes('Iniciar') && 
            (b.textContent.includes('viaje') || b.textContent.includes('Viaje')));
          if (btn) btn.click();
        });
        await waitAndScreenshot('06_viaje_started', 2000);
        logTest('Click en Iniciar Viaje', true);
      }
    } else {
      logTest('Botón Iniciar Viaje', false, 
        `Botones visibles: ${viajeBtn.buttonTexts?.join(', ')}`);
    }
  } catch (e) {
    logTest('Iniciar viaje', false, e.message);
  }

  // ── TEST 7: EDITOR DE DESVÍOS ──
  console.log('\n── TEST 7: Editor de desvíos ──');
  try {
    const desvioBtn = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const btn = buttons.find(b => 
        b.textContent.includes('desvío') || 
        b.textContent.includes('Desvío') ||
        b.textContent.includes('Reportar') ||
        b.textContent.includes('Agregar'));
      if (btn) {
        return { found: true, text: btn.textContent.trim() };
      }
      return { found: false, buttonTexts: buttons.map(b => b.textContent.trim()) };
    });
    
    if (desvioBtn.found) {
      logTest('Botón de desvío encontrado', true, `"${desvioBtn.text}"`);
      
      // Click para abrir editor
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button')];
        const btn = buttons.find(b => 
          b.textContent.includes('desvío') || b.textContent.includes('Desvío') ||
          b.textContent.includes('Reportar') || b.textContent.includes('Agregar'));
        if (btn) btn.click();
      });
      await waitAndScreenshot('07_desvio_editor', 2000);
      
      // Verificar que se abrió el editor
      const editorVisible = await page.evaluate(() => {
        const text = document.body.textContent;
        return text.includes('Marcar Inicio') || text.includes('temporal') || 
               text.includes('fijo') || text.includes('accidente');
      });
      logTest('Editor de desvío se abrió', editorVisible);
      
    } else {
      logTest('Botón de desvío', false, 
        `Botones: ${desvioBtn.buttonTexts?.join(', ')}`);
    }
  } catch (e) {
    logTest('Editor de desvíos', false, e.message);
  }

  // ── TEST 8: CAMBIAR A OTRAS LÍNEAS ──
  console.log('\n── TEST 8: Otras líneas UCOT ──');
  const testLines = ['300', '306', '329'];
  for (const lineNum of testLines) {
    try {
      await page.evaluate((ln) => {
        const selects = document.querySelectorAll('select');
        for (const sel of selects) {
          for (const opt of sel.options) {
            if (opt.value.includes(ln) || opt.text.includes(ln)) {
              sel.value = opt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
        }
        return false;
      }, lineNum);
      
      await new Promise(r => setTimeout(r, 2000));
      
      const hasPolyline = await page.evaluate(() => {
        const container = document.querySelector('.leaflet-container');
        if (!container) return false;
        const paths = container.querySelectorAll('path');
        return [...paths].some(p => (p.getAttribute('d') || '').length > 100);
      });
      
      logTest(`Línea ${lineNum} muestra recorrido`, hasPolyline);
      await screenshot(`08_linea_${lineNum}`);
    } catch (e) {
      logTest(`Línea ${lineNum}`, false, e.message);
    }
  }

  // ── TEST 9: VERIFICAR COORDENADAS REALES EN EL MAPA ──
  console.log('\n── TEST 9: Coordenadas reales (Montevideo) ──');
  try {
    // Seleccionar línea 17 de nuevo
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const sel of selects) {
        for (const opt of sel.options) {
          if (opt.value.includes('17') || opt.text.includes('17')) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          }
        }
      }
    });
    await new Promise(r => setTimeout(r, 2000));
    
    // Extraer el centro del mapa para verificar que está en Montevideo
    const mapCenter = await page.evaluate(() => {
      // Buscar instancia Leaflet
      const container = document.querySelector('.leaflet-container');
      if (!container || !container._leaflet_id) return null;
      
      // Intentar acceder al mapa Leaflet
      for (const key of Object.keys(window)) {
        if (window[key]?.getCenter && window[key]?._container === container) {
          const center = window[key].getCenter();
          return { lat: center.lat, lng: center.lng };
        }
      }
      return null;
    });
    
    if (mapCenter) {
      const inMontevideo = mapCenter.lat > -35 && mapCenter.lat < -34.7 && 
                           mapCenter.lng > -56.5 && mapCenter.lng < -55.9;
      logTest('Centro del mapa en Montevideo', inMontevideo, 
        `lat=${mapCenter.lat.toFixed(4)} lng=${mapCenter.lng.toFixed(4)}`);
    } else {
      logTest('Centro del mapa accesible', false, 'No se pudo acceder a Leaflet');
    }
    
    await screenshot('09_final_state');
  } catch (e) {
    logTest('Coordenadas reales', false, e.message);
  }

  // ── RESUMEN FINAL ──
  console.log('\n═══════════════════════════════════════');
  const passed = testResults.filter(t => t.passed).length;
  const total = testResults.length;
  const failed = total - passed;
  console.log(`  RESULTADOS: ${passed}/${total} tests pasaron`);
  if (failed > 0) {
    console.log(`  ⚠ ${failed} tests FALLARON:`);
    testResults.filter(t => !t.passed).forEach(t => 
      console.log(`    ❌ ${t.name}: ${t.detail}`));
  } else {
    console.log('  🎉 ¡TODOS LOS TESTS PASARON!');
  }
  console.log('═══════════════════════════════════════');
  console.log(`\n📸 Screenshots guardados en: ${SCREENSHOT_DIR}`);
  
  // Guardar resumen
  const summary = testResults.map(t => `${t.passed ? 'PASS' : 'FAIL'}: ${t.name} ${t.detail}`).join('\n');
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'results.txt'), summary);
  
  await browser.close();
  
  if (failed > 0) process.exit(1);
}

runTests().catch(async (err) => {
  console.error('\n❌ Error fatal:', err.message);
  if (browser) await browser.close();
  process.exit(1);
});
