data "vercel_project" "piro" {
  name = "piro"
}

# The BUCKET_* variables predate the R2 migration and are consumed directly by
# src/lib/r2.ts. Terraform adopts the existing dashboard-managed variables via
# the import blocks below and repoints their values at R2, so the application
# keeps the same variable names and requires no code change.
resource "vercel_project_environment_variable" "bucket_endpoint_url" {
  project_id = data.vercel_project.piro.id
  key        = "BUCKET_ENDPOINT_URL"
  value      = local.r2_endpoint_url
  target     = ["production", "preview"]
  sensitive  = true
  comment    = "R2 S3-compatible endpoint (migrated from Backblaze B2). Managed by Terraform."
}

resource "vercel_project_environment_variable" "bucket_key_id" {
  project_id = data.vercel_project.piro.id
  key        = "BUCKET_KEY_ID"
  value      = cloudflare_account_token.r2_object_access.id
  target     = ["production", "preview"]
  sensitive  = true
  comment    = "R2 access key ID (Cloudflare token ID). Managed by Terraform."
}

resource "vercel_project_environment_variable" "bucket_application_secret" {
  project_id = data.vercel_project.piro.id
  key        = "BUCKET_APPLICATION_SECRET"
  value      = sha256(cloudflare_account_token.r2_object_access.value)
  target     = ["production", "preview"]
  sensitive  = true
  comment    = "R2 secret access key (SHA-256 of the Cloudflare token value). Managed by Terraform."
}

import {
  to = vercel_project_environment_variable.bucket_endpoint_url
  id = "${data.vercel_project.piro.id}/M90RfvAkeXwqJaFC"
}

import {
  to = vercel_project_environment_variable.bucket_key_id
  id = "${data.vercel_project.piro.id}/oElnkxyUBtoTtJXb"
}

import {
  to = vercel_project_environment_variable.bucket_application_secret
  id = "${data.vercel_project.piro.id}/KHEYQaggBmq3erEf"
}

output "vercel_project_id" {
  description = "The Vercel project Piro runs in."
  value       = data.vercel_project.piro.id
}
