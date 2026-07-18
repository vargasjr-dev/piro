# Piro infrastructure

Piro uses one HCP Terraform workspace for the infrastructure managed by this
repository:

```text
GitHub repository: vargasjr-dev/piro
Terraform root:    terraform/
HCP workspace:     piro
```

The root configuration is connected to the `vargasjr-dev` HCP Terraform
organization and manages organization-level infrastructure through the `piro`
workspace. The first managed resource is the shared Cloudflare Tunnel used for
public ingress to the Mac mini gateway.

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
6. Set the workspace Terraform version to `1.9.8` or newer within the pinned
   `1.x` range.
7. Set the apply method to **Manual apply** while importing existing resources.
8. Replace `REPLACE_WITH_HCP_ORGANIZATION` in `main.tf` with the organization
   slug and commit that change.
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
  outputs.tf
  modules/
    cloudflare-tunnel/
  stripe.tf
  storage.tf
  telemetry.tf
```

The one-workspace policy means Cloudflare, Stripe, storage, and telemetry share
one state and one approval boundary. Keep production/test distinctions in
provider aliases and explicit resource configuration, not additional HCP
workspaces.

## Cloudflare Tunnel

The first module manages the Cloudflare-side pieces of the shared public
ingress tunnel:

- A remotely managed Cloudflare Tunnel named `vargasjr-mac-mini`.
- A published application route for `assistant.vargasjr.dev`.
- The proxied CNAME record pointing the hostname at the tunnel.
- The connector token as a sensitive Terraform output for host bootstrap.

Terraform does not install or supervise `cloudflared` on the Mac mini. After an
approved apply, install `cloudflared` on the host and run it with the sensitive
token from HCP Terraform. Keep the existing ngrok ingress active until the
Cloudflare route has been tested; this PR does not change application webhook
URLs or `publicBaseUrl`.

The Cloudflare API token belongs in an HCP Terraform sensitive workspace
variable named `cloudflare_api_token`. The account ID, zone ID, and hostname
variables are ordinary workspace variables.

## Safety boundaries

Terraform should manage durable infrastructure metadata and configuration. It
should not manage:

- Stripe customers, subscriptions, invoices, charges, or payment methods
- Uploaded objects, model weights, datasets, or telemetry event rows
- Application database records
- Secrets committed to Git

Store provider credentials as sensitive HCP Terraform workspace variables. Keep
Terraform state in HCP Terraform; never commit `.tfstate`, plan files, provider
credentials, or HCP tokens.

## Planned adoption order

1. Create and test the shared Cloudflare Tunnel, then import existing DNS records as needed.
2. Import Cloudflare DNS and account resources.
3. Import Stripe test product, price, and webhook configuration.
4. Import Stripe live product, price, and webhook configuration.
5. Create the R2 destination bucket and telemetry infrastructure.
6. Migrate Backblaze objects to R2 with a transfer tool, not Terraform.
7. Add the application telemetry producers and event contracts.
