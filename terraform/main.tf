terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  cloud {
    organization = "vargasjr-dev"

    workspaces {
      name = "piro"
    }
  }
}
