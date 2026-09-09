variable "stripe_test_api_key" {
  description = "Stripe test-mode restricted or secret API key, supplied by HCP Terraform."
  type        = string
  sensitive   = true
  nullable    = true
  default     = null
}

variable "stripe_live_api_key" {
  description = "Stripe live-mode restricted or secret API key, supplied by HCP Terraform."
  type        = string
  sensitive   = true
  nullable    = true
  default     = null
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID used for R2 infrastructure."
  type        = string
  nullable    = false
  default     = "86a058d54a5266257c8e1814c4d9b656"
}
