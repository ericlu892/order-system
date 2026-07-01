#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/server"
if [ ! -d "node_modules" ]; then
  cd "$(dirname "$0")"
  npm install
  cd server
fi
# Ensure better-sqlite3 native addon is built
npx node-pre-gyp rebuild -C "$(npm root)/better-sqlite3" 2>/dev/null || true
node server_new.js
