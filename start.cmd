@echo off
cd /d "%~dp0"
start "ruankao-server" /min node scripts\serve.mjs
timeout /t 1 /nobreak >nul
start "" http://localhost:4173
