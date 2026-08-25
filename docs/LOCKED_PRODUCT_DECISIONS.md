# Locked Product Decisions

These choices resolve the earlier product questions into one coherent default architecture. They are deliberately conservative: broad enough for a commercial gym SaaS, but restrictive enough to avoid unnecessary integration and permission complexity in V1.

## 1. Market, packaging and billing

- Working repository name: `gym-saas-starter`. Commercial name remains intentionally undecided because GymDesk is already an established product.
- Launch customer: independent gyms and fitness/PT studios first; architecture remains usable for martial arts, yoga/Pilates and class-based studios.
- Geography: international product, with Lebanon/Middle East-friendly currency and payment recording from day one.
- SaaS model: monthly and annual subscriptions, 14-day free trial, self-service onboarding.
- Commercial billing unit: organization subscription with location allowances. No per-staff fee. Active-member thresholds can be introduced only if operating cost requires them.
- Plans: Starter, Growth, Scale. Feature flags control plan access; avoid maintaining separate codebases.
- Cancellation: self-service. 7-day payment-failure grace period, then read-only mode. No data deletion on billing failure.
- Cancelled data retention: 90 days by default, with export available during retention.

## 2. Tenant and branch structure

- One organization can own multiple locations.
- Owners/admins can view consolidated or location-filtered data.
- Members have a home location but can be granted network-wide access through membership rules.
- Plans and prices may be organization-wide or location-specific.
- Staff can be organization-wide or assigned to a location.
- Every tenant-owned table carries `organization_id`. Location-scoped records also carry `location_id`.

## 3. Authentication and permissions

- Supabase Auth with email/password and invitation flows first.
- Roles in V1: Owner, Admin, Manager, Reception, Trainer, Accountant.
- Fixed roles in V1; custom permissions later. Fixed roles are easier to test and safer to ship.
- Owner/Admin MFA is strongly recommended and can later be enforced.
- Each staff member has an individual account. Shared credentials are not supported.
- Reception PIN switching is a later convenience feature, not the primary authentication mechanism.
- Every important write is attributable to a user and can create an audit event.

## 4. Member record

- Required: first name, last name. At least one usable contact method should be required by the application workflow.
- Optional: mobile, email, DOB, emergency contact, photo, address-like custom fields later.
- Profile photo is ordinary ID/recognition photography only; no biometric recognition.
- Tags and notes are supported.
- Documents/waivers use private object storage and metadata records; digital signatures are a later module.
- Member history is represented as a timeline assembled from memberships, payments, check-ins, sessions, notes and audit events.
- Members are archived, not hard-deleted, once they have financial or attendance history.

## 5. Memberships

- V1 plan types: fixed-duration, recurring-capable plan definition, visit pack and day-pass-compatible fixed duration.
- Plans support custom duration, price, currency and optional included visits.
- Automatic expiry calculation is application logic, with database constraints validating dates.
- Freeze/pause is supported and preserved as history.
- Manual extensions are allowed for Manager/Admin/Owner and audited.
- Auto-renew is modeled but payment collection is an integration, not a prerequisite for membership use.
- Upgrades/downgrades, family plans and corporate billing are later workflows built on the same organization/member/membership model.

## 6. Payments and finance

- Core system always supports recording external payments: cash, card terminal, transfer, Whish, OMT and custom methods.
- Online payment processing is optional through provider adapters. Stripe is the first international adapter where available.
- Never store raw card data.
- Partial payments and outstanding balances are supported by financial workflow design.
- Receipts are supported; invoices/tax documents are enabled per jurisdiction later.
- Payments are never normally deleted. They are voided/refunded with history.
- Discounts are recorded and can later require approval thresholds.
- Financial access is restricted by role.
- Revenue is categorized by memberships, PT, classes, retail and other.
- Expense/P&L features are a later module; the gym platform is not positioned as a full accounting ledger.

## 7. Check-in

- Supported methods: member search, phone, member number, QR and generic barcode scanner input.
- Digital membership card with QR is the preferred member-side credential.
- Expired/exhausted memberships warn or block according to gym settings.
- Overrides require a reason and are audited.
- Duplicate rapid check-ins are prevented by application rules.
- Occupancy/currently-inside tracking is later because it needs checkout or inferred-exit policy.

## 8. Personal training

- Trainer calendars, PT packages and remaining-session balances are core Growth features.
- Statuses: scheduled, completed, cancelled, no-show.
- Reception/manager can book; trainers can manage their own permitted schedules.
- Conflict detection is mandatory before release.
- Commission model supports future fixed-per-session or percentage rules, but payroll is a later module.

## 9. Classes

- Classes are a Growth module, not a launch blocker.
- Capacity, bookings, waitlist, plan eligibility, class packs and no-show tracking are anticipated.
- Members eventually self-book through the member portal.

## 10. Leads and CRM

- Leads are included because acquisition-to-membership conversion is commercially valuable.
- Default stages: New → Contacted → Trial → Negotiating → Joined / Lost.
- Source, follow-up time, trial status and lost reason are tracked.
- Conversion reporting is by source, location, staff member and period.

## 11. Communication

- V1 transactional channel: email plus in-app notifications.
- V1 WhatsApp convenience: open a pre-filled WhatsApp conversation; no unofficial automation libraries.
- Official WhatsApp Business API/SMS integrations are later provider adapters.
- Templates, opt-out/consent state and audience segments are first-class data concepts before automated marketing is enabled.
- Default automations: membership expiry, overdue balance, booking reminder and inactive-member win-back.

## 12. Member portal and mobile

- Responsive web/PWA first; no native iOS/Android app in V1.
- Member portal eventually shows membership state, QR card, payments/receipts, bookings, PT balance, classes and announcements.
- Self-service renewal/payment is enabled only when a payment provider is configured.
- Native apps can be added later without changing the core API/data model.

## 13. Website and widgets

- Core SaaS remains management software.
- Public lead/trial form and embeddable schedule/join widgets are later growth features.
- A full website builder is intentionally excluded from early releases to avoid competing product scope.

## 14. Analytics and reporting

- Core: active members, new joins, renewals, expiries, attendance, revenue, balances and plan mix.
- Growth: churn, retention cohorts, lead conversion, trainer/PT reporting and location comparisons.
- Filters: organization/location, date range, plan, trainer where applicable.
- Exports: CSV first, then formatted Excel/PDF.
- Scheduled email digests are later background jobs.

## 15. Inventory, retail and lockers

- Inventory/POS is later. The database/API can receive product sales as a separate module without contaminating membership/payment logic.
- Locker/equipment booking is later and should be configuration-driven if added.

## 16. Localization

- English UI first with all user-facing copy centralized for i18n.
- Arabic RTL and French are next languages.
- Organization has timezone and base currency.
- Individual payments store their own ISO currency. Multi-currency reports do not silently convert; totals are separated by currency unless a configured FX rate exists.
- Dates/times are stored in UTC and displayed in organization/location timezone.

## 17. Onboarding and migration

- Self-service onboarding: organization → location → currency/timezone → plans → staff → import members → ready.
- CSV/Excel import is mandatory before broad commercial launch.
- Import uses mapping + validation preview + error report + reversible batch ID.
- Demo data can be enabled for trial accounts but must be clearly separable from real data.

## 18. Security, privacy and resilience

- Defense in depth: Supabase Auth + server-side authorization + Postgres Row Level Security.
- Service/secret credentials are server-only.
- Sensitive storage buckets are private with policies.
- Owner/Admin MFA support.
- Rate limiting for auth, public forms and write-heavy endpoints.
- Audit logs for financial changes, overrides, permission changes and destructive/archive actions.
- Soft delete/archive for business records; immutable audit history.
- Idempotency for subscription/payment webhooks.
- Database transactions for operations that must succeed or fail together.
- Production backups plus a separate strategy for object storage, because database backups do not inherently protect uploaded storage objects.
- Schema migrations are version-controlled and tested.

## 19. SaaS operator console

- Internal super-admin console: organizations, subscriptions, usage, plan, health and support metadata.
- No casual browsing of member data.
- Future support impersonation must be time-limited, explicitly authorized and fully audited.
- Trial extension, plan change, suspension and support notes are allowed.

## 20. Branding

- Gym logo, name, location identity, receipt/member-card branding and basic accent configuration.
- Custom domains and full white-label removal are later Scale features.

## 21. Hardware and API

- Generic USB barcode/QR scanners that behave like keyboards require no vendor SDK and are the preferred first hardware path.
- RFID/turnstile/smart-lock integrations come later through a stable integration API.
- Public API and webhooks are later; internal modules already use stable service boundaries so the public API can mirror them.
- Google Calendar/Zapier/Make/accounting connectors are later integrations.

## 22. AI

- AI is not a V1 dependency.
- Later AI features: natural-language analytics, renewal-risk ranking, campaign drafting and anomaly explanations.
- AI never becomes the source of truth for payments, access status or permissions.

## 23. Product priority score

- Member management: 10/10
- Memberships: 10/10
- Check-in: 10/10
- Payments/receipts: 10/10
- Reporting: 9/10
- PT: 8/10
- Leads/CRM: 8/10
- Member portal/PWA: 8/10
- Multi-location: 8/10 architecture, 6/10 launch UI
- WhatsApp: 7/10, official automation later
- Classes: 7/10
- Inventory/POS: 4/10
- AI: 3/10 until core operational data is reliable

## Member lifecycle, engagement and retention intelligence

- A member profile must show the original `joined_at` date prominently as **Member since**; renewals never overwrite the original join date.
- Membership validity and attendance engagement are separate concepts. A paid/valid member can still be disengaged and need retention outreach.
- Engagement is calculated from attendance sessions using gym-local calendar dates:
  - **5+ day streak:** current consecutive check-in streak of five or more calendar days.
  - **Regular:** visited within the last seven days but current streak is below five.
  - **At risk:** no recorded visit for 8–30 days.
  - **Inactive:** no recorded visit for more than 30 days, or no attendance history yet.
- Member screens show current streak, longest observed streak, last visit, lifetime visit count and recent 30-day visit frequency.
- The member lifecycle timeline combines join, membership/renewal, freeze, payment, attendance, credential and staff-note events in chronological order.
- Phone numbers should be stored in international/E.164-style format when possible (for example `+961...`) so WhatsApp deep links work reliably.
- Renewal queues generate human-reviewed pre-filled WhatsApp messages containing the member first name, plan name and expiry date.
- Retention queues also include at-risk/inactive win-back outreach and optional recognition messages for members on 5+ day streaks.
- Official automated WhatsApp delivery remains a later provider integration; V1 uses explicit staff-triggered deep links so messages are reviewed before sending.
