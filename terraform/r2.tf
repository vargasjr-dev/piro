locals {
  r2_bucket_name     = "piro-kb"
  r2_jurisdiction    = "default"
  r2_endpoint_url    = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
  r2_bucket_resource = "com.cloudflare.edge.r2.bucket.${var.cloudflare_account_id}_${local.r2_jurisdiction}_${cloudflare_r2_bucket.knowledge_base.name}"
}

resource "cloudflare_r2_bucket" "knowledge_base" {
  account_id   = var.cloudflare_account_id
  name         = local.r2_bucket_name
  jurisdiction = local.r2_jurisdiction

  lifecycle {
    prevent_destroy = true
  }
}

data "cloudflare_account_api_token_permission_groups_list" "r2_object_read" {
  account_id = var.cloudflare_account_id
  name       = "Workers R2 Storage Bucket Item Read"
}

data "cloudflare_account_api_token_permission_groups_list" "r2_object_write" {
  account_id = var.cloudflare_account_id
  name       = "Workers R2 Storage Bucket Item Write"
}

locals {
  r2_object_read_permission_group_id  = one(data.cloudflare_account_api_token_permission_groups_list.r2_object_read.result).id
  r2_object_write_permission_group_id = one(data.cloudflare_account_api_token_permission_groups_list.r2_object_write.result).id
}

resource "cloudflare_account_token" "r2_object_access" {
  account_id = var.cloudflare_account_id
  name       = "piro-kb-r2-object-access"

  policies = [
    {
      effect = "allow"
      permission_groups = [
        { id = local.r2_object_read_permission_group_id },
        { id = local.r2_object_write_permission_group_id },
      ]
      resources = jsonencode({
        (local.r2_bucket_resource) = "*"
      })
    },
  ]
}

output "r2_bucket_name" {
  description = "The R2 bucket used by Piro."
  value       = cloudflare_r2_bucket.knowledge_base.name
}

output "r2_endpoint_url" {
  description = "The S3-compatible R2 endpoint for Piro."
  value       = local.r2_endpoint_url
}
