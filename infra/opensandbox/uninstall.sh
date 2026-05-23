#!/usr/bin/env bash
set -euo pipefail

echo "This will remove all OpenSandbox resources. Continue? [y/N]"
read -r confirm
[[ "$confirm" =~ ^[yY]$ ]] || { echo "Aborted"; exit 0; }

helm uninstall opensandbox-controller -n opensandbox-system 2>/dev/null || true
kubectl delete -f infra/opensandbox/pool.yaml 2>/dev/null || true
kubectl delete namespace opensandbox opensandbox-system 2>/dev/null || true

echo "OpenSandbox uninstalled."
