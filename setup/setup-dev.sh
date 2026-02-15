#!/bin/bash

# curl -sfL https://get.quickstack.dev/setup.sh | sh -

select_network_interface() {
  if [ -z "$INSTALL_K3S_INTERFACE" ]; then
    interfaces_with_ips=$(ip -o -4 addr show | awk '!/^[0-9]*: lo:/ {print $2, $4}' | cut -d'/' -f1)

    echo "Available network interfaces:"
    echo "$interfaces_with_ips"
    echo ""
    echo "*******************************************************************************************************"
    echo ""
    echo "If you plan to use QuickStack in a cluster using multiple servers in multiple Networks (private/public),"
    echo "choose the network Interface you want to use for the communication between the servers."
    echo ""
    echo "If you plan to use QuickStack in a single server setup, choose the network Interface with the public IP."
    echo ""

    i=1
    echo "$interfaces_with_ips" | while read -r iface ip; do
      printf "%d) %s (%s)\n" "$i" "$iface" "$ip"
      i=$((i + 1))
    done

    printf "Please enter the number of the interface to use: "
    # Change read to use /dev/tty explicitly
    read -r choice </dev/tty

    selected=$(echo "$interfaces_with_ips" | sed -n "${choice}p")
    selected_iface=$(echo "$selected" | awk '{print $1}')
    selected_ip=$(echo "$selected" | awk '{print $2}')

    if [ -n "$selected" ]; then
      echo "Selected interface: $selected_iface ($selected_ip)"
    else
      echo "Invalid selection. Exiting."
      exit 1
    fi
  else
    selected_iface="$INSTALL_K3S_INTERFACE"
    selected_ip=$(ip -o -4 addr show "$selected_iface" | awk '{print $4}' | cut -d'/' -f1)
    echo "Using provided network interface: $selected_iface ($selected_ip)"
  fi

  echo "Using network interface: $selected_iface with IP address: $selected_ip"
}

wait_until_all_pods_running() {

  # Waits another 5 seconds to make sure all pods are registered for the first time.
  sleep 5

  while true; do
    OUTPUT=$(kubectl get pods -A --no-headers 2>&1)

    # Checks if there are no resources found --> Kubernetes ist still starting up
    if echo "$OUTPUT" | grep -q "No resources found"; then
      echo "Kubernetes is still starting up..."
    else
      # Extracts the STATUS column from the kubectl output and filters out the values "Running" and "Completed".
      STATUS=$(echo "$OUTPUT" | awk '{print $4}' | grep -vE '^(Running|Completed)$')

      # If the STATUS variable is empty, all pods are running and the loop can be exited.
      if [ -z "$STATUS" ]; then
        echo "Pods started successfully."
        break
      else
        echo "Waiting for all pods to come online..."
      fi
    fi

    # Waits for X seconds before checking the pod status again.
    sleep 10
  done

  # Waits another 5 seconds to make sure all pods are ready.
  sleep 5

  kubectl get node
  kubectl get pods -A
}

# Installation of Longhorn
kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.7.2/deploy/longhorn.yaml
echo "Waiting for Longhorn to start..."
wait_until_all_pods_running

# Installation of Cert-Manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.1/cert-manager.yaml
echo "Waiting for Cert-Manager to start..."
wait_until_all_pods_running
kubectl -n cert-manager get pod

# Use this for checking installation of Longhorn
# sudo curl -sSfL https://raw.githubusercontent.com/longhorn/longhorn/v1.7.2/scripts/environment_check.sh | sudo bash

joinTokenForOtherNodes="kind-token"

# deploy QuickStack
cat <<EOF >quickstack-setup-job.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: quickstack
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: qs-service-account
  namespace: quickstack
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: qs-role-binding
subjects:
  - kind: ServiceAccount
    name: qs-service-account
    namespace: quickstack
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
EOF
kubectl apply -f quickstack-setup-job.yaml
rm quickstack-setup-job.yaml
wait_until_all_pods_running

# evaluate url to add node to cluster
# echo "To add an additional node to the cluster, run the following command on the worker node:"
# echo "curl -sfL https://get.quickstack.dev/setup-worker.sh | K3S_URL=https://<IP-ADDRESS-OR-HOSTNAME-OF-MASTERNODE>:6443 JOIN_TOKEN=$joinTokenForOtherNodes sh -"
