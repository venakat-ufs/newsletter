Single-server Next.js application for the UFS newsletter workflow.

## Run

From the repo root:

```bash
npm run dev
```

Open `http://localhost:3000`.

The app now serves both the UI and API routes from the same Next server. The old Python API and Docker split are no longer required for local development.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test:e2e
npm run db:push
```

## Environment

Secrets are loaded from the repo-root `.env`. Copy `.env.example` and fill in the integrations you want to enable.

Auth settings:
- `AUTH_USERNAME`
- `AUTH_PASSWORD`
- `AUTH_SESSION_SECRET`

Supported integrations:
- OpenAI
- Reddit public JSON or Reddit app credentials
- News API
- Grok
- Mailchimp
- SMTP reviewer email
- Mock fixtures for Zillow, foreclosure, and news where configured

## Storage

Local state is stored in SQLite at `data/ufs-newsletter.db`.

On first boot, the app imports the legacy `data/ufs-newsletter.json` file into SQLite if the database is empty.
