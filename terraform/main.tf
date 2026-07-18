terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  cloud {
    # Replace this value with the HCP Terraform organization slug before
    # connecting the repository workspace.
    organization = "REPLACE_WITH_HCP_ORGANIZATION"

    workspaces {
      name = "piro"
    }
  }
}
