#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Phase 0: Prerequisites ──
info "Checking prerequisites..."

command -v kubectl >/dev/null 2>&1 || error "kubectl not found. Install: brew install kubectl"
command -v helm >/dev/null 2>&1 || {
  warn "helm not found. Installing via brew..."
  brew install helm
}

kubectl cluster-info >/dev/null 2>&1 || error "Kubernetes cluster not reachable. Ensure Docker Desktop K8s is running."

info "Prerequisites OK"

# ── Phase 1: Namespaces ──
info "Creating namespaces..."
kubectl create namespace opensandbox-system --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace opensandbox --dry-run=client -o yaml | kubectl apply -f -

# ── Phase 2: Install OpenSandbox ──
info "Installing OpenSandbox..."

CHART_DIR=""
if [ -d "/tmp/opensandbox-chart" ]; then
  rm -rf /tmp/opensandbox-chart
fi

# Clone chart from GitHub
info "Cloning OpenSandbox Helm chart..."
git clone --depth 1 https://github.com/alibaba/OpenSandbox.git /tmp/opensandbox-chart 2>/dev/null || {
  warn "Could not clone from GitHub. Trying local chart..."
  if [ -f "$SCRIPT_DIR/../helm/opensandbox" ]; then
    CHART_DIR="$SCRIPT_DIR/../helm/opensandbox"
  else
    error "No OpenSandbox Helm chart found. Please clone manually."
  fi
}

if [ -z "$CHART_DIR" ]; then
  # Try to find chart in cloned repo
  if [ -d "/tmp/opensandbox-chart/kubernetes/charts/opensandbox" ]; then
    CHART_DIR="/tmp/opensandbox-chart/kubernetes/charts/opensandbox"
  elif [ -d "/tmp/opensandbox-chart/deploy/charts/opensandbox" ]; then
    CHART_DIR="/tmp/opensandbox-chart/deploy/charts/opensandbox"
  elif [ -d "/tmp/opensandbox-chart/charts/opensandbox" ]; then
    CHART_DIR="/tmp/opensandbox-chart/charts/opensandbox"
  else
    CHART_DIR="/tmp/opensandbox-chart"
  fi
fi

VALUES_FILE="$SCRIPT_DIR/values-dev.yaml"
if [ ! -f "$VALUES_FILE" ]; then
  warn "values-dev.yaml not found at $VALUES_FILE, using defaults"
  VALUES_FILE=""
fi

if helm status opensandbox-controller -n opensandbox-system >/dev/null 2>&1; then
  info "OpenSandbox already installed, upgrading..."
  helm upgrade opensandbox-controller "$CHART_DIR" \
    -n opensandbox-system \
    ${VALUES_FILE:+-f "$VALUES_FILE"} \
    --wait --timeout 300s
else
  helm install opensandbox-controller "$CHART_DIR" \
    -n opensandbox-system \
    ${VALUES_FILE:+-f "$VALUES_FILE"} \
    --wait --timeout 300s
fi

info "OpenSandbox installed successfully"

# ── Phase 3: Wait for Pods ──
info "Waiting for OpenSandbox pods to be ready..."
kubectl wait --for=condition=ready pod \
  -l app.kubernetes.io/instance=opensandbox-controller \
  -n opensandbox-system \
  --timeout=180s 2>/dev/null || {
  warn "Some pods may still be starting. Check: kubectl get pods -n opensandbox-system"
}

# ── Phase 4: Deploy Pool CRD ──
info "Deploying sandbox pool..."
POOL_FILE="$SCRIPT_DIR/pool.yaml"
if [ -f "$POOL_FILE" ]; then
  # Wait for CRD to be registered
  info "Waiting for Pool CRD to be registered..."
  for i in $(seq 1 30); do
    if kubectl get crd pools.sandbox.opensandbox.io >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  kubectl apply -f "$POOL_FILE"
  info "Pool deployed"
else
  warn "pool.yaml not found, skipping pool deployment"
fi

# ── Phase 5: Output ──
echo ""
info "========================================="
info "  OpenSandbox Installation Complete!"
info "========================================="
echo ""

SERVER_IP=$(kubectl get svc opensandbox-server -n opensandbox-system -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "N/A")
SERVER_PORT=$(kubectl get svc opensandbox-server -n opensandbox-system -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "80")

info "Server ClusterIP: $SERVER_IP:$SERVER_PORT"
echo ""
info "Next steps:"
info "  1. Port-forward:  kubectl port-forward svc/opensandbox-server 8080:80 -n opensandbox-system"
info "  2. Backend env:   OPENSANDBOX_SERVER_URL=localhost:8080"
info "  3. Start dev:     ./scripts/setup.sh"
echo ""
info "Verify: kubectl get pods -n opensandbox-system"
