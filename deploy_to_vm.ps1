$ErrorActionPreference = "Stop"

Write-Host "Creating deployment package..."
if (Test-Path sandbox_deploy) { Remove-Item -Recurse -Force sandbox_deploy }
New-Item -ItemType Directory -Force -Path sandbox_deploy | Out-Null

# Copy everything except node_modules, python cache, and db files
robocopy sandbox sandbox_deploy /MIR /XD node_modules __pycache__ /XF *.db | Out-Null

Write-Host "Transferring files to VM..."
gcloud compute scp --recurse sandbox_deploy vroom-sandbox-server:/home/yu007637/ --zone=europe-west2-c --tunnel-through-iap

Write-Host "Applying changes and restarting containers..."
$sshCommand = "cp -r /home/yu007637/sandbox_deploy/* /home/yu007637/sandbox/ && rm -rf /home/yu007637/sandbox_deploy && cd /home/yu007637/sandbox && sudo docker compose up -d --build"
gcloud compute ssh vroom-sandbox-server --zone=europe-west2-c --tunnel-through-iap --command=$sshCommand

Write-Host "Cleaning up local files..."
Remove-Item -Recurse -Force sandbox_deploy

Write-Host "Deployment completed successfully!"
