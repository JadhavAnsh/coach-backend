# Lungoor Coach — Backend API

Bun + Elysia API with multi-tenant organisations, JWT auth, and Redis-backed tenant cache.

## Prerequisites

- [Bun](https://bun.sh)
- MongoDB (connection string in `MONGO_URI`)
- Redis (`REDIS_HOST` / `REDIS_PORT`)

## Setup

```bash
cd coach-backend
cp .env.example .env
# Edit .env — at minimum: MONGO_URI, JWT_SECRET, API_KEY, ORG_BOOTSTRAP_TOKEN, EMAIL_ENCRYPTION_PASSWORD
bun install
bun run dev
```

Default port: **8000** (`PORT`).

| URL | Purpose |
|-----|---------|
| http://localhost:8000/docs | Interactive OpenAPI (Scalar) |
| http://localhost:8000/docs/openapi.json | OpenAPI 3 JSON |
| http://localhost:8000/api/v1/health | Health + Mongo status |

## Environment (important)

| Variable | Role |
|----------|------|
| `API_KEY` | Required on almost all `/api/v1/*` routes (header `api_key`) |
| `ORG_BOOTSTRAP_TOKEN` | One-time bootstrap; header `auth_token` on `POST /api/v1/organisations` only |
| `JWT_SECRET` | Signs access tokens (7d) |
| `CORS_ORIGINS` | Comma-separated frontend origins |

Never commit real `.env` values or expose `ORG_BOOTSTRAP_TOKEN` / `API_KEY` to clients you do not control.

## How tenancy works

Each organisation has a slug: **`organisation_name`** (lowercase, e.g. `acme-coach`).

On tenant-scoped requests, send:

- Header **`api_key`**: your server `API_KEY`
- Header **`X-TENANT-ID`**: the organisation slug

Alternatives for tenant id: query `?tenant=...` or cookie `organisationId` (set automatically after valid requests / OAuth).

Successful auth responses also set an HttpOnly cookie `auth_token_<tenant>`.

User JWT can be sent as:

- `Authorization: Bearer <token>`
- Header `auth_token`
- Cookie `auth_token_<tenant>`

All JSON success bodies are wrapped:

```json
{
  "success": true,
  "message": "Request successful",
  "data": { }
}
```

Errors use HTTP status codes and an error payload from the global error handler.

---

## Step 1 — Bootstrap the default organisation

Run once per environment. **No `api_key`** on this route.

```bash
curl -s -X POST http://localhost:8000/api/v1/organisations \
  -H "Content-Type: application/json" \
  -H "auth_token: YOUR_ORG_BOOTSTRAP_TOKEN" \
  -d '{
    "organisation_name": "default",
    "display_name": "Default Org",
    "owner": {
      "email": "owner@example.com",
      "name": "Owner",
      "password": "change-me-123"
    }
  }'
```

Save from `data`:

- **`organisation.organisation_name`** → use as `X-TENANT-ID` (here: `default`)
- Owner can sign in with the email/password you set

Optional: `allowed_domains` (string array) for future domain restrictions.

---

## Step 2 — Sign in as owner (or register members)

```bash
export API_KEY=your-api-key
export TENANT=default

curl -s -X POST "http://localhost:8000/api/v1/auth/sign-in" \
  -H "Content-Type: application/json" \
  -H "api_key: $API_KEY" \
  -H "X-TENANT-ID: $TENANT" \
  -d '{
    "email": "owner@example.com",
    "password": "change-me-123"
  }'
```

Copy `data.accessToken` for bearer auth, or reuse cookies from the same client.

Register (creates **member** role):

```bash
curl -s -X POST "http://localhost:8000/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -H "api_key: $API_KEY" \
  -H "X-TENANT-ID: $TENANT" \
  -d '{
    "email": "coach@example.com",
    "password": "securepass123",
    "firstName": "Jane",
    "lastName": "Coach"
  }'
```

---

## Step 3 — Call authenticated routes

```bash
export TOKEN=data.accessToken-from-sign-in

curl -s "http://localhost:8000/api/v1/auth/me" \
  -H "api_key: $API_KEY" \
  -H "X-TENANT-ID: $TENANT" \
  -H "Authorization: Bearer $TOKEN"
```

Sign out:

```bash
curl -s -X POST "http://localhost:8000/api/v1/auth/sign-out" \
  -H "api_key: $API_KEY" \
  -H "X-TENANT-ID: $TENANT"
```

---

## OAuth (optional)

Configure provider env vars in `.env.example` (Google / GitHub / Microsoft).

1. Browser: `GET /api/v1/auth/google?tenant=default&redirect_url=http://localhost:3000`
2. User completes provider login; callback sets auth cookie and redirects to `redirect_url`.

OAuth paths require tenant context but not `api_key` in the middleware (still configure providers in env).

---

## What to do next

1. Point your frontend at `http://localhost:8000` with `CORS_ORIGINS` including its origin.
2. Store **`API_KEY` on the server** (BFF / Next server actions) — do not ship it in public mobile/web bundles.
3. After bootstrap, rotate `ORG_BOOTSTRAP_TOKEN` in production if it was ever exposed.
4. Add domain modules under `src/modules/` and register routes in `src/app.ts`; annotate with `detail` for OpenAPI.
5. Use `/docs` to try endpoints with the security schemes defined there.

## Scripts

```bash
bun run dev    # watch mode
bun run start  # production run
```
