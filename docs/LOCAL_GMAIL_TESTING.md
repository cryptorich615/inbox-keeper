# Free local Gmail testing

This path keeps PostgreSQL, the application, OAuth token envelopes, and test traffic on this computer. It costs nothing and is intended for one allowlisted test account only.

## Prepared locally

- PostgreSQL listens on `127.0.0.1:5432` only.
- Database `inbox_keeper_local` is owned by the dedicated non-superuser role `inbox_keeper_local`.
- Generated database and envelope-key material is under `.local-secrets/` with directory mode `0700` and file mode `0600`.
- The local envelope key is acceptable for single-machine testing, but it is not a substitute for managed KMS, rotation, backups, or production access controls.

## Google Console steps

1. Create or select a dedicated test Google Cloud project.
2. Enable the Gmail API.
3. Configure the OAuth consent screen as **External** and **Testing**.
4. Add only the disposable/test Gmail account under **Test users**.
5. Create an OAuth client of type **Web application**.
6. Add the exact authorized JavaScript origin `http://127.0.0.1:8080`.
7. Add the exact redirect URI `http://127.0.0.1:8080/api/oauth/callback`.
8. Keep publishing status in Testing. Do not add real users yet.

Never paste the client values into chat or a command. From a local interactive terminal, run:

```bash
cd /home/cryptorixh/.openclaw/workspace/email-cleanup
npm run local:oauth:configure
```

The prompts hide both inputs and store them in permission-restricted local files. Then run `npm run local:verify`. This verifies PostgreSQL and local encryption without contacting Google or initiating login.

After those checks pass, start the dedicated local-live application with `npm run local:live` and open `http://127.0.0.1:8080`. This entrypoint serves the frontend and BFF from one origin, binds only to loopback, uses PostgreSQL and the permission-restricted local envelope key, and keeps Google tokens server-side. Demo mode remains available separately through `npm run dev` plus `npm run server`.

The first connection asks only for Gmail metadata. Enable cleanup separately only after reviewing the interface. Cleanup uses Gmail Trash/untrash; no permanent-delete endpoint exists. The local key file is for single-machine testing only and must never be reused for a hosted deployment.
