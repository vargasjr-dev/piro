output "tunnel_id" {
  description = "Cloudflare Tunnel UUID."
  value       = cloudflare_zero_trust_tunnel_cloudflared.this.id
}

output "hostname" {
  description = "Public hostname served by the tunnel."
  value       = var.hostname
}

output "tunnel_token" {
  description = "Sensitive connector token for cloudflared."
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.this.token
  sensitive   = true
}

output "dns_record_id" {
  description = "Cloudflare DNS record ID for the tunnel hostname."
  value       = cloudflare_dns_record.this.id
}
