# Gmail staging deployment

The repository is prepared for a secure Cloud Run staging deployment, but `terraform apply`, OAuth creation, domain changes, secret creation, and billing remain operator-approved actions.

## Recommended cost-sensitive stack

- Cloud Run with zero minimum instances and a two-instance staging cap.
- Cloud KMS for token-envelope data keys.
- Secret Manager references for the OAuth client secret and database connection string.
- Cloud Scheduler for bounded reconciliation. Cloud Tasks is intentionally not provisioned until a per-user dispatcher exists.
- PostgreSQL. A small managed external PostgreSQL staging database is usually the cheapest start; Cloud SQL is the all-GCP option.
- Artifact Registry and Cloud Build for immutable images.

Expected light-use staging cost is approximately **$0–$10/month** when using a low-cost PostgreSQL provider. Cloud SQL commonly raises that to about **$12–$35/month**, with a conservative ceiling near **$60/month** depending on instance size, backups, logs, and traffic. Verify current provider pricing before applying.

## Secure setup sequence

1. Choose a dedicated non-production Google Cloud project with billing alerts and a hard operational budget.
2. Verify the staging domain and create the OAuth consent screen. Use the exact callback `https://<staging-domain>/api/oauth/callback`.
3. Create the OAuth client secret directly in Google Cloud. Store it in Secret Manager. Never put it in chat, source, Terraform state, URLs, or command arguments.
4. Create PostgreSQL with TLS required, backups enabled, and a least-privilege role. Store its connection string in Secret Manager.
5. Review `infra/`, run `terraform fmt`, `terraform validate`, and inspect a saved plan. Do not apply until costs, domain, service accounts, and deletion protection are approved.
6. Build through Cloud Build and deploy an immutable image digest, never a mutable `latest` tag.
7. Confirm the runtime service account can access only the two named secrets and encrypt/decrypt on the single token key.
8. Run migrations as a controlled release step, then validate `/healthz` and `/readyz`.
9. Verify CSP, HSTS at the edge, secure cookies, same-origin requests, OIDC task calls, logging redaction, backups/restore, disconnect/revocation, and reconciliation.
10. Keep OAuth in test mode with a short allowlist until final security review passes. Request `gmail.modify` only through explicit cleanup elevation.

The production entrypoint refuses startup unless production/live modes, HTTPS origins, the exact callback, PostgreSQL, KMS, Secret Manager, and task identity references are present. Application Default Credentials / Workload Identity are required; service-account key files are unsupported.

## Remaining external actions

DNS mapping, OAuth app creation/review, database procurement, billing, and secret entry require operator approval. The scheduler currently invokes the authenticated reconciliation worker directly; larger workloads should add a per-user Cloud Tasks dispatcher.
