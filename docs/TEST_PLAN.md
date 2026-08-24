# Production Acceptance Test Plan

Passing these checks is the definition of release readiness. A feature being present in the UI is not sufficient.

## 1. Authentication and tenant isolation

- Owner can sign up, confirm email, onboard and sign in again.
- Unauthenticated access to every `(app)` route redirects to sign-in.
- User in Organization A cannot select/read/update/delete rows from Organization B through the Data API.
- A deliberately malformed Organization A transaction referencing a Organization B member/location/plan is rejected by database integrity logic.
- Reception/trainer users cannot switch into locations they are not assigned to.
- Owner/Admin can create a second location and switch branches without losing session state.

## 2. Members and imports

- Create, edit and archive a member.
- Archived member does not appear in normal access lookup.
- Member photo is private and cannot be fetched without authorization.
- CSV import handles quoted commas, blank optional fields and 5,000 rows.
- One invalid import row rolls back the full import.
- Exported CSV opens correctly and preserves dates/contact fields.

## 3. Membership lifecycle

- Duration plan calculates expiry correctly in organization timezone.
- Visit pack starts with the correct visit balance.
- Enrollment + initial payment either both commit or both roll back.
- Freeze extends expiry by the inclusive freeze duration.
- Overlapping freezes are rejected.
- Future freeze does not block access before the freeze begins.
- Active freeze blocks entry during the freeze range.
- Expired/end-of-visit memberships are marked expired by maintenance.

## 4. Payments

- $55.00 is stored as 5500 minor units.
- Partial payment reduces outstanding balance correctly.
- Membership-linked overpayment is rejected.
- Payment currency must match linked membership currency.
- Different currencies are not merged into a fake combined revenue total.
- Void preserves the original payment row and changes its status.
- Receipt amount/member/receipt number match the ledger.

## 5. Access and attendance

- RFID/card/QR keyboard-wedge input checks in an eligible member.
- Second smart-mode scan checks the member out.
- Entry-only and exit-only modes behave correctly.
- Rapid duplicate scan is ignored and logged.
- One member cannot have two open attendance sessions.
- Expired, frozen and exhausted memberships are denied.
- Lost/revoked credential no longer resolves.
- Raw credential token cannot be recovered from the database.
- Stale open session auto-closes and is flagged `forced_closed`.
- Current-inside count equals open attendance sessions for the active location.

## 6. Personal training and classes

- PT package creation uses correct member and trainer.
- Completing PT deducts exactly one session once.
- Two overlapping sessions for the same trainer are rejected.
- Class capacity cannot be exceeded under concurrent bookings.
- Overflow booking becomes waitlisted rather than over-capacity.

## 7. Leads and navigation

- Lead progresses through stages.
- Convert to Member creates exactly one member, links it, marks lead joined and redirects to the member workspace.
- Repeating conversion does not create a duplicate member.
- Global search resolves member number/name/phone, lead, and receipt number.

## 8. Stripe SaaS billing

Use Stripe test mode only.

- Checkout creates a hosted subscription session with organization metadata.
- Invalid webhook signature is rejected before JSON processing.
- Same webhook event delivered twice is processed once.
- Database update failure does not mark the webhook processed.
- `past_due` sets grace period; healthy payment clears it.
- Customer Portal opens only for Owner/Admin.
- Gym-member payment records are unaffected by SaaS subscription events.

## 9. Timezone and DST

Test at least UTC, Asia/Beirut and a DST-observing European timezone.

- Dashboard “today” matches gym-local date, not server date.
- PT/class wall-clock booking converts correctly to UTC.
- Invalid/nonexistent DST wall time is rejected instead of silently shifting.
- Receipt/audit timestamps display in organization timezone.

## 10. Recovery and operations

- Restore latest Postgres backup into a staging project.
- Restore/reconcile private Storage objects separately.
- Confirm no production secret appears in browser bundle, Git history or logs.
- Simulate failed network write; user sees error and underlying data remains consistent.
- Run `npm run typecheck` and `npm run build` in clean CI.
- Run migrations from an empty database and from the previous production migration state.
- Verify the hourly maintenance endpoint rejects missing/wrong `CRON_SECRET`.

## Release gate

Do not sell/deploy to a live gym until all critical sections 1–5 and 8–10 pass in a staging environment. PT/classes/leads become release gates only when those modules are enabled for that customer.
