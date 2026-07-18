# Piro infrastructure

Piro's durable infrastructure configuration lives under this top-level
`/infra` directory in the application monorepo.

Terraform state is stored in HCP Terraform. Terraform configuration remains in
GitHub, with each HCP workspace pointed at the appropriate root directory.

## Phase 1

Phase 1 uses an empty `foundation` root to verify HCP Terraform connectivity
without touching production. See `foundation/README.md` for setup steps.

The next imports should be performed one system at a time:

1. Cloudflare DNS and account resources.
2. Backblaze bucket metadata only.
3. Stripe test product, price, and webhook configuration.
4. Stripe live product, price, and webhook configuration.
5. R2 destination bucket and telemetry infrastructure.
6. Backblaze-to-R2 object migration with a transfer tool, not Terraform.

Terraform should manage infrastructure metadata and configuration. It should
not manage customer records, subscriptions, uploaded objects, model weights,
training datasets, or telemetry event rows.
