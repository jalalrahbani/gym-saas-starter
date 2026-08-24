# Product Blueprint

## Plain-language product story

The platform replaces the collection of spreadsheets, notebooks, calendars, payment lists and WhatsApp reminders that commonly accumulate around a gym.

A gym owner signs up, creates the gym and location, chooses the currency/timezone, creates membership plans and invites staff. Existing members are imported instead of retyped.

At reception, staff work from a single operational dashboard. A new visitor can be captured as a lead, converted to a member, assigned a membership and given a digital QR card. When that person arrives, the receptionist scans or searches them. The system checks the membership, visit balance and warnings, then records attendance. When the member pays, the payment is recorded against that member/membership and a receipt is generated. When the membership approaches expiry, the renewal queue surfaces it automatically.

For personal training, the same member record contains PT package balance and bookings. Completing a PT session updates the schedule and package balance together. Classes use the same identity and membership eligibility rules instead of maintaining a second roster.

The owner never has to reconcile separate tools to answer basic questions: who is active, who owes money, who is expiring, who came today, what revenue came in, which leads converted and what the trainers are doing. Reports are produced from the same underlying transactions that reception uses throughout the day.

## Marketing explanation

### One system from first enquiry to long-term member

**1. Capture the opportunity**  
Record a walk-in, Instagram lead or referral in seconds. Staff know who needs follow-up and why they were interested.

**2. Turn the lead into a member**  
Create the member profile, choose a plan, take a profile photo and record the first payment. The member immediately has a clear membership status and digital identity.

**3. Make reception effortless**  
Search a name, phone number or member ID — or scan a QR code. The screen instantly shows whether access is valid, expiring, exhausted or requires attention.

**4. Keep memberships accurate automatically**  
Start dates, expiries, visit balances, freezes and renewals live in one membership history. Staff stop calculating dates manually.

**5. Keep every dollar traceable**  
Record cash, terminal card, transfer or other payment methods. Generate receipts, track outstanding balances and void/refund transactions without deleting history.

**6. Run training and classes from the same member record**  
Book PT, deduct completed sessions from packages, prevent trainer conflicts and manage class capacity without separate calendars and lists.

**7. Never miss a renewal**  
The dashboard builds a daily action queue: expiring memberships, overdue balances, follow-ups and upcoming sessions.

**8. Understand the business**  
Owners see attendance, member growth, revenue, renewals, churn and lead conversion without merging spreadsheets.

**9. Give members self-service without losing control**  
The member portal exposes only the information/actions the gym allows: QR card, bookings, balances, receipts and announcements.

**10. Scale to more locations without rebuilding**  
Every record already belongs to an organization and, where relevant, a location. A second branch uses the same account, permissions and reports rather than a separate installation.

## Core architecture

```text
Browser / PWA
      |
      v
Next.js UI + server routes/actions
      |
      +---- Auth/session ---- Supabase Auth
      |
      +---- Business rules / authorization
      |
      v
Postgres (Supabase)
  |   - constraints
  |   - transactions
  |   - indexes
  |   - Row Level Security
  |
  +---- Private Storage (photos/documents)
  |
  +---- background jobs / webhooks / notifications

External adapters (optional):
SaaS billing | member payment processors | email | WhatsApp | SMS | hardware
```

## Why the pieces are hard to break apart incorrectly

### Tenant isolation at the database layer
Every business row has `organization_id`. Authorization is not only a menu/UI decision: Postgres Row Level Security checks whether the authenticated user belongs to the organization. This dramatically reduces the blast radius of an application bug that forgets a tenant filter.

### Business invariants live below the UI
Dates, non-negative amounts, role boundaries and unique tenant identifiers are validated in the database as well as the application. A second client or future mobile app cannot bypass those basic rules simply by not using the original form.

### Financial history is non-destructive
Payments have status transitions such as void/refund instead of normal deletion. This makes revenue changes explainable and auditable.

### Multi-step operations use transactions
Examples: completing a PT session and decrementing the PT package, or creating a membership and recording its initial payment. These operations should be committed together or rolled back together, preventing half-finished state.

### Webhooks are idempotent
Payment/subscription providers can send the same event repeatedly. `webhook_events` stores a provider event ID so the same external event cannot be applied twice.

### Uploaded files are separate from operational rows
Database rows store metadata/path; private object storage holds the actual files. This keeps database performance predictable and permits separate storage retention/backups.

### Audit logs explain sensitive changes
Permission changes, check-in overrides, financial status changes and other critical actions produce immutable audit records.

### Release safety
Schema migrations, type checking, build verification, unit/integration tests, RLS tests and end-to-end tests run before deployment. Production changes are deployed through version control, not manual database editing.

### Recovery
Production uses automated database backup/PITR where available plus separate protection/export for stored photos/documents. Data loss response is tested, not merely documented.

## Release sequence

### Foundation (this repository)
- Next.js/TypeScript app shell
- Responsive dashboard and member directory demo
- Supabase client boundary
- Multi-tenant Postgres schema
- RLS tenant isolation helpers/policies
- CI build/typecheck
- Product/UI documentation

### V1 pilot
- Authentication and organization onboarding
- Real member CRUD
- Membership plan CRUD
- Membership assignment/renewal/freeze
- Payment recording/receipts/balances
- Check-in flow + QR
- Basic dashboard/reports
- Staff invitations/roles
- Audit events
- CSV import

### V1 commercial
- SaaS subscription billing
- Trial/grace/read-only states
- hardened RLS tests and authorization tests
- production backups/monitoring/error reporting
- member portal QR/status
- email notifications
- support/admin console
- privacy/terms/data export/delete workflows

### Growth
- PT
- classes
- CRM/leads
- advanced reporting
- messaging automations
- multi-location operator UX

### Ecosystem
- official WhatsApp/SMS
- online member payments
- hardware/access control
- public API/webhooks
- native apps if justified
- AI analytics and retention assistance
