variable "account_id" {
  description = "Cloudflare account ID that owns the tunnel."
  type        = string
}

variable "zone_id" {
  description = "Cloudflare zone ID that owns the public hostname."
  type        = string
}

variable "tunnel_name" {
  description = "Human-readable name for the remotely managed Cloudflare Tunnel."
  type        = string
}

variable "hostname" {
  description = "Public hostname served by the tunnel."
  type        = string
}

variable "origin_service" {
  description = "Origin service URL reached by cloudflared on the connector host."
  type        = string
}
