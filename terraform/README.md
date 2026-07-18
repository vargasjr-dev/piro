# Piro infrastructure

Piro uses one HCP Terraform workspace for the infrastructure managed by this
repository:

```text
GitHub repository: vargasjr-dev/piro
Terraform root:    terraform/
HCP workspace:     piro
```

The root configuration currently manages zero resources. Provider plugins are
declared and configured for discovery/import work, but no production resource is
created or changed by this foundation.

## HCP Terraform workflow

Use the **VCS-driven workflow**:

1. Create or use an HCP Terraform organization.
2. Create a workspace named `piro`.
3. Connect it to the `vargasjr-dev/piro` GitHub repository.
4. Set the Terraform working directory to:

   ```text
   terraform
   ```

5. Set automatic run triggering to the `terraform/` path.
6. Set the workspace Terraform version to `1.15.8` (or another compatible
   Terraform 1.x version).
7. Set the apply method to **Manual apply** while importing existing resources.
8. Configure provider credentials as sensitive HCP Terraform workspace variables
   (never commit them to Git).
9. Open a pull request and confirm HCP Terraform posts a speculative plan.

HCP Terraform's VCS workflow fetches configuration from GitHub and automatically
queues plans for relevant commits and pull requests. The `terraform/` working
directory keeps Terraform configuration isolated from the Next.js application
while preserving one workspace and one state for the repository.

## One workspace, organized configuration

All Piro infrastructure belongs in this root module. Use child modules and
clear naming inside it as the configuration grows, rather than creating more
HCP workspaces:

```text
terraform/
  main.tf
  providers.tf
  variables.tf
  cloudflare.tf
  stripe.tf
  storage.tf
  telemetry.tf
  modules/
    telemetry/
```

The one-workspace policy means Cloudflare, Stripe, storage, and telemetry share
one state and one approval boundary. Keep production/test distinctions in
provider aliases and explicit resource configuration, not additional HCP
workspaces.

## Safety boundaries

Terraform should manage durable infrastructure metadata and configuration. It
should not manage:

- Stripe customers, subscriptions, invoices, charges, or payment methods
- Uploaded objects, model weights, datasets, or telemetry event rows
- Application database records
- Secrets committed to Git

Store provider credentials as sensitive HCP Terraform workspace variables. The
current provider configuration expects:

- `CLOUDFLARE_API_TOKEN` for Cloudflare
- `B2_APPLICATION_KEY_ID` and `B2_APPLICATION_KEY` for Backblaze B2
- Sensitive Terraform variable `stripe_test_api_key` for Stripe test mode
- Sensitive Terraform variable `stripe_live_api_key` for Stripe live mode

Keep Terraform state in HCP Terraform; never commit `.tfstate`, plan files,
provider credentials, or HCP tokens.

## Planned adoption order

1. Import Cloudflare DNS and account resources.
2. Import Backblaze bucket metadata only.
3. Import Stripe test product, price, and webhook configuration.
4. Import Stripe live product, price, and webhook configuration.
5. Create the R2 destination bucket and telemetry infrastructure.
6. Migrate Backblaze objects to R2 with a transfer tool, not Terraform.
7. Add the application telemetry producers and event contracts.
