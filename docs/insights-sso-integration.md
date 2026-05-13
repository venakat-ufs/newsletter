# UFS Insights Portal
## SSO Integration Guide — clients-unitedffs Team
**v1.1 · May 2026**

---

## Overview

This document covers everything needed to embed seamless, single sign-on (SSO) access to the UFS Insights portal inside the clients-unitedffs Next.js application.

When a client clicks "View Insights", they are taken directly into the latest issue's listings page — no separate login, no extra steps. Their session from clients-unitedffs carries over automatically.

**What you need: one environment variable and one utility function. Nothing else.**

---

## 1. Environment Variable

Add this to your Vercel (or AWS) environment variables. Never commit it to Git or expose it in client-side code.

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

## 3. Adding the View Insights Button

### Server Component (recommended)

```tsx
import { getInsightsUrl } from '@/lib/insights-sso';

export default async function SomePage() {
  const url = getInsightsUrl(currentUser.id);

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      View Insights
    </a>
  );
}
```

### Client Component

```tsx
'use client';
import { getInsightsUrl } from '@/lib/insights-sso';

export function InsightsButton({ userId }: { userId: string }) {
  async function handleClick() {
    const res = await fetch(`/api/insights-url?userId=${userId}`);
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

> **Note for client components:** Since `getInsightsUrl` uses a secret env var, it must run server-side. Create an API route (`/api/insights-url`) that calls `getInsightsUrl` and returns the URL to the client component.

### API Route (for client components)

```ts
// app/api/insights-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getInsightsUrl } from '@/lib/insights-sso';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const url = getInsightsUrl(userId);
  return NextResponse.json({ url });
}
```

---

## 4. Available Pages

Pass the `path` argument to `getInsightsUrl()` to deep-link to any page.

| Page | Path | Notes |
|---|---|---|
| Latest Issue **(default)** | `/insights/latest` | Always opens the most recent issue — use this |
| All Issues | `/insights/listings` | Index of all issues |
| Listings Analytics | `/insights/listings/[draftId]` | Per-issue listing stats |
| News Analytics | `/insights/news/[draftId]` | Per-issue news performance |
| Market Pulse | `/insights/pulse/[draftId]` | Per-issue market pulse data |

**Example — always open latest issue (recommended default):**
```ts
const url = getInsightsUrl(currentUser.id);
// defaults to /insights/latest
```

**Example — link to a specific issue:**
```ts
const url = getInsightsUrl(currentUser.id, '/insights/listings/42');
```

---

## 5. How It Works

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

## 6. Token Behaviour

- Tokens are valid for **5 minutes** from generation
- Tokens are **not single-use** — within the 5-minute window the same token can be reused (e.g. multiple tabs)
- After landing, the **session lasts 4 hours** — no new token needed during that time
- Always generate a **fresh token on each button click** — do not cache or store tokens

---

## 7. What You Do NOT Need

- API key
- Backend / server-side API calls to UFS
- Database access or schema changes
- Separate login page or auth flow
- Additional npm packages

---

## 8. Quick Checklist

- [ ] Add `INSIGHTS_SSO_SECRET` to Vercel environment variables
- [ ] Create `lib/insights-sso.ts` with the utility function
- [ ] Add the View Insights button using server component or API route pattern
- [ ] Test: click the button and confirm you land on the latest issue without a login prompt

---

*United Field Services — Internal Use Only*
*Questions? Reach out to the backend/infra team.*
*v1.1 · May 2026*
