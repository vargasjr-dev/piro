# Piro foundation workspace

This is the Phase 1 HCP Terraform root configuration. It intentionally manages
zero infrastructure resources. Its purpose is to prove that the repository,
HCP Terraform workspace, remote state, and remote runs are wired correctly
before we import live resources.

## HCP Terraform setup

1. Create a free HCP Terraform organization, or use an existing one.
2. Create a workspace named `piro-foundation-prod`.
3. Connect it to `vargasjr-dev/piro` using the GitHub VCS workflow.
4. Set the workspace working directory to:

   ```text
   infra/terraform/foundation
   ```

5. Replace `REPLACE_WITH_HCP_ORGANIZATION` in `main.tf` with the organization
   slug. Commit that change.
6. Set the workspace Terraform version to `1.9.x` or newer.
7. Run a speculative plan from the workspace. It should report no resource
   changes.

For local CLI-driven runs, install Terraform and authenticate with:

```bash
terraform login
cd infra/terraform/foundation
terraform init
terraform plan
```

HCP Terraform stores the state remotely in the workspace. Do not add a local
backend, commit `.tfstate`, or put provider credentials in this repository.

## Why this is a separate root

HCP Terraform workspaces map cleanly to root configurations. Future systems
should get their own root and workspace rather than sharing one state file:

```text
infra/terraform/
  foundation/       # this phase
  cloudflare/prod/  # DNS, zones, account resources
  stripe/test/      # test-mode catalog and webhooks
  stripe/live/      # live-mode catalog and webhooks
  storage/prod/     # Backblaze during migration, then R2
  telemetry/prod/   # R2/Pipelines/Iceberg telemetry lake
```
