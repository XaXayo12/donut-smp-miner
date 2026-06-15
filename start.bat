@echo off
REM ============================================================
REM   DONUT MINER  -  double-clique sur ce fichier pour lancer
REM ============================================================
title Donut SMP Miner
cd /d "%~dp0"

REM 1) Node.js est-il installe ?
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Node.js n'est pas installe.
  echo       Installe-le depuis https://nodejs.org  (version LTS)
  echo       puis relance ce fichier.
  echo.
  pause
  exit /b 1
)

REM 2) Les dependances sont-elles installees ?
if not exist "node_modules" (
  echo.
  echo   Premiere fois : installation des outils... (1-2 minutes)
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   [X] L'installation a echoue. Verifie ta connexion internet.
    pause
    exit /b 1
  )
)

REM 3) On lance le programme.
node src/index.js

echo.
pause
