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
