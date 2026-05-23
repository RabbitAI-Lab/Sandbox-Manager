#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Check backend
if ! curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
  echo "Warning: Backend not reachable at localhost:3000"
  echo "Start backend: ./scripts/dev-backend.sh"
  echo ""
fi

echo "Starting frontend dev server..."
cd "$PROJECT_DIR/apps/frontend"
pnpm dev
