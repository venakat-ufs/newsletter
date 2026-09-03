# Prospect /join Landing Page — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Intercept prospect newsletter CTAs with a context-aware `/join` landing page that explains registration value, then routes to `clients.unitedffs.com/register/client`.

**Architecture:** Single public Next.js server-rendered page at `/join` reads an allowlisted `?from=` param and maps it to context-specific copy. Proxy middleware is patched to bypass auth for this route. `applyCtaVariant` in `workflow.ts` is updated to point prospect CTAs at `/join?from=<key>` instead of directly to `/register/client`. No client JS, no DB access, no user data collected.

**Tech Stack:** Next.js 16 App Router (server component), Tailwind CSS, existing portal design tokens.

---

### Task 1: Create `/join` page

**Files:**
- Create: `dashboard/src/app/join/page.tsx`

- [ ] Write `JoinPage` server component with allowlisted `from` param, content map, newsletter-theme layout

### Task 2: Add `/join` to public paths

**Files:**
- Modify: `dashboard/src/proxy.ts`

- [ ] Add `pathname === "/join"` check inside `isPublicPath()`

### Task 3: Update `applyCtaVariant` for prospects

**Files:**
- Modify: `dashboard/src/server/workflow.ts`

- [ ] Add 4th param `insightsBaseUrl?: string` to `applyCtaVariant`
- [ ] Map section_type → `?from=` key for prospect variant
- [ ] Pass `settings.appPublicUrl` at the call site for prospect send

### Task 4: Typecheck

- [ ] `npx tsc --noEmit` inside `dashboard/`
- [ ] Fix any errors
