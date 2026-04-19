#!/usr/bin/env node
/**
 * claude-repl.mjs — Claude Code interactivo via Gemini (LiteLLM proxy)
 * Simula una sesión REPL usando claude -p --bare
 * No requiere cuenta Anthropic.
 */

import { spawnSync } from 'child_process';
import * as readline from 'readline';

const PROXY_URL = 'http://localhost:4001';
const PROXY_KEY = 'sk-litellm-gemini-proxy-key-1234';

async function checkProxy() {
  try {
    const r = await fetch(`${PROXY_URL}/`);
    return r.ok || r.status === 200;
  } catch {
    return false;
  }
}

function askClaude(prompt) {
  const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: PROXY_URL,
    ANTHROPIC_API_KEY: PROXY_KEY,
  };

  // Inyectar instrucción de idioma y estilo al prompt
  const enhancedPrompt = `(IMPORTANTE: Responde SIEMPRE en ESPAÑOL. Sé directo y técnico.)\n${prompt}`;

  const result = spawnSync('claude', ['-p', '--bare', enhancedPrompt], {
    env,
    shell: true,
    encoding: 'utf-8',
    timeout: 60000,
    stdio: ['inherit', 'pipe', 'pipe']
  });

  if (result.error) throw result.error;
  
  // Limpiar posibles warnings de Node/ESM que Claude Code ensucia en stderr
  const filteredStderr = result.stderr ? result.stderr.split('\n')
    .filter(line => !line.includes('ExperimentalWarning'))
    .join('\n').trim() : '';

  if (filteredStderr && result.status !== 0) throw new Error(filteredStderr);
  
  return result.stdout?.trim() || '';
}

async function main() {
  console.log('\x1b[36m╔══════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║   Claude Code + Gemma 3:4b (Local)   ║\x1b[0m');
  console.log('\x1b[36m║   Soberanía Total - Sin Costo Externo ║\x1b[0m');
  console.log('\x1b[36m╚══════════════════════════════════════╝\x1b[0m\n');

  const proxyOk = await checkProxy();
  if (!proxyOk) {
    console.error('\x1b[31m✗ Proxy LiteLLM no disponible en ' + PROXY_URL + '\x1b[0m');
    console.error('  Ejecutá primero:');
    console.error('  $env:GEMINI_API_KEY="..."; litellm --config litellm_config.yaml --port 4001');
    process.exit(1);
  }
  console.log('\x1b[32m✓ Proxy conectado → Gemma 3:4b (Local)\x1b[0m\n');
  console.log('\x1b[90m(Gemini 2.0 Flash disponible para consultas opus).\x1b[0m');
  console.log('\x1b[90mEscribí tu mensaje. /exit para salir.\x1b[0m\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) return;
    if (input === '/exit' || input === '/quit') {
      console.log('\x1b[90mSesión terminada.\x1b[0m');
      rl.close();
      process.exit(0);
    }

    rl.pause();
    process.stdout.write('\x1b[90m⟳ Pensando...\x1b[0m\n\n');

    try {
      const response = askClaude(input);
      console.log('\x1b[32m' + response + '\x1b[0m\n');
    } catch (err) {
      console.error('\x1b[31m✗ Error: ' + (err.message || err) + '\x1b[0m\n');
    }

    rl.resume();
    if (process.stdin.isTTY) process.stdout.write('\x1b[33m❯ \x1b[0m');
  });

  rl.on('close', () => process.exit(0));

  if (process.stdin.isTTY) process.stdout.write('\x1b[33m❯ \x1b[0m');
}

main();
