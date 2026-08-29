# Production Certification Status

This document records the evidence collected during Layer 7. The product is **not approved for a paying gym** until every commercial release gate at the end of this document is complete.

## Current automated evidence

### Layers 1–6

- Database security boundary: complete.
- Onboarding resilience/idempotency: complete.
- Tenant isolation and RBAC: complete.
- Cross-module transaction/concurrency integrity: complete.
- Runtime/API/auth/storage/webhook hardening: complete.
- Performance/observability: complete.
- Production Vercel Functions are colocated with Supabase in Tokyo (`hnd1` / `ap-northeast-1`).

Performance smoke from Lebanon, 60 requests at concurrency 10:

| Metric | Washington deployment | Tokyo deployment |
| --- | ---: | ---: |
| Failures | 0 | 0 |
| Requests/sec | 3.84 | 12.99 |
| p50 | 2335 ms | 439 ms |
| p95 | 3737 ms | 2202 ms |
| p99 | 4447 ms | 2253 ms |
| Max | 4447 ms | 2253 ms |

The Tokyo deployment improved median latency by about 81% and throughput by about 3.38x.

### Layer 7 rollback database suite

All database cases were executed inside rollback-only transactions against the deployed schema with an authenticated owner JWT context where applicable. No certification rows were retained.

**60 assertions passed**, covering:

- tenant RLS isolation;
- cross-organization RPC rejection;
- malformed cross-tenant member/plan/location references;
- idempotent member creation and member-number allocation;
- import idempotency and invalid-batch rollback;
- duration-plan expiry;
- integer minor-unit payment storage;
- receipt-number allocation;
- partial/outstanding balances;
- payment idempotency;
- membership-linked overpayment rejection;
- currency mismatch rejection;
- immutable/idempotent payment voiding;
- inclusive freeze extension;
- future freeze access;
- active freeze denial;
- overlapping freeze rejection;
- duplicate access-scan suppression;
- one open attendance session in the tested access flow;
- explicit checkout;
- PT package balance;
- PT-session idempotency;
- PT/PT trainer overlap rejection;
- PT/class trainer overlap rejection;
- class capacity and waitlisting;
- exactly-once PT package deduction;
- lead idempotency;
- exactly-once lead conversion;
- converted-lead immutability;
- checked-in member archive rejection;
- archive cleanup for memberships, credentials, future PT, and class bookings;
- raw access-HMAC column unavailable to authenticated clients;
- revoked credentials no longer resolve;
- archived member access rejection;
- stale attendance forced-close;
- stale membership expiry maintenance.

## Layer 7 defect found and fixed

The previous wall-clock conversion rejected nonexistent spring-forward times but accepted ambiguous fall-back times. The certification patch changes `wallTimeToUtcIso()` to enumerate valid timezone offsets and require **exactly one** UTC candidate.

Permanent regression checks cover:

- UTC normal conversion;
- Asia/Beirut normal conversion;
- Europe/Paris spring-forward gap;
- Europe/Paris fall-back ambiguity;
- America/New_York fall-back ambiguity;
- Australia/Lord_Howe 30-minute fall-back ambiguity;
- gym-local date calculation.

Run:

```bash
node scripts/timezone-cert.mjs
node scripts/http-cert.mjs
```

## Required commercial go-live gates still outstanding

These are deliberately not represented as passed until they are actually performed.

1. **Full 5,000-row import staging load**
   - The deployed RPC hard-limit and atomic behavior are verified.
   - A smaller rollback batch passed.
   - Run the full 5,000-row import in a disposable staging environment, not the live development project.

2. **Multi-role human E2E**
   - Test Owner, Admin, Manager, Reception, Trainer, and Accountant sessions.
   - Verify direct URLs, active-location constraints, navigation visibility, and permitted mutations.

3. **Stripe test-mode certification**
   - Enable Stripe test configuration.
   - Test hosted checkout, invalid signature, duplicate webhook delivery, database failure/retry, `past_due` grace, recovery, and Customer Portal authorization.
   - Confirm gym-member ledger rows are unaffected.

4. **Supabase commercial security/recovery**
   - Upgrade the production organization from Free before onboarding a paying gym.
   - Enable Leaked Password Protection.
   - Verify the selected backup/PITR entitlement.
   - Restore the latest Postgres backup into a staging/recovery project and reconcile private Storage separately.

5. **Clean migration rehearsal**
   - Build an empty disposable database from the repository migration chain.
   - Rehearse upgrade from the immediately previous production migration.
   - Confirm migration history equals the repository afterward.

6. **Failure-mode browser test**
   - Simulate a failed network mutation and verify the user gets an error/feedback while the underlying transaction remains consistent.

Only after all six outstanding gates pass should the system be marked **commercially production-certified**.
