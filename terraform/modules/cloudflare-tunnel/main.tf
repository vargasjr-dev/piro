resource "cloudflare_zero_trust_tunnel_cloudflared" "this" {
  account_id = var.account_id
  name       = var.tunnel_name
  config_src = "cloudflare"
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "this" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.this.id
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "this" {
  account_id = var.account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.this.id
  source     = "cloudflare"

  config = {
    ingress = [
      {
        hostname = var.hostname
        service  = var.origin_service
      },
      {
        service = "http_status:404"
      },
    ]
  }
}

resource "cloudflare_dns_record" "this" {
  zone_id = var.zone_id
  name    = var.hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.this.id}.cfargotunnel.com"
  ttl     = 1
  proxied = true
}
