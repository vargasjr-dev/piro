# Cloudflare Tunnel module

This module manages the Cloudflare-side resources for a remotely managed
`cloudflared` tunnel:

- The tunnel itself.
- Its remotely managed ingress configuration.
- A catch-all `404` ingress rule.
- The proxied CNAME record for the public hostname.
- The sensitive connector token used to run `cloudflared` on the origin host.

The origin process is intentionally outside Terraform. Install and supervise
`cloudflared` on the Mac mini separately, using the token exposed through HCP
Terraform after an approved apply.
