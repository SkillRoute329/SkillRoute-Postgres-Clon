import https from 'https';
import querystring from 'querystring';

async function request(path, options = {}) {
  return new Promise((resolve) => {
    const body = options.body || '';
    const opts = {
      hostname: 'www.montevideo.gub.uy',
      path,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': options.accept || 'text/html,*/*',
        'Accept-Language': 'es-UY',
        'Cookie': options.cookie || '',
        ...(body ? {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        } : {})
      },
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d, headers: res.headers }));
    });
    req.on('error', (e) => resolve({ status: 'ERR', body: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

const page = await request('/app/stm/horarios/pages/consultar.xhtml');
const cookies = (page.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
const vsMatch = page.body.match(/javax\.faces\.ViewState[^>]+value="([^"]+)"/);
const viewState = vsMatch ? vsMatch[1] : '';

// Guardar el HTML completo para inspeccionarlo
import fs from 'fs';
fs.writeFileSync('/tmp/stm_consultar.html', page.body);
console.log('HTML guardado, tamaño:', page.body.length);

// Buscar empresa en el HTML - leer ~5000 chars alrededor de "slEmpresa"
const empIdx = page.body.indexOf('slEmpresa');
if (empIdx >= 0) {
  const context = page.body.substring(Math.max(0, empIdx - 500), empIdx + 3000);
  console.log('\n=== CONTEXTO slEmpresa ===');
  console.log(context.replace(/<script[\s\S]*?<\/script>/g, '').replace(/\s+/g, ' ').substring(0, 2000));
} else {
  console.log('slEmpresa NO encontrado - buscando alternativas...');
  // Buscar cualquier select con empresa/cooperativa
  const cooperativa = page.body.indexOf('cooperativa');
  const empresa = page.body.indexOf('empresa');
  const UCOT = page.body.indexOf('UCOT');
  console.log('cooperativa at:', cooperativa, '| empresa at:', empresa, '| UCOT at:', UCOT);
  
  if (UCOT >= 0) {
    console.log('\nContexto UCOT:', page.body.substring(Math.max(0,UCOT-300), UCOT+500).replace(/\s+/g,' '));
  }
  
  // Dump the first select we find
  const selectMatch = page.body.match(/<select[\s\S]{1,5000}?<\/select>/);
  if (selectMatch) {
    console.log('\nPrimer select:', selectMatch[0].substring(0, 500));
  }
}
