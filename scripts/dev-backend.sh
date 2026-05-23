#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Check port-forward
if ! curl -s http://localhost:8080 >/dev/null 2>&1; then
  echo "Warning: OpenSandbox Server not reachable at localhost:8080"
  echo "Start port-forward: kubectl port-forward svc/opensandbox-server 8080:80 -n opensandbox-system"
  echo ""
fi

echo "Starting backend dev server..."
cd "$PROJECT_DIR/apps/backend"
OPENSANDBOX_SERVER_URL=localhost:8080 pnpm dev
