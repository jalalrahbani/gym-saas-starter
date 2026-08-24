# Gym SaaS Starter

A production-oriented starting point for a multi-tenant gym management SaaS.

> **Naming note:** this repository intentionally uses a neutral working name. `GymDesk` is already an existing commercial product and should not be used as this product's brand.

## What is included now

- Next.js 16.3 + React 19.2 + TypeScript
- Tailwind CSS v4
- Responsive landing page
- Dashboard UI demo
- Searchable Members UI demo
- `/api/health`
- Supabase browser/server client helpers
- Multi-tenant Postgres schema
- Row Level Security foundation
- Core roles and audit model
- Membership, payment, PT and lead entities
- Unified access-card/RFID/QR attendance model with check-in, check-out and visit duration
- SaaS subscription/webhook foundation
- CI workflow
- Detailed product decisions, UI spec and product blueprint

This is the **foundation**, not a claim that the entire commercial SaaS is already implemented. The next phase replaces demo data with authenticated Supabase-backed workflows module by module.

## Local setup

### Requirements

- Node.js 22+
- npm
- A Supabase project when you are ready to connect real data

### 1. Install

```bash
npm install
```

This generates `package-lock.json`. Commit that lockfile before production development so installs are reproducible.

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in the Supabase URL and publishable key. Keep the secret/service key server-only.

### 3. Start

```bash
npm run dev
```

Open `http://localhost:3000`.

Demo pages:

- `/` — product landing page
- `/dashboard` — staff dashboard mock
- `/members` — searchable member directory mock
- `/check-in` — interactive access/check-in/check-out terminal demo
- `/api/health` — health endpoint

### 4. Database

Install/configure the Supabase CLI, link the desired project, then apply the migration using the normal Supabase migration workflow. Review security policies before applying to any production project.

Migration:

```text
supabase/migrations/0001_initial.sql
supabase/migrations/0002_access_attendance.sql
```

Optional development seed:

```text
supabase/seed.sql
```

## Recommended GitHub workflow

After downloading/extracting this folder:

```bash
cd gym-saas-starter
git init
git add package.json tsconfig.json next-env.d.ts next.config.ts postcss.config.mjs .gitignore .env.example README.md src supabase docs .github
git commit -m "Initialize multi-tenant gym SaaS foundation"
git branch -M main
```

Create an empty GitHub repository under your account, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/gym-saas-starter.git
git push -u origin main
```

Do **not** commit `.env.local` or secret keys.

## Repository map

```text
src/app/                         Next.js routes
src/components/                  shared UI shell
src/lib/supabase/                Supabase client boundaries
supabase/migrations/             versioned database schema
supabase/seed.sql                optional dev seed
docs/LOCKED_PRODUCT_DECISIONS.md selected product defaults
docs/UI_SPEC.md                  screen/navigation specification
docs/PRODUCT_BLUEPRINT.md        product story + architecture
.github/workflows/ci.yml         build/typecheck verification
```

## Architecture principles

1. Tenant ID on every tenant-owned record.
2. Database RLS in addition to application permissions.
3. Fixed roles before custom permissions.
4. Archive/void instead of destructive deletion for business history.
5. Money stored in minor units (`5500` = USD 55.00), never floats.
6. ISO currency stored per financial transaction.
7. UTC timestamps in storage, local timezone for display.
8. Idempotent external webhooks.
9. Database transactions for coupled business changes.
10. Separate private object storage for member photos/documents.
11. Migrations and CI before production changes.
12. SaaS billing and gym-member payment processing remain separate domains.
13. Raw membership-card/RFID identifiers are never stored; server-side HMAC matching is used.
14. Attendance uses one open session per member plus immutable access-event history.

## Next implementation milestone

The next code milestone should be **Authentication + Onboarding + real Members CRUD**. Do not implement five modules at once. The most reliable progression is:

1. sign-up/sign-in/session boundary
2. create organization/location
3. invite staff and verify RLS
4. member CRUD/photo upload
5. test cross-tenant denial
6. only then membership/payment/check-in workflows

## Access reader compatibility

The access terminal is designed around readers that operate in **USB HID / keyboard-wedge mode**. The gym keeps the scan field focused; swiping/tapping/scanning enters the credential identifier followed by Enter, exactly like keyboard input. This gives one software workflow for common magstripe membership cards, RFID/NFC cards or fobs, barcode cards and QR scanners.

For production, raw credential identifiers must be sent only over HTTPS to a server route, normalized, HMACed with a server-only `CARD_TOKEN_HMAC_SECRET`, then matched against `access_credentials.token_hmac`. Do not store raw swipe data and never use payment-card magnetic-stripe data as a gym credential.
