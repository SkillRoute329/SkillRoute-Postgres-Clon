import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Configuración de rutas y llaves
const PROJECT_DIR = 'c:\\Users\\jonat\\Desktop\\PROYECTOS\\GestionUcot';
const LITELLM_PATH = path.join(os.homedir(), 'AppData\\Roaming\\Python\\Python311\\Scripts\\litellm.exe');
const CONFIG_PATH = path.join(PROJECT_DIR, 'litellm_config.yaml');
const REPL_PATH = path.join(PROJECT_DIR, 'claude-repl.mjs');
const GEMINI_API_KEY = "AIzaSyCelDMSAGW7Wte-M7OFltTxd-tHB0jOGp8"; // Centralizado

const env = {
  ...process.env,
  GEMINI_API_KEY,
  ANTHROPIC_BASE_URL: 'http://localhost:4001',
  ANTHROPIC_API_KEY: 'sk-litellm-gemini-proxy-key-1234',
  NODE_NO_WARNINGS: '1',
  PYTHONIOENCODING: 'utf-8'
};

async function checkProxy() {
  try {
    const res = await fetch('http://localhost:4001/health/readiness');
    return res.ok;
  } catch {
    return false;
  }
}

function startProxy() {
  console.log('🚀 Iniciando Proxy LiteLLM (Motores: Gemma 3 Local + Gemini Respaldo)...');
  
  const proxy = spawn(LITELLM_PATH, ['--config', CONFIG_PATH, '--port', '4001'], {
    env,
    detached: true,
    stdio: 'ignore'
  });

  proxy.unref();
  return proxy;
}

async function ensureAvailability() {
  const isUp = await checkProxy();
  if (!isUp) {
    startProxy();
    // Esperar a que suba
    let retries = 5;
    while (retries > 0) {
      await new Promise(r => setTimeout(r, 2000));
      if (await checkProxy()) {
        console.log('✅ Proxy disponible en puerto 4001.');
        return true;
      }
      retries--;
    }
    console.error('❌ No se pudo iniciar el proxy.');
    return false;
  }
  console.log('⚡ Proxy ya estaba corriendo.');
  return true;
}

// Lógica principal: Autostart + REPL
async function main() {
  process.stdout.write('\x1Bc'); // Limpiar consola
  console.log('────────────────────────────────────────────────');
  console.log('   CLAUDE CODE + GEMMA 3 - SOBERANÍA LOCAL      ');
  console.log('────────────────────────────────────────────────\n');

  const ready = await ensureAvailability();
  if (ready) {
    console.log('🎉 Todo listo. Lanzando Claude Code REPL...\n');
    
    // Ejecutar el REPL directamente
    const repl = spawn('node', [REPL_PATH], {
      env,
      stdio: 'inherit',
      shell: true
    });

    repl.on('exit', () => {
      console.log('\n👋 Sesión cerrada. El proxy seguirá corriendo en segundo plano.');
      process.exit();
    });
  }
}

main();
