@echo off
title Revision de fotos - Callejero Granada
cd /d "%~dp0"
echo.
echo  Abriendo la revision de fotos en el navegador...
echo  Deja esta ventana abierta mientras revisas. Para terminar, cierrala.
echo.
node scripts\servidor-fotos.mjs
pause
