@echo off
REM ============================================================
REM Budge — Lancement Windows
REM Double-cliquer sur ce fichier pour lancer Budge
REM ============================================================

cd /d "%~dp0"

IF NOT EXIST node_modules (
  echo Installation des dependances (premiere fois, ~30s)...
  call npm install --silent
  echo.
)

echo Lancement de Budge...
.\node_modules\.bin\electron.cmd .