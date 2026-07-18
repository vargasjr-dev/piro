module "public_ingress" {
  source = "./modules/cloudflare-tunnel"

  account_id     = var.cloudflare_account_id
  zone_id        = var.cloudflare_zone_id
  tunnel_name    = var.cloudflare_tunnel_name
  hostname       = var.cloudflare_tunnel_hostname
  origin_service = var.cloudflare_tunnel_origin_service
}
