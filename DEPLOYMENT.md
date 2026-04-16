# UFS Newsletter — Deployment Guide

## Live URL

**Production:** https://ufs-newsletter-ufs.vercel.app

**Login:** username `admin` / password `admin123!`

---

## Architecture

| Layer | Technology | Notes |
|---|---|---|
| Frontend + API | Next.js 16 (dashboard/) | Self-contained — handles all routes |
| Database | Supabase PostgreSQL | Free tier, shared project |
| Hosting | Vercel (venkat's projects) | Auto-deploys from GitHub main |
| Auth | Session cookie | JWT, configured via env vars |

---

## Accounts

| Service | Account |
|---|---|
| Vercel | venakat@unitedffs.com (venkat's projects) |
| GitHub | venakat-ufs/newsletter |
| Supabase | Project ID: irnmsoaqxjadmecinmoc |

---

## Database

Supabase project `irnmsoaqxjadmecinmoc` (ap-southeast-1 / Mumbai).

**Newsletter tables created** (existing tables untouched):
- `newsletters`
- `drafts`
- `articles`
- `approval_logs`

Tables are created via `dashboard/scripts/db-prepare.mjs` on every deploy using `CREATE TABLE IF NOT EXISTS` — safe and idempotent.

---

## Environment Variables (set in Vercel)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase connection pooler (port 6543, pgbouncer=true) |
| `DIRECT_URL` | Supabase session pooler (port 5432, for DB setup) |
| `AUTH_USERNAME` | Dashboard login username |
| `AUTH_PASSWORD` | Dashboard login password |
| `AUTH_SESSION_SECRET` | JWT signing secret |
| `OPENAI_API_KEY` | AI draft generation |
| `GROK_API_KEY` | Grok data source |
| `NEWS_API_KEY` | NewsAPI data source |
| `FRED_API_KEY` | Federal Reserve economic data |
| `ZILLOW_RAPIDAPI_KEY` | Zillow housing data |
| `MAILCHIMP_API_KEY` | Newsletter sending |
| `MAILCHIMP_SERVER_PREFIX` | Mailchimp region (e.g. us10) |
| `SMTP_HOST` | Email notifications (smtp.gmail.com) |
| `SMTP_USER` | SMTP sender address |
| `SMTP_PASS` | SMTP app password |
| `REVIEWER_EMAIL` | Who receives draft review emails |

---

## Redeploy

Any push to `main` on GitHub triggers an automatic Vercel redeploy.

To redeploy manually from CLI:
```bash
cd "ufs-newsletter"
vercel --prod --yes
```

Make sure you're logged in as `venakat@unitedffs.com`:
```bash
vercel whoami   # should show venakat-2995
vercel login venakat@unitedffs.com   # if not logged in
```

---

## Repo Structure

```
ufs-newsletter/
├── dashboard/          # Next.js app (the deployable unit)
│   ├── src/app/        # Pages and API routes
│   ├── src/server/     # Business logic (sources, workflow, AI)
│   ├── prisma/         # Schema (PostgreSQL) + migrations
│   └── scripts/
│       └── db-prepare.mjs   # Creates DB tables on deploy
├── api/                # Python FastAPI (local dev only, not on Vercel)
├── data/               # Local SQLite (dev only, gitignored)
└── DEPLOYMENT.md       # This file
```

---

## Supabase Connection Strings

```
# Runtime queries (pooler transaction mode)
DATABASE_URL=postgresql://postgres.irnmsoaqxjadmecinmoc:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# DB setup on deploy (pooler session mode)
DIRECT_URL=postgresql://postgres.irnmsoaqxjadmecinmoc:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

Password: stored in Vercel env vars (Supabase → Project Settings → Database).

---

## Troubleshooting

**404 NOT_FOUND on vercel.app URL**
The `ufs-newsletter-steel.vercel.app` alias was claimed by a different Vercel account. Use `ufs-newsletter-ufs.vercel.app` instead.

**Build fails: "Can't reach database server"**
The `DIRECT_URL` must use the Supabase **connection pooler** host (`pooler.supabase.com`), not the direct DB host (`db.supabase.co`). The direct host is blocked by Vercel's build servers.

**Build fails: "P3005 database schema is not empty"**
Do NOT use `prisma migrate deploy` on this project — the Supabase instance has existing tables from other projects. The `db-prepare.mjs` script handles table creation safely.

**Tables dropped accidentally**
Do NOT run `prisma db push` — it drops tables not in the Prisma schema. Only `db-prepare.mjs` (via `npm run db:prepare`) is safe to run.
