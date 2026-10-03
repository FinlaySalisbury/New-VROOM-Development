$ErrorActionPreference = "Stop"

# $ErrorActionPreference does not apply to native executables (robocopy,
# gcloud), so their exit codes are checked explicitly. Without this a failed
# transfer fell through to the remote apply step, which could then copy a
# stale sandbox_deploy left on the VM by an earlier run - and the script still
# reported success.

try {
    Write-Host "Creating deployment package..."
    if (Test-Path sandbox_deploy) { Remove-Item -Recurse -Force sandbox_deploy }
    New-Item -ItemType Directory -Force -Path sandbox_deploy | Out-Null

    # Copy everything except node_modules, python cache, and db files
    robocopy sandbox sandbox_deploy /MIR /XD node_modules __pycache__ /XF *.db | Out-Null
    # robocopy exit codes 0-7 mean success; 8 and above mean failure.
    if ($LASTEXITCODE -ge 8) { throw "Packaging failed (robocopy exit $LASTEXITCODE). Nothing was deployed." }

    Write-Host "Transferring files to VM..."
    gcloud compute scp --recurse sandbox_deploy vroom-sandbox-server:/home/yu007637/ --zone=europe-west2-c --tunnel-through-iap
    if ($LASTEXITCODE -ne 0) { throw "File transfer to VM failed (exit $LASTEXITCODE). Nothing was deployed." }

    Write-Host "Applying changes and restarting containers..."
    $sshCommand = "cp -r /home/yu007637/sandbox_deploy/* /home/yu007637/sandbox/ && rm -rf /home/yu007637/sandbox_deploy && cd /home/yu007637/sandbox && sudo docker compose up -d --build"
    gcloud compute ssh vroom-sandbox-server --zone=europe-west2-c --tunnel-through-iap --command=$sshCommand
    if ($LASTEXITCODE -ne 0) { throw "Remote apply failed (exit $LASTEXITCODE). Files may be on the VM but not live - check it before retrying." }

    Write-Host "Deployment completed successfully!"
}
finally {
    Write-Host "Cleaning up local files..."
    if (Test-Path sandbox_deploy) { Remove-Item -Recurse -Force sandbox_deploy }
}
