# Contributing to Piro

## Admin Only

The following command creates a deployment record for a model. The API infers
whether the authenticated user is an admin from the API key; do not pass an
admin scope flag from the CLI.

```bash
piro models deploy <model-id>
```

This records the deployment only. Runtime placement, including assigning an
H100 node, is intentionally deferred.
