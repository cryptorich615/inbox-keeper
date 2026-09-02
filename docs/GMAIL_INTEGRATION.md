# Gmail integration security boundary

The repository includes a same-origin TypeScript BFF, a real Google OAuth/Gmail adapter, encrypted token-envelope interfaces, a durable job model, and mocked HTTP tests. **Live Gmail is disabled by default.** The safe demo entrypoint refuses live startup until a deployment supplies a reviewed production KMS and durable database. The browser never receives Google access or refresh tokens.

## Google Cloud setup (future live phase)

1. Create a dedicated Google Cloud project and OAuth web application.
2. Configure the exact production origin and callback, for example `https://your-domain.example/api/oauth/google/callback`. Do not use wildcards.
3. Request `openid email gmail.metadata` first. Request `gmail.modify` only after the user explicitly enables cleanup.
4. Complete Google OAuth verification, privacy-policy, data-deletion, and restricted/sensitive-scope requirements before public use.

## Credential entry

OAuth configuration must be supplied by the deployment host's secret manager as secret references. Token data keys are envelope-encrypted by a managed KMS implementation supplied to `createLiveGoogleRuntime`. Never enter secrets in chat, commit them, embed them in the frontend, place them in URLs, or pass them as command-line arguments. `FakeTestKms` is tests-only and the live runtime rejects it.

## Required production controls

- Authorization-code OAuth with PKCE S256 and one-use state bound to an HttpOnly, Secure, SameSite=Lax, host-only server session.
- Same-origin BFF, strict Origin and CSRF checks on mutations, short session lifetime, session rotation after OAuth.
- Encrypted server-side refresh-token storage using a managed KMS/secret-encryption key; no local-memory token repository in production.
- Metadata-only sync. Do not store message bodies or attachments.
- Explicit-ID, expiring cleanup previews; server-side typed confirmation for large batches; `Idempotency-Key` on every mutation.
- Re-fetch current metadata and protected rules immediately before each Trash chunk. There is no permanent-delete endpoint.
- Durable per-item job state, partial/unknown reconciliation, audit retention, provider quotas, exponential backoff, and restore retry.
- Disconnect revokes Google authorization where possible. Delete-data removes tokens, sessions, cached metadata, rules, jobs, and audit records according to the published retention policy.

## Current safe BFF

Run `npm run server`. It binds to `127.0.0.1:8787`. Vite proxies `/api` to it during local development. Demo mode includes session/CSRF bootstrap, status, metadata sync, server-owned protections, expiring previews, idempotent Trash/restore jobs, disconnect, and delete-data routes. The Google adapter is covered only by mocked HTTP tests; the demo never contacts Google.

## External production blockers

Supply a managed KMS adapter, durable managed database, queue/scheduler for reconciliation, and production reverse proxy that preserves the documented security headers. Complete Google OAuth verification, privacy/data-deletion pages, domain verification, legal review, backups, monitoring/redaction review, load testing, and incident-response testing. Do not enable a real account before those controls are independently reviewed in the deployment environment.
