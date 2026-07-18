# Read-only discovery for the first Cloudflare adoption pass. These data
# sources inspect existing infrastructure without adding resources to state.
data "cloudflare_accounts" "available" {
  direction = "asc"
}

data "cloudflare_zones" "available" {
  direction = "asc"
}

locals {
  cloudflare_accounts = {
    for account in data.cloudflare_accounts.available.result : account.id => {
      name = account.name
      type = account.type
    }
  }

  cloudflare_zones = {
    for zone in data.cloudflare_zones.available.result : zone.id => {
      name       = zone.name
      account_id = zone.account.id
      status     = zone.status
      type       = zone.type
    }
  }
}

output "cloudflare_inventory" {
  description = "Read-only Cloudflare account and zone inventory for the adoption review."
  value = {
    accounts = local.cloudflare_accounts
    zones    = local.cloudflare_zones
  }
}
