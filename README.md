# Gym SaaS Starter

A production-oriented, multi-tenant gym-management SaaS built with Next.js, TypeScript and Supabase/Postgres.

> **Working name only.** This repository intentionally uses a neutral project name while product naming/domain/trademark screening is completed.

## What the application does

The operational flow is deliberately connected:

1. An owner signs up and creates a gym workspace and first location.
2. Existing members can be imported from CSV or created at reception.
3. Staff create plans, enroll/renew members, freeze memberships and record payments.
4. Members check in/out by card/RFID/NFC/QR/barcode reader, member number, phone or manual search.
5. Attendance creates a clean visit session with arrival, departure and duration while a separate event log preserves denied/duplicate access attempts.
6. PT packages, trainer bookings and classes use the same member/location records.
7. Leads convert atomically into members without duplicate data entry.
8. Dashboard, renewal queues, messaging segments and reports read from the same operational records.
9. Owners/admins can create additional locations, invite staff and switch the active branch from the app header.
10. Optional Stripe billing handles the SaaS subscription separately from gym-member payments.

## Implemented operational V1

### Identity and tenancy
- Supabase email/password authentication and email confirmation
- Self-service organization + first-location onboarding
- Fixed staff roles: Owner, Admin, Manager, Reception, Trainer, Accountant
- Server-side application context: authenticated user → organization → accessible location → role
- Multi-location selector with branch-scoped operational pages
- Database Row Level Security plus server authorization

### Members
- Member creation/edit/archive
- Search by member information
- Private profile-photo upload
- Member notes
- CSV import (atomic, up to 5,000 rows) and CSV export
- Complete member workspace with membership/payment/attendance/card/PT history

### Memberships
- Custom fixed-duration, visit-pack and recurring-ready plan definitions
- Enrollment/renewal with calculated expiry and visit balance
- Optional first payment in the same database transaction
- Partial-payment/outstanding-balance support
- Real freeze date ranges with expiry extension
- Automated stale/expired membership lifecycle maintenance

### Payments
- Cash, external card terminal, bank transfer, Whish/OMT/custom payment-method recording
- Integer minor-unit money model (no floating-point financial storage)
- Membership-balance guard against overpayment
- Receipt numbering and printable/save-as-PDF receipt pages
- Voids instead of normal financial deletion
- Multi-currency-safe reporting (currencies are not silently combined)

### Access & attendance
- Keyboard-wedge USB reader support for gym magstripe cards, RFID/NFC cards/fobs and QR/barcode scanners
- Server-side HMAC credential matching; raw access identifiers are never stored
- Smart toggle, entry-only and exit-only modes
- Exact check-in/check-out timestamps and visit duration
- One open visit per member database invariant
- Duplicate-scan suppression
- Live current occupancy and today’s check-in count
- Append-only access-event history for allowed/denied/ignored attempts
- Protected scheduled maintenance auto-closes stale visits and flags them as forced closures

### Personal training and classes
- PT packages and remaining-session balances
- Trainer scheduling
- Database conflict prevention for overlapping PT sessions
- Atomic PT completion/session decrement
- Group-class definitions and sessions
- Capacity-safe atomic class booking with waitlist state

### Leads, communication and reporting
- CRM stages: New → Contacted → Trial → Negotiating → Joined / Lost
- Follow-up dates and sources
- Atomic Convert to Member workflow
- Operational messaging segments for expiring/inactive members with pre-filled email/WhatsApp actions
- 30-day membership, attendance, revenue and lead-conversion reporting
- Global workspace search for members, leads and receipt numbers

### SaaS operations
- Trial/subscription record per organization
- Optional Stripe Checkout + Billing Portal integration
- Signature-verified and idempotent Stripe webhook processing
- Seven-day past-due grace-period model
- Hourly protected maintenance route via Vercel Cron
- Error boundary/loading states
- Health route
- GitHub Actions typecheck/build workflow

## Architecture

```text
Browser / responsive web app
            |
            v
Next.js 16.3 + React 19.2 + TypeScript
  |                 |
  |                 +---- server actions / route handlers
  |
  +---- Supabase Auth session boundary
            |
            v
Supabase Postgres
  |  Row Level Security
  |  constraints / exclusion constraints
  |  transactional RPCs
  |  audit history
  |
  +---- Supabase private Storage (member photos)

Optional server-only adapters
  Stripe SaaS billing | email/WhatsApp later | access hardware via keyboard-wedge input
```

The schema intentionally keeps the SaaS subscription domain separate from a gym's own member-payment ledger.

## Local setup

### Requirements

- Node.js 22+
- npm
- A Supabase project
- Optional Stripe account for SaaS billing

### 1. Install dependencies

```bash
npm install
```

The first successful install generates `package-lock.json`. Commit that lockfile before production deployment so dependency installation becomes reproducible; then change CI from `npm install` to `npm ci`.

### 2. Configure environment

```bash
cp .env.example .env.local
```

Required for core operations:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
NEXT_PUBLIC_SITE_URL
CARD_TOKEN_HMAC_SECRET
CRON_SECRET
```

Optional until SaaS subscription billing is enabled:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER
STRIPE_PRICE_PRO
```

Generate long random values for `CARD_TOKEN_HMAC_SECRET` and `CRON_SECRET`. Never expose them through `NEXT_PUBLIC_*` variables and never commit `.env.local`.

### 3. Apply database migrations

Apply in numeric order using the normal Supabase migration workflow:

```text
0001_initial.sql
0002_access_attendance.sql
0003_operational_core.sql
0004_hardening_storage.sql
0005_integrity_transactions.sql
0006_attendance_maintenance.sql
0007_crm_conversion.sql
0008_membership_lifecycle.sql
0009_member_import.sql
```

The migrations create RLS policies, transactional business functions, private storage policy, attendance/access constraints and tenant-integrity checks.

### 4. Configure Supabase Auth

Set the application URL and allowed redirect URL to match `NEXT_PUBLIC_SITE_URL`, including:

```text
/auth/confirm
```

For production, enable MFA for privileged accounts according to your operating policy.

### 5. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`, create an account and complete onboarding.

### 6. Configure Stripe (optional)

Create Starter/Pro recurring prices, put their IDs in the environment variables, and register the deployed webhook endpoint:

```text
/api/stripe/webhook
```

Do not enable paid subscriptions until webhook processing has been tested in Stripe test mode.

### 7. Configure scheduled maintenance

`vercel.json` calls the protected attendance/membership maintenance route hourly. Vercel must send the configured `CRON_SECRET` according to the deployment configuration. The endpoint is:

```text
/api/cron/attendance-close
```

It auto-closes stale visits and expires stale memberships without relying on a receptionist opening a page.

## Core routes

```text
/                      Product landing page
/login                 Staff sign-in
/signup                Owner sign-up
/onboarding            First gym setup
/dashboard             Daily operating dashboard
/members               Member directory/import
/members/:id           Complete member workspace
/check-in               Access & attendance terminal
/memberships            Plans and membership ledger
/payments               Payment ledger
/training               PT packages and calendar
/classes                Group classes and bookings
/leads                  Sales pipeline
/messages               Actionable member segments
/reports                Operational analytics
/staff                  Staff invitations/roles
/settings               Gym, locations and SaaS billing
/search?q=...            Global workspace search
/receipts/:id           Printable member receipt
```

## Reliability principles

1. Every tenant-owned row carries `organization_id`.
2. Postgres RLS enforces tenant visibility independently of page filters.
3. Foreign-record validation rejects cross-tenant member/location/payment/PT/class combinations.
4. Coupled workflows use database transactions/RPCs.
5. Financial records are voided/refunded rather than normally deleted.
6. Money is stored as integer minor units and retains its ISO currency.
7. UTC timestamps are stored; business-day decisions use the gym’s configured timezone.
8. Membership freezes are date ranges, not ambiguous booleans.
9. Access events are append-only; attendance sessions remain clean for reporting.
10. Webhook event IDs make external processing idempotent.
11. Authenticated application pages are dynamic/non-cacheable.
12. Raw membership-card/RFID identifiers never enter the database.
13. Object storage is private and protected separately from database backups.
14. Destructive and privileged actions are auditable.
15. Deployment requires migration, RLS, integration and recovery testing; no software should be described as literally “bug-free” or “unbreakable.”

See [docs/TEST_PLAN.md](docs/TEST_PLAN.md) before pilot or production deployment.

## GitHub workflow

This folder is already a Git repository. If you downloaded the ZIP and want a fresh repository instead:

```bash
git init
git add -- package.json tsconfig.json next-env.d.ts next.config.ts postcss.config.mjs .gitignore .env.example README.md src supabase docs .github vercel.json proxy.ts
git commit -m "Build gym SaaS operational V1"
git branch -M main
```

Create an empty GitHub repository, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/gym-saas-starter.git
git push -u origin main
```

If you retain the Git history included in the project ZIP, simply add the remote and push the existing branch/commits instead.

## Verification status

Source-level TypeScript/TSX syntax validation and Git diff integrity are run before packaging this milestone. This execution environment currently cannot complete npm registry installation, so a real dependency-resolved `npm run typecheck` and `npm run build` must be run on your machine or CI after `npm install`. SQL migrations must also be applied/tested against an actual Supabase project before production use.

## One-click macOS setup

For the simplest first deployment on a Mac, unzip the project and double-click `SETUP_AND_DEPLOY_MAC.command`.
The guided installer checks/install prerequisites, authenticates GitHub CLI, installs npm dependencies, links and migrates Supabase, creates `.env.local`, runs typecheck/build, pushes `main` to `jalalrahbani/gym-saas-starter`, and guides the first Vercel deployment. It never commits `.env.local` or application secrets. Stripe remains optional/off until operational testing is complete.
