#!/bin/sh
echo "📢 [STARTING] Launching Start Script..."

# 1. Diagnostic: Show current directory and list all files recursively
echo "📂 [DIAGNOSTIC] Current Directory: $(pwd)"
echo "📂 [DIAGNOSTIC] Listing all files in /app/backend/dist:"
ls -R /app/backend/dist || echo "❌ /app/backend/dist NOT FOUND!"

# 2. Verify Entry Point
if [ -f "/app/backend/dist/index.js" ]; then
    echo "✅ [CHECK] Entry point index.js FOUND."
else
    echo "❌ [FATAL] Entry point index.js MISSING!"
    exit 1
fi

# 3. Environment Check
echo "🌍 [ENV] PORT: $PORT"
echo "🌍 [ENV] NODE_ENV: $NODE_ENV"

# 4. Start Application with explicit error redirection to stdout
echo "🚀 [EXEC] Starting Node process..."
exec node /app/backend/dist/index.js 2>&1
