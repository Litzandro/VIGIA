@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo VIGIA - Crear datos de demostracion
echo ========================================
call npm.cmd run seed:demo
if errorlevel 1 (
  echo.
  echo Revisa la conexion de MySQL y el archivo .env.
  pause
  exit /b 1
)
echo.
echo Datos de demostracion creados.
pause
