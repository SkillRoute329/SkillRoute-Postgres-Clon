@echo off
title Renombrar a Trasforma2.0
cd /d "c:\Users\jonat\Desktop\PROYECTOS"

if not exist "TransformaFacil-2.0" (
    echo La carpeta TransformaFacil-2.0 no existe. Puede que ya se haya renombrado.
    if exist "Trasforma2.0" (
        echo La carpeta Trasforma2.0 ya existe. Listo.
    )
    pause
    exit /b 0
)

if exist "Trasforma2.0" (
    echo Ya existe una carpeta Trasforma2.0. Borra o renombra esa carpeta antes.
    pause
    exit /b 1
)

echo Cerrando Cursor no es necesario si ejecutas esto desde fuera de Cursor.
echo Renombrando TransformaFacil-2.0 -^> Trasforma2.0 ...
ren "TransformaFacil-2.0" "Trasforma2.0"

if %errorlevel% equ 0 (
    echo.
    echo Listo. La carpeta ahora es: c:\Users\jonat\Desktop\PROYECTOS\Trasforma2.0
    echo Abre ese proyecto en Cursor: File -^> Open Folder -^> Trasforma2.0
) else (
    echo Error al renombrar. Cierra Cursor y vuelve a ejecutar este .bat
)

echo.
pause
