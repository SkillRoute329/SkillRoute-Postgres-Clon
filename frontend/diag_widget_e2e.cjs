// E2E del widget: visita el dashboard autenticado, escucha el socket y
// verifica que el widget muestra eventos del auto-trigger después de unos
// minutos (o los del feed cargado al montar).
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  try {
    await page.goto('http://127.0.0.1:3006/login', { waitUntil: 'networkidle2', timeout: 60000 });
    const tok = await page.evaluate(async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalNumber: '329', password: 'Skill329' }),
      });
      const j = await r.json();
      const t = j.data?.token || j.token || '';
      if (t) {
        localStorage.setItem('skillroute_jwt', t);
        localStorage.setItem('token', t);
      }
      return t.length;
    });
    console.log('Login OK · token len=' + tok);

    await page.goto('http://127.0.0.1:3006/dashboard', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 5000));

    // Después de montar y hidratar, verificar contadores del widget
    const stats = await page.evaluate(() => {
      const pill = document.querySelector('[title*="Propagaci"]');
      const text = document.body.innerText.match(/Propagaci[óo]n\s*\d+/g);
      return {
        widgetPresente: !!pill,
        textoEnPantalla: text ? text.slice(0, 3) : [],
        bodyLen: document.body.innerText.length,
      };
    });
    console.log('\nWidget presente:', stats.widgetPresente);
    console.log('Pildoras en pantalla:', JSON.stringify(stats.textoEnPantalla));
    console.log('Body len:', stats.bodyLen);

    // Forzar abrir el widget y leer contenido
    const abierto = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) =>
        b.getAttribute('title')?.includes('Propagaci'),
      );
      if (btn) {
        (btn).click();
        return true;
      }
      return false;
    });
    if (abierto) {
      await new Promise((r) => setTimeout(r, 1000));
      const eventos = await page.evaluate(() => {
        // Buscar el panel expandido y enumerar items
        const items = Array.from(document.querySelectorAll('li')).filter((li) =>
          li.className?.includes('border-l-2'),
        );
        return items.slice(0, 5).map((li) => li.innerText.replace(/\s+/g, ' ').slice(0, 100));
      });
      console.log('\nEventos visibles en widget (' + eventos.length + ' top):');
      eventos.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    } else {
      console.log('No se encontró botón del widget');
    }
  } catch (e) {
    console.log('FATAL', String(e).slice(0, 200));
  } finally {
    await browser.close();
  }
})();
