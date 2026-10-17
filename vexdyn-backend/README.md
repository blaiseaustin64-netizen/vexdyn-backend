# VEXDYN Auth Backend (`vexdyn-backend`)

Cloudflare Worker + D1 authentication for the VEXDYN product suite  
(Forge, Brand-in-a-Box, X-Ray, Lab — **not** NYVEN).

| Resource | Value |
|----------|--------|
| Worker name | `vexdyn-backend` |
| Worker URL | `https://vexdyn-backend.blaisepatrick556.workers.dev` |
| D1 database name | `vexdyn-auth` |
| D1 database ID | `15ec65a4-0e10-4be2-8000-46684f270fa3` |
| Email sender | `VEXDYN Support <hellovexdyn@gmail.com>` |
| Brevo (HTTPS API) secret | `BREVO_API_KEY` |
| Existing SMTP secret (unused by this code) | `BREVO_SMTP_KEY` — **do not overwrite** |

This package deploys to the **existing** Worker and D1 database. It does **not** create a second Worker or database.

---

## Requirements

- **Node.js 20 LTS or newer** (recommended: Node 22) — [nodejs.org](https://nodejs.org/)
- A Cloudflare account with access to the `vexdyn-backend` Worker and `vexdyn-auth` D1 database
- **Wrangler** is installed as a **devDependency** via `npm install` (no global install required)

---

## Windows deployment guide (PowerShell)

Open **PowerShell**. Commands below use `npm run` / `npx wrangler` from the project folder.

### 1. Install Node.js

1. Download the Windows LTS installer from https://nodejs.org/
2. Install it (include “Add to PATH”).
3. Close and reopen PowerShell, then check:

```powershell
node -v
npm -v
```

You should see version numbers (Node ≥ 20).

### 2. Extract this ZIP and enter the project folder

```powershell
# Adjust the path if you extracted elsewhere
cd $HOME\Downloads\vexdyn-backend
# Or wherever the folder "vexdyn-backend" is after unzip
dir
```

You should see `package.json`, `wrangler.toml`, `src\`, `migrations\`, etc.

### 3. Install dependencies

```powershell
npm install
```

If you hit peer-dependency warnings, you may use:

```powershell
npm install --legacy-peer-deps
```

### 4. Run tests (local / MockD1 — not real Cloudflare D1)

```powershell
npm test
```

These tests use an in-memory mock database. **They do not prove production D1 behaviour under concurrency.**

### 5. Log in to Cloudflare

```powershell
npx wrangler login
```

A browser window opens; approve access for the account that owns `vexdyn-backend`.

### 6. Inspect the configured Worker and D1 database

Confirm `wrangler.toml` still targets the existing resources:

```powershell
Get-Content wrangler.toml
```

Check:

- `name = "vexdyn-backend"`
- `database_name = "vexdyn-auth"`
- `database_id = "15ec65a4-0e10-4be2-8000-46684f270fa3"`

List D1 databases in your account:

```powershell
npx wrangler d1 list
```

You should see `vexdyn-auth` with that database ID.

### 7. Check migration status **before** applying anything

```powershell
npx wrangler d1 migrations list vexdyn-auth --remote
```

- If `0001_init.sql` is **not** listed as applied, you need to apply it (step 8).
- If it is **already applied**, **skip** step 8.

The migration uses only `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. There are **no** `DROP TABLE` or truncate statements.

### 8. Apply the migration only if needed (affects production D1)

> **Warning:** `--remote` runs against the **live** `vexdyn-auth` database.  
> Only run this if step 7 showed the migration is not yet applied.  
> You cannot fully “undo” a schema apply the way you can roll back a Worker version.

```powershell
npx wrangler d1 migrations apply vexdyn-auth --remote
```

Local-only (safe sandbox on your machine, does not touch production):

```powershell
npm run migrate:local
```

### 9. Worker variables and secrets

**Public vars** are already in `wrangler.toml` under `[vars]`:

- `EMAIL_FROM` = `VEXDYN Support <hellovexdyn@gmail.com>`
- `APP_BASE_URL` = `https://vexdyn.com`  
  → Change this if your live auth pages are on another host (e.g. `https://vexdyn.pages.dev`) **before** or **after** deploy via:

  ```powershell
  npx wrangler secret put   # not for vars — use dashboard or:
  npx wrangler versions secret put   # optional advanced
  ```

  To update a **var** from the CLI after deploy, edit `[vars]` in `wrangler.toml` and redeploy, or set vars in the Cloudflare dashboard under the Worker → Settings → Variables.

**Secret (required for email):**

This project reads **`BREVO_API_KEY`** (Brevo **REST API** key) and calls:

`POST https://api.brevo.com/v3/smtp/email`

with header `api-key`.

- If you already stored `BREVO_API_KEY` on the Worker, you do **not** need to set it again.
- **Do not** put the SMTP key into `BREVO_API_KEY`.
- **Do not** overwrite or delete `BREVO_SMTP_KEY` (unused by this code; leave it as-is).

To set or rotate the API key (you will be prompted; the value is not echoed into the project):

```powershell
npx wrangler secret put BREVO_API_KEY
```

Paste the Brevo **API** key when prompted. Never commit that value.

Optional local file for `wrangler dev` only (not used for production deploy):

```powershell
Copy-Item .dev.vars.example .dev.vars
# Edit .dev.vars in Notepad — put BREVO_API_KEY there for local testing only
```

### 10. Deploy to the **existing** `vexdyn-backend` Worker

```powershell
npm run deploy
```

This is equivalent to `npx wrangler deploy`.  
Because `name = "vexdyn-backend"` in `wrangler.toml`, Wrangler updates that Worker; it should **not** create a differently named Worker.

### 11. Verify health and auth routes

In a browser or PowerShell:

```powershell
Invoke-RestMethod https://vexdyn-backend.blaisepatrick556.workers.dev/health
```

Expect JSON similar to:

```json
{ "ok": true, "service": "vexdyn-backend", "status": "ok", ... }
```

**Not** the string `Hello World!` (that means the old template is still live).

Register (use an email **you** control):

```powershell
Invoke-RestMethod -Method POST `
  -Uri https://vexdyn-backend.blaisepatrick556.workers.dev/auth/register `
  -ContentType "application/json" `
  -Body '{"email":"you@example.com","password":"Password1"}'
```

Expect a safe message about verification (does not prove the email was delivered until you check your inbox / Brevo).

Auth pages on the website must match `APP_BASE_URL` (`/verify-email`, `/reset-password`). Deploy those frontend files separately if they are not live yet.

### 12. Rollback notes

**Worker code**

- Cloudflare keeps previous Worker versions. In the dashboard: Worker → Deployments → roll back to a prior version if a deploy is bad.
- Or redeploy a known-good commit from this repo.

**D1 schema**

- Migrations are not automatically reversible.
- `0001_init` only creates tables/indexes if missing; it does not drop data.
- Do **not** run ad-hoc `DROP TABLE` against production without a backup plan.

---

## Local development

```powershell
Copy-Item .dev.vars.example .dev.vars
# Add BREVO_API_KEY for real local email tests (optional)
npm run migrate:local
npm run dev
```

Worker typically listens on `http://127.0.0.1:8787`.

---

## API overview (high level)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/auth/register` | Sign up (sends verification email when Brevo is configured) |
| POST | `/auth/verify-email` | `{ email, token }` |
| POST | `/auth/resend-verification` | `{ email }` |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/logout` | End session |
| GET | `/auth/me` | Current user (session cookie or Bearer) |
| POST | `/auth/forgot-password` | `{ email }` |
| POST | `/auth/reset-password` | `{ token, password }` |

Sessions: opaque tokens; HttpOnly cookie on the Worker origin and/or `Authorization: Bearer` / `X-Session-Token`.  
Emails: branded HTML + text via Brevo HTTPS API (`BREVO_API_KEY` only).

---

## Security notes

- Passwords: PBKDF2-SHA-256 (Web Crypto).
- Verification / reset tokens: high-entropy, stored hashed, single-use, ~30 minute TTL.
- Rate limits stored in D1.
- CORS allowlist in `ALLOWED_ORIGINS` (NYVEN origins intentionally excluded).
- Never commit `.dev.vars` or real API keys.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `/health` returns `Hello World!` | Old template still deployed — run `npm run deploy` from this project |
| Register 200 but no email | Missing/wrong `BREVO_API_KEY`, or sender not verified in Brevo |
| CORS errors from a product site | Add that origin to `ALLOWED_ORIGINS` and redeploy |
| Verify link 404 on website | Auth HTML not published under `APP_BASE_URL` |
| Migration already applied | Safe to skip; do not invent DROP migrations |

---

## License / ownership

Private VEXDYN backend. Not for redistribution with secrets.
