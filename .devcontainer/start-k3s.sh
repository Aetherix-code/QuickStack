#!/usr/bin/env bash
set -e

# Idempotent: do nothing if k3s is already running
if pgrep -x k3s > /dev/null 2>&1; then
    echo "k3s is already running."
    exit 0
fi

echo "Starting k3s server..."
sudo k3s server \
    --write-kubeconfig-mode=644 \
    --snapshotter=native \
    > /tmp/k3s.log 2>&1 &

echo "Waiting for k3s to be ready (this may take ~30s on first boot)..."
until sudo k3s kubectl get nodes --request-timeout=3s 2>/dev/null | grep -q " Ready"; do
    sleep 3
    printf "."
done
echo ""

echo "k3s is ready. Writing kube-config.config..."
sudo cp /etc/rancher/k3s/k3s.yaml kube-config.config
sudo chown "$(id -u):$(id -g)" kube-config.config

echo "Done! k3s is running. You can now run 'yarn dev' or 'yarn dev-live'."
