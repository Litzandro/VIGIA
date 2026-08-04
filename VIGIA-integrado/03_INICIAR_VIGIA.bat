@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo VIGIA - Iniciar sistema
echo ========================================
echo Abre http://localhost:3000 en el navegador.
start "" "http://localhost:3000"
call npm.cmd run dev
pause
