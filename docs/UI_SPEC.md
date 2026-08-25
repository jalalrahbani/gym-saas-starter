# User Interface Specification

## Global shell

### Desktop

A persistent left sidebar handles module navigation. A top bar remains visible while scrolling.

**Left sidebar, top to bottom**
1. Gym logo/name and current location.
2. Operate: Dashboard, Members, Check-in, Memberships, Payments, Training, Classes, Leads.
3. Manage: Messages, Reports, Staff, Settings.
4. Bottom area later: Help, account, subscription status.

**Top bar, left to right**
1. Current organization/location breadcrumb.
2. Global search (`Ctrl/Cmd + K`).
3. Quick Add button.
4. Notifications.
5. User avatar/account menu.

The Quick Add menu should create the most common objects without forcing the user to navigate first: Member, Payment, Check-in, PT booking, Lead.

### Mobile/tablet

The content becomes single-column. The primary actions use a compact top bar and bottom navigation for Dashboard, Members, Check-in, Schedule and More. Admin-heavy pages remain responsive but are optimized for desktop.

## Dashboard

**Top:** greeting, date, location selector and reporting-period selector.

**First row:** four operational cards:
- Active members
- Checked in today
- Revenue this period
- Needs attention

**Second row:**
- Large left panel: Renewal Queue with immediate Renew action.
- Right panel: Recent Check-ins with member image/status.

**Third row later:** revenue trend, attendance trend, PT/class schedule and lead follow-ups.

Dashboard rule: every warning card must link to the exact filtered list needed to resolve it.

## Members

**Header:** page title + New Member.

**Toolbar:** global member search, Status filter, Plan filter, Location filter, Import/Export.

**Table:** photo/name, member number, contact, plan, expiry/visits, status, quick actions.

Clicking a member opens the Member Profile rather than editing directly in the table.

## Member Profile

**Profile header:** photo, full name, member number, status, primary contact and high-value actions.

**Action bar:** Check In, Renew, Record Payment, Book PT, Message.

**Tabs:**
- Overview
- Memberships
- Payments
- Attendance
- Training
- Notes
- Documents
- Timeline

The Overview should answer: Is this person allowed in? What do they owe? When do they expire? What is their next booking?

## Check-in

This is intentionally a dedicated high-speed screen.

**Center:** oversized scan/search input accepting QR/barcode/member number/phone/name.

**Result card:** large member photo, name, membership status, expiry/visits remaining, balance warning.

**Primary result:** green successful check-in or a clear warning state.

**Expired state:** Renew, Day Pass, Manager Override. Override requires reason.

A kiosk mode can later remove the normal navigation and allow member self-scan.

## Memberships

Two views:

1. **Plans** — configure name, duration/visits, price, location availability, active state.
2. **Membership ledger** — all member memberships with active/paused/expired filters.

The membership editor uses a right-side drawer so reception can renew without losing page context.

## Payments

**Top cards:** revenue, outstanding balances, refunds/voids, payment-method mix.

**Ledger:** receipt number, member, amount/currency, method, status, staff member, timestamp.

Payment details open a drawer containing the immutable history and allowed actions: receipt, refund, void. There is no destructive Delete button.

## Training

**Default view:** week calendar grouped by trainer.

**Left filter:** location, trainer, status.

**Booking drawer:** member, trainer, PT package, start/end, notes.

Conflict detection runs before save. Completing a session updates package balance in the same transaction.

## Classes

Calendar/list toggle. Each class card shows instructor, capacity, booked count and waitlist. Opening a session shows roster and check-in/no-show status.

## Leads / CRM

**Default:** Kanban columns New, Contacted, Trial, Negotiating, Joined, Lost.

**Secondary list view:** sortable/filterable lead table.

Each lead detail drawer shows source, contact info, follow-up, notes and Convert to Member.

## Messages

Start with templates and a delivery history rather than a complex marketing automation builder.

Segments appear on the left; message editor on the right. Automated sends are added only after consent and provider integrations are production-ready.

## Reports

**Top:** date range and location selector.

**Report catalog:** Membership, Revenue, Attendance, Retention, Leads, PT/Classes.

Every report shows KPI cards, one or two charts, underlying table and Export.

## Staff

Staff list with role, location, last activity and status. Owners/Admins invite users and change roles. Sensitive permission changes require re-auth/MFA later and create audit events.

## Settings

Grouped tabs:
- Gym & Locations
- Membership Plans
- Payments
- Check-in
- Communications
- Branding
- Staff & Permissions
- Imports & Exports
- Security
- Billing & Subscription

Danger-zone operations are isolated at the bottom and require explicit confirmation.

## Member portal

Mobile-first portal:
- Home: membership state + QR card
- Book: classes/PT
- Payments: balances and receipts
- Activity: attendance and session history
- Account: profile and preferences

It shares APIs/data rules with the staff product; it does not duplicate business logic.

## Member intelligence additions

### Members directory
Each member row should expose enough context to act without opening the profile:
- Member since / original join date
- Current membership state (Active, Frozen, Needs renewal, No membership)
- Attendance-derived engagement state (5+ day streak, Regular, At risk, Inactive)
- Current streak and longest observed streak
- Last visit and days since last visit
- Phone number and WhatsApp renewal action when relevant

### Member profile header
The member header contains six operational summary cards:
1. Membership state and current plan
2. Engagement state
3. Current / best attendance streak
4. Last visit
5. Lifetime visits + recent 30-day visit days
6. Renewal date / days remaining

The primary CTA is **WhatsApp renewal** when a usable phone number exists.

### Member lifecycle timeline
A single timeline starts at the original join date and interleaves:
- Join event
- Membership enrollment / renewals
- Membership freezes
- Payments / receipts
- Check-ins / check-outs / visit duration
- Access-card issuance/revocation
- Staff notes

### Retention & Messages
The retention center contains live queues for:
- Memberships expiring within 14 days → WhatsApp renewal
- Members at risk (8–30 days without a visit) → win-back WhatsApp
- Inactive members (30+ days / never visited) → reactivation outreach
- Members on 5+ consecutive-day streaks → optional recognition message
