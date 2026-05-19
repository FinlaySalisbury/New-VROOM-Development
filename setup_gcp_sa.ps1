$ErrorActionPreference = "Stop"
$PROJECT_ID = "work-site-navigation-app"
$SA_NAME = "github-actions-deployer"
$SA_EMAIL = "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

Write-Host "Creating Service Account..."
gcloud iam service-accounts create $SA_NAME --display-name="GitHub Actions Deployer" --project=$PROJECT_ID

Write-Host "Assigning Roles..."
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA_EMAIL" --role="roles/compute.instanceAdmin.v1" | Out-Null
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA_EMAIL" --role="roles/iap.tunnelResourceAccessor" | Out-Null
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA_EMAIL" --role="roles/iam.serviceAccountUser" | Out-Null

Write-Host "Generating JSON Key..."
gcloud iam service-accounts keys create gcp_credentials.json --iam-account=$SA_EMAIL --project=$PROJECT_ID

Write-Host "Done! The key has been saved to gcp_credentials.json"
