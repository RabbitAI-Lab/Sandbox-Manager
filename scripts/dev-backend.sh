#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Check gateway access
if ! curl -s http://osb.sandbox.localhost/health 2>/dev/null | grep -q "healthy"; then
  echo "Warning: OpenSandbox Server not reachable at http://osb.sandbox.localhost"
  echo "Ensure Ingress rules are applied: kubectl apply -f infra/opensandbox/"
  echo ""
fi

echo "Starting backend dev server..."
cd "$PROJECT_DIR/apps/backend"
OPENSANDBOX_SERVER_URL=osb.sandbox.localhost OPENSANDBOX_PROTOCOL=http pnpm dev
