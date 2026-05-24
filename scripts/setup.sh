#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== OpenSandbox Platform - Local Development Setup ==="
echo ""

# Check prerequisites
command -v kubectl >/dev/null 2>&1 || { echo "Error: kubectl not found"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "Error: pnpm not found"; exit 1; }

# Step 1: Install OpenSandbox infrastructure
echo "[1/4] Installing OpenSandbox infrastructure..."
bash "$PROJECT_DIR/infra/opensandbox/install.sh"

# Step 2: Install dependencies
echo "[2/4] Installing dependencies..."
cd "$PROJECT_DIR"
pnpm install

# Step 3: Create .env files
echo "[3/4] Setting up environment files..."
if [ ! -f "$PROJECT_DIR/apps/backend/.env" ]; then
  cp "$PROJECT_DIR/apps/backend/.env.example" "$PROJECT_DIR/apps/backend/.env"
  echo "  Created apps/backend/.env from .env.example"
else
  echo "  apps/backend/.env already exists, skipping"
fi

# Step 4: Verify gateway access
echo "[4/4] Verifying gateway access..."
if curl -s http://osb.sandbox.localhost/health 2>/dev/null | grep -q "healthy"; then
  echo "  Server API: OK (http://osb.sandbox.localhost)"
else
  echo "  Warning: Server API not reachable at http://osb.sandbox.localhost"
  echo "  Ensure Ingress rules are applied: kubectl apply -f infra/opensandbox/"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  Terminal 1: ./scripts/dev-backend.sh"
echo "  Terminal 2: ./scripts/dev-frontend.sh"
echo "  Browser:    http://localhost:5173"
