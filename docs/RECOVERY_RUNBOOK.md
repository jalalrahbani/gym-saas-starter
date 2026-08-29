# Production Recovery Runbook

This runbook covers the production `gym-saas-starter` stack: Next.js on Vercel plus Supabase Auth, Postgres, Storage, and scheduled maintenance.

## Incident priorities

1. Preserve data before making destructive changes.
2. Record the failing deployment SHA, UTC timestamp, affected route/module, and visible error.
3. Check Vercel runtime/build logs and Supabase Auth/API/Postgres/Storage logs.
4. Prefer application rollback over database rollback when the database migration is forward-compatible.
5. Never run `supabase db reset`, destructive local-development commands, or ad-hoc data deletion against production.

## Application rollback

If a newly deployed application build causes a production regression:

1. Identify the last verified Vercel production deployment.
2. Promote/restore that deployment using Vercel's deployment controls.
3. Confirm `/api/health` returns `200`.
4. Test login plus one read-only authenticated route.
5. Check fresh Vercel runtime errors after rollback.

Database migrations are forward-only by default. Do not automatically reverse a migration just because the frontend was rolled back.

## Database recovery

Before commercial production certification, verify the Supabase project's active backup/PITR capability in the Supabase dashboard and perform a restore drill.

For a database incident:

1. Stop the application action that is causing bad writes where possible.
2. Capture the current migration history.
3. Determine the smallest affected time window and tables.
4. Prefer restoring to a separate recovery environment/project first.
5. Validate organization isolation, membership/payment integrity, attendance, and audit records before promoting recovered data.
6. Reconcile restored schema migration history with the repository before reopening writes.

Never overwrite production with an unverified restore.

## Secret rotation

Secrets belong only in local environment files and deployment secret stores. Never commit them.

- `SUPABASE_SECRET_KEY`: rotate in Supabase/Vercel and redeploy dependent server routes.
- `CRON_SECRET`: rotate in Vercel and verify the maintenance cron returns success.
- Stripe secrets: rotate both API and webhook secrets together when Stripe billing is enabled, then send a test webhook.
- `CARD_TOKEN_HMAC_SECRET`: do **not** rotate casually. Existing access credentials are stored as HMACs derived from this secret. Rotation requires either credential re-enrollment or a planned dual-key migration period; otherwise existing cards/tags will stop matching.

After any rotation, verify no old secret remains in source control, deployment logs, local shell history intended for sharing, or documentation.

## Cron recovery

The attendance maintenance job must be authenticated with `CRON_SECRET`.

After a failed cron run:

1. Inspect Vercel runtime logs for the request ID.
2. Inspect Supabase API/Postgres logs for `auto_close_stale_attendance` and `expire_stale_memberships`.
3. Fix the underlying dependency/configuration problem.
4. Re-run the maintenance endpoint only with authorized tooling.
5. Confirm the response reports `ok: true` and `failureCount: 0`.

The maintenance RPCs are designed to be repeatable; do not manually edit attendance/payment records to compensate unless a reviewed data-repair script is required.

## Webhook recovery

Stripe webhook events are persisted in `webhook_events` and claimed with a short processing lease.

- Processed events are deduplicated.
- Concurrent deliveries do not process in parallel.
- Failed processing releases the lease and returns a non-2xx response so Stripe can retry.
- A stale lease can be reclaimed after the configured lease window.

When Stripe billing is enabled, periodically inspect failed/unprocessed webhook events and verify provider subscription state against Stripe before manual repair.

## Storage recovery

- `gym-branding` is public and restricted to approved image MIME types with a 2 MB bucket limit.
- `member-private` is private, restricted by organization-aware policies, and capped at 5 MB with approved image/PDF MIME types.

Do not make `member-private` public to recover a file. Recover access through correct policies or an authorized server-side process.

## Release recovery checklist

A recovered release is not considered healthy until all are true:

- `/api/health` returns `200`.
- Authenticated login/session refresh works across a page reload.
- Organization A cannot read Organization B.
- Member list and one member detail page load.
- Payment reads work for financial roles.
- Check-in/access processing works for an authorized operational role.
- No fresh Vercel `error`, `warning`, or `fatal` logs appear during the smoke test.
- Supabase Auth/API/Postgres logs show no unexpected 401/403/5xx pattern.
- Migration history matches the intended repository history.

A full backup restore drill remains a production-certification gate and should be completed before onboarding a paying gym.
