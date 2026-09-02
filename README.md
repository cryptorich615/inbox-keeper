# Inbox Keeper

A Gmail cleanup tool that groups your inbox by brand and category, protects the senders you care about, and moves the rest to Trash — with preview, restore, and a full audit log. Never deletes permanently.

## Features

- **Brand grouping** — emails grouped by company (Lowe's, Amazon, your banks) instead of exact sender address. Subdomains like `store-042@lowes.com` and `receipts@lowes.com` collapse into one card.
- **Category lanes** — 8 lanes per brand: Receipts, Shipping, Promotions, Newsletters, Statements, Surveys, Account (default protected), Personal.
- **Protected senders & domains** — these override every bulk action. Add a sender or whole domain (`@bank.com`) and it's locked.
- **Trash-only deletion** — every bulk action moves to Gmail Trash first. You can restore anything within 30 days. No permanent delete path exists.
- **Preview before cleanup** — every bulk action shows exactly what would move, what's excluded (protected, starred), and total storage recovered.
- **Sort by storage size or message count** — see who's eating your space at a glance.
- **Expandable sender cards** — click any sender to see individual messages and select/deselect each one.
- **Dark mode** — system, light, dark.
- **Read-only and cleanup modes** — start read-only (no Gmail mutation), upgrade to cleanup with explicit consent.

## Prerequisites

- Node.js 22+
- PostgreSQL 14+
- A Google Cloud project with the Gmail API enabled

## Setup

1. **Clone and install:**

   ```bash
   git clone https://github.com/cryptorich615/inbox-keeper.git
   cd inbox-keeper
   npm install
   ```

2. **Create a local PostgreSQL database:**

   ```bash
   createdb inbox_keeper
   ```

3. **Set up Google OAuth:**

   a. Go to https://console.cloud.google.com/
   b. Create a new project
   c. Enable the **Gmail API**
   d. Open **Google Auth Platform** and configure the OAuth consent screen:
      - Audience: **External**
      - Publishing status: **Testing**
      - Add your Google account as a test user
   e. Create an OAuth client:
      - Application type: **Web application**
      - Authorized JavaScript origin: `http://127.0.0.1:8080`
      - Authorized redirect URI: `http://127.0.0.1:8080/api/oauth/callback`

4. **Configure local secrets:**

   ```bash
   mkdir -p .local-secrets
   chmod 700 .local-secrets
   echo "DATABASE_URL=postgresql://localhost:5432/inbox_keeper" > .local-secrets/database.env
   chmod 600 .local-secrets/database.env

   # You'll be prompted for each value; they won't echo to the terminal
   bash scripts/local/configure-google-oauth.sh
   ```

   The script will ask for your Google OAuth client ID and client secret. Both are stored in `.local-secrets/` with `0600` permissions. **Never commit `.local-secrets/`** — it's already in `.gitignore`.

5. **Build and run:**

   ```bash
   npm run build
   bash scripts/local/run-live.sh
   ```

   The app will be live at **http://127.0.0.1:8080**.

6. **Connect Gmail:**

   Open the app, click **Connect Gmail read-only**, approve the OAuth prompt. After the read-only sync completes, you can optionally click **Enable cleanup permission** to allow moving messages to Trash.

## Security

- The app binds to **127.0.0.1** only — never accessible from the network.
- OAuth tokens are encrypted at rest using a local file-based KMS.
- Every bulk action requires explicit confirmation.
- Protected senders and starred messages are excluded from bulk actions.
- No permanent deletion — all moves go to Gmail Trash.
- Audit log records every action with timestamp, affected count, and skipped reasons.

## Development

```bash
npm test          # Run the test suite
npm run build     # Build frontend + backend
npm run check     # Tests + build + security audit
```

## License

Private — for personal use by the owner and invited testers.
