resource "github_actions_environment_secret" "r2_endpoint_url" {
  repository      = "piro"
  environment     = "production-migrations"
  secret_name     = "S3_ENDPOINT_URL"
  plaintext_value = local.r2_endpoint_url
}

resource "github_actions_environment_secret" "r2_access_key_id" {
  repository      = "piro"
  environment     = "production-migrations"
  secret_name     = "S3_ACCESS_KEY_ID"
  plaintext_value = cloudflare_account_token.r2_object_access.id
}

resource "github_actions_environment_secret" "r2_secret_access_key" {
  repository      = "piro"
  environment     = "production-migrations"
  secret_name     = "S3_SECRET_ACCESS_KEY"
  plaintext_value = sha256(cloudflare_account_token.r2_object_access.value)
}
