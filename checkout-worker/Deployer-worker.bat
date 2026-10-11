@echo off
chcp 65001 >nul
title Mise a jour du Worker de paiement vgthmind
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est introuvable. Installe-le depuis https://nodejs.org puis relance. & pause & exit /b 1)
echo Mise a jour du Worker de paiement (mode test Stripe, rien ne change pour les clients).
echo Si une page Cloudflare s'ouvre dans le navigateur, connecte-toi et clique sur Autoriser.
echo.
call npx.cmd wrangler deploy
echo.
echo Si tu vois "Deployed" ou "Uploaded" au-dessus, c'est fini. Sinon, recopie le message et colle-le dans Claude.
pause
