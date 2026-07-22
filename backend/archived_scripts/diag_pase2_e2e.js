// End-to-end del pase 2: login en navegador real → verificar TODOS los
// endpoints nuevos contra el contexto autenticado del frontend.
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
    const inputs = await page.$$('input');
    await inputs[0].type('329');
    await inputs[1].type('Skill329');
    const btn = await page.$('button');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
      btn.click(),
    ]);
    await new Promise((r) => setTimeout(r, 4000));

    const result = await page.evaluate(async () => {
      const tok = localStorage.getItem('skillroute_jwt') || '';
      const hdr = { Authorization: `Bearer ${tok}` };
      const hdrJson = { ...hdr, 'Content-Type': 'application/json' };

      async function call(name, init) {
        try {
          const r = await fetch(init.url, { method: init.method || 'GET', headers: init.method === 'GET' || !init.method ? hdr : hdrJson, body: init.body });
          const j = await r.json().catch(() => ({}));
          return { name, status: r.status, summary: init.summarize(j) };
        } catch (e) {
          return { name, status: 'EXC', summary: String(e).slice(0, 80) };
        }
      }

      const tests = [
        { name: '/api/users', url: '/api/users?limit=1', summarize: (j) => `len=${Array.isArray(j) ? j.length : '?'}, sample.id=${j[0]?.id ?? '-'}` },
        { name: '/api/tenants', url: '/api/tenants', summarize: (j) => `total=${j.total}, ids=${(j.data || []).map((t) => t.id).join('/')}` },
        { name: '/api/shifts/balances', url: '/api/shifts/balances', summarize: (j) => `users=${(j.users || []).length}, tomados=${j.globals?.totalTomados}` },
        { name: '/api/shifts/unpaid/329', url: '/api/shifts/unpaid/329', summarize: (j) => `len=${Array.isArray(j) ? j.length : '?'}` },
        { name: '/api/admin/config-salarial', url: '/api/admin/config-salarial', summarize: (j) => `turnos.cat=${Object.keys(j.turnos?.categorias || {}).length}, desc.items=${(j.descuentos?.items || []).length}` },
        { name: '/api/boletin/300', url: '/api/boletin/300', summarize: (j) => `paradas=${j.boletin?.paradas?.length}, pases=${j.boletin?.pases?.length}` },
        { name: '/api/boletin-verano/300', url: '/api/boletin-verano/300', summarize: (j) => `paradas=${j.boletin?.paradas?.length}, pases=${j.boletin?.pases?.length}` },
        { name: '/api/rotacion/2026-05-19', url: '/api/rotacion/2026-05-19', summarize: (j) => `coches=${j.coches?.length}` },
        { name: '/api/inteligencia/300', url: '/api/inteligencia/300', summarize: (j) => `total=${j.buses?.total}, propios=${j.buses?.propios}` },
        { name: '/api/consequencePreview', url: '/api/consequencePreview', method: 'POST', body: JSON.stringify({ evento: { tipo: 'CONDUCTOR_AUSENTE', conductorId: '329', codigoAusencia: 'ausencia_injustificada', duracionHoras: 8, lineaId: '300', kmEsperados: 120 } }), summarize: (j) => `efectos=${j.efectos?.length}, severidad=${j.resumen?.severidadGlobal}, nomina=${j.resumen?.impactoNomina}, subsidio=${j.resumen?.impactoSubsidio}` },
        { name: '/api/cartones/oficiales', url: '/api/cartones/oficiales?limit=1', summarize: (j) => `total=${j.total}, archivo=${(j.meta?.archivo || '').split(/[\\\\\\/]/).pop()}` },
        { name: '/api/admin/personal', url: '/api/admin/personal?limit=1', summarize: (j) => `total=${j.total}` },
        { name: '/api/positions', url: '/api/positions', summarize: (j) => `total=${j.total}, fuente=${j.fuente}` },
        { name: '/api/positions/cutcsa', url: '/api/positions/cutcsa', summarize: (j) => `total=${j.total}` },
        { name: '/api/db/lines', url: '/api/db/lines?limit=1', summarize: (j) => `total_visible=${j.total}` },
        { name: '/api/db/inspections', url: '/api/db/inspections?limit=1', summarize: (j) => `total_visible=${j.total}` },
        { name: '/api/db/fichas_medicas', url: '/api/db/fichas_medicas?limit=1', summarize: (j) => `total_visible=${j.total}` },
        { name: '/api/db/shift_categories', url: '/api/db/shift_categories?limit=1', summarize: (j) => `total_visible=${j.total}` },
        { name: '/api/db/penalty_rules', url: '/api/db/penalty_rules?limit=1', summarize: (j) => `total_visible=${j.total}` },
        { name: '/api/db/scrapping_logs', url: '/api/db/scrapping_logs?limit=1', summarize: (j) => `total_visible=${j.total}` },
        { name: '/api/whatsapp/status', url: '/api/whatsapp/status', summarize: (j) => `status=${j.status}` },
        { name: '/api/admin/seed-personal-ucot', url: '/api/admin/seed-personal-ucot', method: 'POST', body: '{}', summarize: (j) => `already=${j.alreadyLoaded}, count=${j.count}` },
        { name: '/api/data-import/template', url: '/api/data-import/template', summarize: (_j) => 'CSV ok' },
        { name: '/api/listero/turnos?fecha=2026-05-19', url: '/api/listero/turnos?fecha=2026-05-19', summarize: (j) => `turnos=${(j.turnos || []).length}` },
        // Legacy proxy paths (rewrite a /api/historic/*)
        { name: '/historicOtp?days=7&agencyId=70', url: '/historicOtp?days=7&agencyId=70', summarize: (j) => `series=${(j.series || []).length}` },
        { name: '/historicBunching?days=7&agencyId=70', url: '/historicBunching?days=7&agencyId=70', summarize: (j) => `series=${(j.series || []).length}` },
        { name: '/penetrationHistoric', url: '/penetrationHistoric', summarize: (j) => `series=${(j.series || []).length}` },
      ];

      const results = [];
      for (const t of tests) results.push(await call(t.name, t));
      return results;
    });

    console.log('\n═══ END-TO-END PASE 2 (sesión autenticada navegador) ═══\n');
    let ok = 0, fail = 0;
    for (const r of result) {
      const mark = (r.status >= 200 && r.status < 300) ? '✓' : '✗';
      if (r.status >= 200 && r.status < 300) ok++; else fail++;
      console.log(`  ${mark} [${String(r.status).padStart(3)}] ${r.name.padEnd(46)} → ${r.summary}`);
    }
    console.log(`\nTotal: ${ok} OK / ${fail} fail / ${result.length}`);
  } catch (e) {
    console.log('FATAL', String(e).slice(0, 300));
  } finally {
    await browser.close();
  }
})();
