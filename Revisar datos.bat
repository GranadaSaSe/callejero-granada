@echo off
title Mapa de revision - Callejero Granada
cd /d "%~dp0"
echo.
echo  Abriendo el mapa de revision en el navegador...
echo  Deja esta ventana abierta mientras revisas. Para terminar, cierrala.
echo.
node scripts\servidor-revision.mjs
pause
