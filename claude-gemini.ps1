# Claude Code con Gemini (via LiteLLM proxy)
# Uso: .\claude-gemini.ps1

$env:ANTHROPIC_BASE_URL = "http://localhost:4001"
$env:ANTHROPIC_API_KEY = "sk-litellm-gemini-proxy-key-1234"

Write-Host "=== Claude Code + Gemini ===" -ForegroundColor Cyan
Write-Host "Proxy: localhost:4001 -> Gemini 2.0 Flash" -ForegroundColor Green
Write-Host "Selecciona '1. Yes' cuando pregunte por la API key" -ForegroundColor Yellow
Write-Host ""

claude --bare
