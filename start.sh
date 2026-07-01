#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/server"
echo "Starting order-system..."
node server_new.js
