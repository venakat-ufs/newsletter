# Mailzzy API Reference

> Saved from https://mailzzy.com/docs/ and https://mailzzy.stoplight.io/docs/mailzzy/branches/main/9i9g54aalgc95-obtain-api-access on 2026-09-02.
> Sections 1-4 are the published docs, saved as reference. Section 5 records real state confirmed live against the account (group creation, sender check) once an MCP-connected session was available — see the correction note in Section 4 for where the docs and live behavior diverged.

## Credentials

Client ID / Client Secret are **not repeated here** — they're already sitting in the local `.env` as `MAILZZY_CLIENT_ID` / `MAILZZY_CLIENT_SECRET` (and in `dashboard/src/server/env.ts`'s `mailzzyClientId`/`mailzzyClientSecret`). Manage/rotate them at `https://send.mailzzy.com/settings/client-credentials` (Admin role required).

---

## 1. Authentication — two-step token model

### Step 1: Basic Auth → obtain a bearer `authToken`

```
GET https://api.mailzzy.com/core/public/api/access
Authorization: Basic <base64(clientId:clientSecret)>
App: mailzzy
```

```bash
curl --request GET \
  --url https://api.mailzzy.com/core/public/api/access \
  --header 'Authorization: Basic <base64(clientId:clientSecret)>' \
  --header 'App: mailzzy'
```

**Response (200):**
```json
{
  "email": "mailzzy.admin@company.com",
  "authToken": "<JWT>"
}
```

- Token is a JWT. Its `exp` claim gives roughly a **73-minute** validity window in the sampled example — treat as short-lived, refetch rather than cache long-term.
- `refreshToken` field is documented as "under development and not currently required or supported" — there is no refresh flow yet, just re-run Step 1.

### Step 2: Bearer token → every other call

```
Authorization: Bearer <authToken>
```

This matches what's already implemented in `dashboard/src/server/mailchimp.ts`'s `getMailzzyToken()` / `mailzzyBasicAuth()`.

---

## 2. Contacts & Groups (plain REST — no MCP needed)

### Add a single contact to a group

```
POST https://api.mailzzy.com/crm/contact/add/group/{groupId}
Authorization: Bearer <authToken>
Content-Type: application/json
```

Body:

| Field | Type | Required |
|---|---|---|
| emailId | string | **required** |
| firstName | string | optional |
| lastName | string | optional |
| timezone | string | optional |
| address | string | optional |
| postalCode | string | optional |
| city | string | optional |
| state | string | optional |
| country | string | optional |
| contactNo | string | optional |
| tagName | string | optional |

```bash
curl --request POST \
  --url https://api.mailzzy.com/crm/contact/add/group/123 \
  --header 'Authorization: Bearer <authToken>' \
  --header 'Content-Type: application/json' \
  --data '{
  "firstName": "Mailzzy",
  "lastName": "Mailzzy",
  "emailId": "mailzzy.admin@company.com",
  "timezone": "(GMT-04:00) America/New York",
  "address": "47 W 13th St, New York, NY 10011, USA",
  "postalCode": "12345",
  "city": "New York",
  "state": "NY",
  "country": "USA",
  "contactNo": "+1 (305) 555-5555",
  "tagName": "usa_contact"
}'
```

Response: `{ "message": "Your new contact has been added successfully.", "code": 200 }`

### Contact group names — count

```
POST https://api.mailzzy.com/crm/contact/fetch/all/contact-groups/count
Authorization: Bearer <authToken>
```
Body: `{ "searchText": "" }` (optional filter) → response is a bare number, e.g. `6`.

### Contact group names — list (paged)

```
POST https://api.mailzzy.com/crm/contact/fetch/all/contact-groups/page/{pageNo}/limit/{limit}
Authorization: Bearer <authToken>
```
Body: `{ "searchText": "test" }` (optional) → response:
```json
[
  { "ID": 407, "NAME": "for sms 2" },
  { "ID": 402, "NAME": "kk sms test - 20th aug" }
]
```

**Note:** These are the only documented REST group/contact endpoints — there is **no REST endpoint for bulk contact import or for creating a group.** Group creation **is** possible, just not via REST — see the corrected MCP tool list below (`mcp_crm_groups_create`), confirmed working live on 2026-09-02. Bulk contact import still has no confirmed working path as of this writing.

---

## 3. Email

### Media upload

```
POST https://api.mailzzy.com/crm/secure/email/upload
Authorization: Bearer <authToken>
Content-Type: multipart/form-data
```
Field: `file` — allowed extensions `doc, docx, txt, pdf, png, jpeg, jpg, gif, xlsx, xls, csv`; 10MB per file, 20MB combined per request.

Response: `{ "message": "attachments/image.png", "code": 200 }`

### Submit transactional email (single recipient)

```
POST https://api.mailzzy.com/crm/transactionEmail/add/submit
Authorization: Bearer <authToken>
Content-Type: application/json
```

| Field | Type | Required |
|---|---|---|
| displayName | string | **required** |
| mailSubject | string | **required** |
| mailContent | string (HTML) | **required** |
| fromId | string | **required** — sender email |
| mailTo | array\<string\> | **required** — "one supported currently" |
| domain | string | **required** — verified sending domain |
| attachmentFileNames | object | optional |

Rate limit: **100 requests/minute**, 100ms processing timeout per request.

**Important:** this is a **single-recipient transactional send**, not a bulk campaign. It is not what `scheduleCampaign()` in `mailchimp.ts` should call for a newsletter blast — that has to go through the MCP `campaigns.send.commit` tool (below), which is the only documented way to send to a whole group.

---

## 4. Mailzzy MCP Server

**Endpoint:** `https://api.mailzzy.com/crm/mcp/`

**Purpose (per docs):** "a standardized way for AI assistants to interact with external systems" — built for Claude, Gemini, Cursor, VS Code, etc.

**Auth:**
- End-user clients: **OAuth 2.1 + PKCE**, interactive sign-in.
- Service/internal agents: **bearer token** (the same JWT from the REST auth step above).
- "Tools never accept an account ID" — the account is bound to the token.

**Tool list per the docs site** (domain.verb naming — kept for reference, but see the correction below):

| Domain | Tools (as documented) |
|---|---|
| Contacts | `contacts.list`, `contacts.get`, `contacts.create`, `contacts.update`, `contacts.delete.preview`, `contacts.delete.commit` |
| Groups | `groups.list`, `groups.count`, `groups.add_contact` |
| Campaigns | `campaigns.list`, `campaigns.get`, `campaigns.send.preview`, `campaigns.send.commit`, `campaigns.cancel`, `campaigns.reports` |
| Segments | `segments.list`, `segments.delete` |
| Templates | `templates.list`, `templates.get` |
| Senders | `senders.list` |
| Automations | `automations.list` |
| Transactional | `email.send`, `media.upload` |
| Deliverability | `smtp.events` |

Destructive actions follow a **preview → commit** pattern (e.g. `campaigns.send.preview` then `campaigns.send.commit`, `contacts.delete.preview` then `contacts.delete.commit`) so nothing irreversible fires without a separate confirming call.

The docs don't publish the exact JSON-RPC parameter schema per tool — only the tool names and categories above.

### ✅ Correction (2026-09-02): real live tool names use `mcp_crm_<domain>_<verb>`, not `domain.verb`

An earlier version of this doc flagged a naming mismatch and claimed the uncommitted `mailchimp.ts` code's tool names (`mcp_crm_campaigns_send`, `mcp_crm_campaigns_get`) were wrong compared to what the docs site publishes (`campaigns.send.commit`, `campaigns.get`). **That flag was backwards.** With a live, authenticated MCP connection, `mcp_crm_groups_create` was called directly and worked (see Section 6 below — it created two real groups). So the actual live tool naming convention is `mcp_crm_<domain>_<verb>` — matching what's already in `mailchimp.ts` — and the docs site's `domain.verb` notation is either stale, aspirational, or describes an internal/different naming layer than what's actually exposed over MCP. Treat the `mcp_crm_*` prefix style as the one to code against; re-verify each specific tool name against a live `tools/list` call before relying on it, rather than trusting the docs site's naming for anything not yet tested live.

---

## 5. Live account state (confirmed 2026-09-02, via a session with an active MCP connection)

**Groups** — created via `mcp_crm_groups_create` for the send-popup design (see the 2026-09-02 brainstorming session):

| Purpose | Group ID | Stored name |
|---|---|---|
| Registered audience | `1085` | `registered` (Mailzzy lowercases names on save) |
| Not-registered audience | `1086` | `not registered` |

Both groups are currently **empty** — no contacts imported yet. That's a separate step from group creation.

**Senders** — `mcp_crm_senders_list` shows exactly **one** sender configured: `venakat@unitedffs.com` ("venakat D"). Its `domainVerified` flag is **`false`**. This needs to be fixed in the Mailzzy dashboard before any real campaign send — an unverified sending domain risks landing in spam or being rejected outright by receiving mail servers, independent of anything the application code does.

### Confirmed tool schemas (called live 2026-09-02, via plain bearer-token `fetch()` — no Claude Code MCP client needed, same pattern `scheduleCampaign()` already uses)

**`mcp_crm_groups_list`** — there is no per-group count tool; this is the only way to get member counts, and it returns every group at once:
```
tools/call mcp_crm_groups_list { "page": 1, "limit": 100 }
→ {
    "items": [
      { "id": 1086, "name": "not registered", "contactCount": 0, "visibility": "private" },
      { "id": 1085, "name": "registered", "contactCount": 0, "visibility": "private" }
    ],
    "page": 1, "limit": 20, "hasMore": false, "sort": "updated_on_desc"
  }
```

**`mcp_crm_senders_list`**:
```
tools/call mcp_crm_senders_list {}
→ {
    "items": [
      { "id": 2856, "email": "venakat@unitedffs.com", "name": "venakat D", "status": 1, "domainVerified": false }
    ],
    "page": 1, "limit": 25, "hasMore": false, "sort": "updated_on_desc"
  }
```

**Auth note:** the `/core/public/api/access` response's token field is `Token` (capital T), not `authToken` as an earlier draft of this doc's example suggested — `mailchimp.ts`'s existing `getMailzzyToken()` already reads the correct field. A quick debug script that read `authToken` instead got a false "unauthorized" from every subsequent `tools/call` (empty bearer token, not an actual permissions issue) — worth remembering if this ever gets debugged again from scratch.

---

## 6. Connecting this session to the Mailzzy MCP server

I did **not** connect this session to it, for a concrete reason: the documented auth for AI-assistant clients is **OAuth 2.1 + PKCE**, which requires an interactive browser sign-in — and this session is running non-interactively, so I can't complete that login flow myself (same restriction that applies to the other pending connectors like Supabase/Vercel in this environment).

Two ways forward, your call:
1. **You run the interactive login.** In an interactive Claude Code session, add the server (`claude mcp add mailzzy https://api.mailzzy.com/crm/mcp/ --transport http` or similar, exact flag names depend on your CLI version) and complete the OAuth prompt yourself. After that, this MCP would be available in future sessions.
2. **Skip MCP, use the REST/bearer-token flow directly.** For anything Section 2–3 above cover (contacts, groups list, transactional email), I can just make the HTTP calls myself with the credentials from `.env` — no MCP needed. For campaign sending specifically, there's no REST equivalent documented — MCP's `campaigns.send.commit` is the only documented path, so that piece genuinely does need either the MCP connection or continuing to use the app's own `mailchimp.ts` code (which already implements the same JSON-RPC-over-HTTP calls MCP uses, just called directly rather than through Claude Code's MCP client).
