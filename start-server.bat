@echo off
TITLE TransformaFacil - SERVIDOR MAESTRO
mode con: cols=100 lines=30
color 0F
CLS

ECHO ===================================================
ECHO      TRANSFORMA FACIL - INICIANDO SISTEMA
ECHO ===================================================
ECHO.

REM --- STEP 1: SELF-HEALING (Kill old processes) ---
ECHO [1/5] Limpiando procesos antiguos...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM ngrok.exe /T >nul 2>&1
ECHO [OK] Puertos liberados.
ECHO.

REM --- STEP 2: AUTO-START CONFIGURATION ---
ECHO [2/5] Verificando Inicio Automatico...
set "TARGET_SCRIPT=%~dp0start-server.bat"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\TransformaFacil_Server.lnk"

IF NOT EXIST "%SHORTCUT_PATH%" (
    ECHO [INFO] Configurando inicio automatico...
    powershell -Command "$s=(New-Object -COM 'WScript.Shell').CreateShortcut('%SHORTCUT_PATH%');$s.TargetPath='%TARGET_SCRIPT%';$s.WorkingDirectory='%~dp0';$s.Save()"
    ECHO [OK] Configurado para iniciar con Windows.
) ELSE (
    ECHO [OK] Inicio automatico ya configurado.
)
ECHO.

REM --- STEP 3: CONFIGURE NGROK URL ---
ECHO [3/5] Preparando Tunel...

REM Detect Ngrok
WHERE ngrok >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    ECHO [INFO] Ngrok global no encontrado. Usando 'npx ngrok'.
    SET NGROK_CMD=call npx -y ngrok
) ELSE (
    ECHO [INFO] Ngrok encontrado en PATH.
    SET NGROK_CMD=ngrok
)

SET STATIC_DOMAIN=
IF EXIST ngrok_config.txt (
    SET /p STATIC_DOMAIN=<ngrok_config.txt
)

IF DEFINED STATIC_DOMAIN (
    ECHO [INFO] Usando Dominio Fijo Guardado.
    SET NGROK_ARGS=http --domain=%STATIC_DOMAIN% 5173
) ELSE (
    ECHO [INFO] Usando enlace aleatorio.
    SET NGROK_ARGS=http 5173
)
ECHO.

REM --- STEP 4: START SERVERS ---
ECHO [4/5] Arrancando Servidores...
ECHO Iniciando Backend y Frontend en segundo plano...
start "TransformaFacil App" /MIN cmd /c "call start-app.bat"
ECHO.
ECHO Iniciando Tunel Ngrok (Ventana Visible para detectar errores)...
REM Start ngrok VISIBLE so we can see if it crashes or asks for input
REM Using /k to KEEP window open if it crashes
start "Ngrok Tunnel" cmd /k "%NGROK_CMD% %NGROK_ARGS%"

REM --- STEP 5: WAIT AND DISPLAY LINK ---
ECHO [5/5] Esperando conexion...
ECHO.
ECHO Por favor espera unos segundos mientras se establece la conexion...

:WAIT_LOOP
timeout /t 2 >nul
powershell -Command "$ErrorActionPreference = 'Stop'; try { $json=Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels'; if ($json.tunnels.Count -gt 0) { exit 0 } else { exit 1 } } catch { exit 1 }"
IF %ERRORLEVEL% NEQ 0 GOTO WAIT_LOOP

CLS
color 0A
ECHO ===================================================
ECHO               SISTEMA EN LINEA (ONLINE)
ECHO ===================================================
ECHO.
ECHO Estado:
ECHO [OK] Servidor Local (PC)
ECHO [OK] Acceso Remoto (Celular)
ECHO [OK] Inicio Automatico
ECHO.
ECHO ---------------------------------------------------
ECHO    TU ENLACE PARA EL CELULAR (Cualquier Red):
ECHO ---------------------------------------------------
ECHO.

powershell -Command "$json=Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels'; $url=$json.tunnels[0].public_url; Write-Host $url -ForegroundColor Yellow -BackgroundColor Black; $url | Set-Clipboard"

ECHO.
ECHO ---------------------------------------------------
ECHO [!] El enlace ha sido copiado al portapapeles.
ECHO.
ECHO MANTEN ESTA VENTANA ABIERTA PARA QUE LA APP FUNCIONE.
ECHO Si la cierras, la app se apagara.
ECHO.
PAUSE
