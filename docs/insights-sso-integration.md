# UFS Insights Portal
## SSO Integration Guide — clients-unitedffs Team
**v1.2 · May 2026**

---

## Overview

This document covers everything needed to embed seamless, single sign-on (SSO) access to the UFS Insights portal inside the clients-unitedffs Next.js application.

When a client clicks "View Insights", they are taken directly into the latest issue's listings page — no separate login, no extra steps. Their session from clients-unitedffs carries over automatically.

**What you need: one environment variable and one utility function. Nothing else.**

---

## 1. Environment Variable

Add this to your environment variables (`.env.local` for local dev, or your EC2/ECS/Elastic Beanstalk environment config for production). Never commit it to Git or expose it in client-side code.

| Variable Name | Value |
|---|---|
| `INSIGHTS_SSO_SECRET` | `18ad762aaa6fb0f13fb2241b0649f03b9c91c7f605258489bf120d080e0e2e55` |

> **Important:** Do NOT prefix this with `NEXT_PUBLIC_`. It must be server-side only.

---

## 2. Utility Function

Create the file `lib/insights-sso.ts` in your Next.js project and paste the following. No additional npm packages required — `crypto` is a Node.js built-in.

```ts
// lib/insights-sso.ts
import { createHmac } from 'crypto';

const BASE_URL = 'https://insights.unitedffs.com';

export function getInsightsUrl(
  userId: string | number,
  path = '/insights/latest'
): string {
  const secret = process.env.INSIGHTS_SSO_SECRET;
  if (!secret) throw new Error('INSIGHTS_SSO_SECRET is not set');

  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  const payload = `${userId}|${expiresAt}`;
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const token = encodeURIComponent(`${payload}|${signature}`);
  return `${BASE_URL}${path}?token=${token}`;
}
```

---

## 3. NextAuth Session — Expose User ID

> **Read this before implementing.** By default, NextAuth v4 JWT sessions only include `name`, `email`, and `image` on `session.user`. The `id` field is **not included** unless you add it explicitly. Without this, `session.user.id` will be `undefined` and the SSO token will be broken.

Open your `authOptions` (in `app/api/auth/[...nextauth]/route.ts` or wherever it is defined) and add these callbacks if they are not already present:

```ts
// In your authOptions:
callbacks: {
  async jwt({ token, user }) {
    if (user) {
      token.id = user.id;  // persist user.id into the JWT on sign-in
    }
    return token;
  },
  async session({ session, token }) {
    if (session.user) {
      session.user.id = token.id as string;  // expose it on session.user
    }
    return session;
  },
},
```

If your `authOptions` already exposes `session.user.id`, skip this step.

You may also need to extend the NextAuth types so TypeScript accepts `session.user.id`. Create or update `types/next-auth.d.ts`:

```ts
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
```

---

## 4. Adding the View Insights Button

### Server Component (recommended)

```tsx
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getInsightsUrl } from '@/lib/insights-sso';
import { redirect } from 'next/navigation';

export default async function SomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/sign-in');

  const url = getInsightsUrl(session.user.id);

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      View Insights
    </a>
  );
}
```

### Client Component

Since `getInsightsUrl` uses a secret env var, it must run server-side. Create an API route that generates the URL and call it from the client component.

**API Route:**

```ts
// app/api/insights-url/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getInsightsUrl } from '@/lib/insights-sso';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') ?? '/insights/latest';

  const url = getInsightsUrl(session.user.id, path);
  return NextResponse.json({ url });
}
```

**Client Component:**

```tsx
'use client';

export function InsightsButton({ path = '/insights/latest' }: { path?: string }) {
  async function handleClick() {
    const res = await fetch(`/api/insights-url?path=${encodeURIComponent(path)}`);
    const { url } = await res.json();
    window.open(url, '_blank');
  }

  return (
    <button onClick={handleClick}>
      View Insights
    </button>
  );
}
```

---

## 5. Newsletter Deep-Link Routes (Important)

> **Newsletter links must NEVER point directly to `insights.unitedffs.com`.** They must go through your own `/go/*` routes so the user's session is checked and a fresh SSO token is generated. Direct links to the portal will fail for users who don't have an active SSO session.

Create these three route handlers in your Next.js app:

### `/go/insights` → Latest Listings

```ts
// app/go/insights/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getInsightsUrl } from '@/lib/insights-sso';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL('/sign-in', process.env.NEXTAUTH_URL!));
  }
  return NextResponse.redirect(getInsightsUrl(session.user.id));
}
```

### `/go/pulse` → Latest Market Pulse

```ts
// app/go/pulse/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getInsightsUrl } from '@/lib/insights-sso';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL('/sign-in', process.env.NEXTAUTH_URL!));
  }
  return NextResponse.redirect(getInsightsUrl(session.user.id, '/insights/latest/pulse'));
}
```

### `/go/news` → Latest News

```ts
// app/go/news/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getInsightsUrl } from '@/lib/insights-sso';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL('/sign-in', process.env.NEXTAUTH_URL!));
  }
  return NextResponse.redirect(getInsightsUrl(session.user.id, '/insights/latest/news'));
}
```

**Newsletter email links should use:**

| Button | URL in email |
|---|---|
| View Insights | `https://clients.unitedffs.com/go/insights` |
| More Market Pulse | `https://clients.unitedffs.com/go/pulse` |
| More News | `https://clients.unitedffs.com/go/news` |

---

## 6. Available Pages

Pass the `path` argument to `getInsightsUrl()` to deep-link to any page.

| Page | Path | Notes |
|---|---|---|
| Latest Issue — Listings **(default)** | `/insights/latest` | Always opens the most recent issue listings |
| Latest Issue — Market Pulse | `/insights/latest/pulse` | Always opens the most recent issue pulse section |
| Latest Issue — News | `/insights/latest/news` | Always opens the most recent issue news section |
| Listings Analytics | `/insights/listings/[draftId]` | Per-issue listing stats |
| News Analytics | `/insights/news/[draftId]` | Per-issue news performance |
| Market Pulse | `/insights/pulse/[draftId]` | Per-issue market pulse data |

> **Always use the `/insights/latest/*` paths** in newsletter "read more" links and buttons — they always resolve to the current issue automatically.

---

## 7. How It Works

```
1. Token Generated
   getInsightsUrl() creates a signed HMAC-SHA256 token valid for 5 minutes.

2. User Clicks Link
   The client is redirected to insights.unitedffs.com with the token in the URL.

3. Token Verified
   The portal validates the signature and checks the expiry.

4. Session Cookie Set
   An SSO cookie keeps the user authenticated for 4 hours — no re-signing needed.

5. Admin Pass-through
   If the user is already a UFS admin, they remain logged in as admin automatically.
```

---

## 8. Token Behaviour

- Tokens are valid for **5 minutes** from generation
- Tokens are **not single-use** — within the 5-minute window the same token can be reused (e.g. multiple tabs)
- After landing, the **session lasts 4 hours** — no new token needed during that time
- Always generate a **fresh token on each button click** — do not cache or store tokens

---

## 9. What You Do NOT Need

- API key
- Backend / server-side API calls to UFS
- Database access or schema changes
- Separate login page or auth flow
- Additional npm packages

---

## 10. Quick Checklist

- [ ] Add `INSIGHTS_SSO_SECRET` to your environment variables (`.env.local` / EC2 / ECS)
- [ ] Verify `session.user.id` is exposed in your NextAuth `authOptions` callbacks (Step 3)
- [ ] Create `lib/insights-sso.ts` with the utility function (Step 2)
- [ ] Add the View Insights button using server component or API route pattern (Step 4)
- [ ] Create `/go/insights`, `/go/pulse`, `/go/news` route handlers (Step 5)
- [ ] Point newsletter email links to your `/go/*` routes — never directly to insights.unitedffs.com
- [ ] Smoke test: click the button, confirm you land on the latest issue without a login prompt

---

*United Field Services — Internal Use Only*
*Questions? Reach out to the backend/infra team.*
*v1.2 · May 2026*
