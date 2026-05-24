#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Check gateway access — try all configured domains
DOMAINS="${SANDBOX_DOMAINS:-sandbox.localhost}"
SERVER_URL="osb.sandbox.localhost"
for domain in $DOMAINS; do
  if curl -s "http://osb.${domain}/health" 2>/dev/null | grep -q "healthy"; then
    SERVER_URL="osb.${domain}"
    break
  fi
done

if [ "$SERVER_URL" = "osb.sandbox.localhost" ]; then
  if ! curl -s http://osb.sandbox.localhost/health 2>/dev/null | grep -q "healthy"; then
    echo "Warning: OpenSandbox Server not reachable"
    echo "Ensure Ingress rules are applied: kubectl apply -f infra/opensandbox/"
    echo ""
  fi
fi

echo "Starting backend dev server..."
cd "$PROJECT_DIR/apps/backend"
OPENSANDBOX_SERVER_URL=$SERVER_URL OPENSANDBOX_PROTOCOL=http pnpm dev
