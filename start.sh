#!/bin/bash
# ============================================================
# Budge — Script de lancement
# ============================================================

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "📦 Installation des dépendances Electron (première fois)..."
  npm install
fi

echo "🚀 Lancement de Budge..."
./node_modules/.bin/electron . --no-sandbox