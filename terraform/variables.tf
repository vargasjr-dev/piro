variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS and Cloudflare Tunnel read/write permissions."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns the public ingress tunnel."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the public hostname."
  type        = string
}

variable "cloudflare_tunnel_name" {
  description = "Stable, human-readable name for the shared public ingress tunnel."
  type        = string
  default     = "vargasjr-mac-mini"
}

variable "cloudflare_tunnel_hostname" {
  description = "Public hostname routed through the shared Cloudflare Tunnel."
  type        = string
  default     = "assistant.vargasjr.dev"
}

variable "cloudflare_tunnel_origin_service" {
  description = "Local service URL served by cloudflared on the Mac mini."
  type        = string
  default     = "http://127.0.0.1:7830"
}
