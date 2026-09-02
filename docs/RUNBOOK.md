# Demo operations runbook

## Supported runtime

- Node.js 22.23.2 (see `.nvmrc`)
- Exact JavaScript dependencies are pinned by `package-lock.json`.

## Verify a release

1. Run `npm ci`.
2. Run `npm run check`.
3. Serve `dist/` from an HTTPS static host that honors `public/_headers`.
4. Confirm the site makes no third-party network requests.
5. Confirm the sample-data banner is visible and no OAuth controls are present.

## Recovery

- UI crash: reload through the error boundary prompt.
- Corrupt or incompatible local state: loading fails safely to sample defaults.
- User-requested wipe: select **Reset sample data** in the sidebar.
- Never add provider credentials to source, browser storage, build variables exposed to Vite, or repository files.
