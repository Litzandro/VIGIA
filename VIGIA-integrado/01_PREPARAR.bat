@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo VIGIA - Preparar proyecto
echo ========================================
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js no esta disponible en PATH.
  echo Cierra esta ventana, reinicia Windows y vuelve a intentarlo.
  pause
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm no esta disponible en PATH.
  pause
  exit /b 1
)
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo Se creo el archivo .env.
  echo Abre .env y configura DB_USER, DB_PASSWORD y JWT_SECRET.
  start "" notepad ".env"
  echo Luego vuelve a ejecutar 01_PREPARAR.bat.
  pause
  exit /b 0
)
call npm.cmd install
if errorlevel 1 (
  echo.
  echo ERROR: No se pudieron instalar las dependencias.
  pause
  exit /b 1
)
echo.
echo Dependencias instaladas correctamente.
pause
