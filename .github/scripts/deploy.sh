#!/bin/bash
set -e

echo "Creating deployment package..."
rm -rf sandbox_deploy
mkdir -p sandbox_deploy

# Copy everything except node_modules, python cache, and db files
rsync -av --exclude='node_modules' --exclude='__pycache__' --exclude='*.db' sandbox/ sandbox_deploy/

echo "Transferring files to VM..."
gcloud compute scp --recurse sandbox_deploy vroom-sandbox-server:~ --zone=europe-west2-c --tunnel-through-iap --project=work-site-navigation-app

echo "Applying changes and restarting containers..."
SSH_CMD="cp -r ~/sandbox_deploy/* ~/sandbox/ && rm -rf ~/sandbox_deploy && cd ~/sandbox && sudo docker compose up -d --build"
gcloud compute ssh vroom-sandbox-server --zone=europe-west2-c --tunnel-through-iap --project=work-site-navigation-app --command="$SSH_CMD"

echo "Deployment completed successfully!"
