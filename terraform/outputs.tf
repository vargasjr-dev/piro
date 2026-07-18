output "public_ingress_tunnel_id" {
  description = "Cloudflare Tunnel ID for the shared public ingress tunnel."
  value       = module.public_ingress.tunnel_id
}

output "public_ingress_hostname" {
  description = "Public hostname routed through the shared public ingress tunnel."
  value       = module.public_ingress.hostname
}

output "public_ingress_tunnel_token" {
  description = "Sensitive token used to install cloudflared on the Mac mini."
  value       = module.public_ingress.tunnel_token
  sensitive   = true
}
