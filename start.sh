#!/usr/bin/env bash
set -e
cd server
if [ ! -d "node_modules" ]; then
  npm install
fi
node server_new.js
