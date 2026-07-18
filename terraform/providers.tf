terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.22"
    }

    stripe = {
      source  = "stripe/stripe"
      version = "0.3.0-beta.3"
    }

    b2 = {
      source  = "Backblaze/b2"
      version = "~> 0.13"
    }
  }
}

provider "cloudflare" {
  # Authentication is supplied through the CLOUDFLARE_API_TOKEN workspace
  # variable. No credential is stored in this repository.
}

provider "b2" {
  # Authentication is supplied through B2_APPLICATION_KEY_ID and
  # B2_APPLICATION_KEY workspace variables.
}

provider "stripe" {
  alias   = "test"
  api_key = var.stripe_test_api_key
}

provider "stripe" {
  alias   = "live"
  api_key = var.stripe_live_api_key
}
