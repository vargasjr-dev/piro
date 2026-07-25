# Piro API boundary

The `src/app/api/` directory contains the public API route handlers, request contracts, and Modal adapter.

## Deployment boundary

- Vercel runs the thin TypeScript request handler.
- The handler authenticates the Piro API key, resolves the caller-owned model, validates `PiroInput`, and normalizes errors.
- Modal runs model loading and inference. It remains the GPU execution plane and is reached through the model's internal deployment endpoint.
- `MODAL_WEBHOOK_SECRET` is sent only from the server-side handler to Modal.

Vercel Functions are a good first deployment for this gateway because the work is request validation, database access, and one upstream HTTP call. Keep the handler near Neon and avoid loading model weights or doing long-running compute in the Vercel function. Modal should own GPU lifecycle, warm-container policy, and inference scaling.

A direct public Modal endpoint is possible, but it would move API-key validation, model access checks, rate limiting, usage accounting, and product-level error semantics into the Modal app. Keep that boundary private until those responsibilities intentionally move there. A separate API service can be introduced later if the public API needs an independent deployment lifecycle, streaming behavior, or scaling policy from the web application.
