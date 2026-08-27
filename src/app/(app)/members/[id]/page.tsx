import { notFound } from "next/navigation";
import {
  addMemberNoteAction,
  archiveMemberAction,
  assignAccessCredentialAction,
  enrollMembershipAction,
  freezeMembershipAction,
  recordPaymentAction,
  revokeAccessCredentialAction,
  updateMemberAction,
} from "@/app/actions";
import { PhotoUploader } from "@/components/members/photo-uploader";
import { requireAppContext } from "@/lib/app-context";
import { durationBetween, formatDate, formatDateTime, formatMoney, memberDisplayNumber } from "@/lib/format";
import { attendanceInsights, daysBetweenDates, engagementBadgeClass, whatsappHref } from "@/lib/member-insights";
import { ROLE_GROUPS, roleAllowed } from "@/lib/roles";
import { dateInTimeZone } from "@/lib/time";

type TimelineItem = {
  id: string;
  sortAt: string;
  dateLabel: string;
  title: string;
  detail: string;
  kind: "join" | "membership" | "payment" | "visit" | "note" | "credential" | "freeze";
};

function timelineDot(kind: TimelineItem["kind"]) {
  const common = "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full";
  if (kind === "payment") return `${common} bg-emerald-500`;
  if (kind === "visit") return `${common} bg-blue-500`;
  if (kind === "membership" || kind === "freeze") return `${common} bg-violet-500`;
  if (kind === "credential") return `${common} bg-amber-500`;
  if (kind === "join") return `${common} bg-[#111318]`;
  return `${common} bg-[#a0a6af]`;
}

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();

  const canManageMember = roleAllowed(ctx.role, ROLE_GROUPS.memberManagers);
  const canManageMembership = roleAllowed(ctx.role, ROLE_GROUPS.membershipManagers);
  const canViewPayments = roleAllowed(ctx.role, ROLE_GROUPS.financial);
  const canViewNotes = roleAllowed(ctx.role, ROLE_GROUPS.memberNotes);
  const canViewCredentials = roleAllowed(ctx.role, ROLE_GROUPS.accessCredentialViewers);
  const canManageCredentials = roleAllowed(ctx.role, ROLE_GROUPS.accessCredentialManagers);
  const canViewPrivateMedia = roleAllowed(ctx.role, ROLE_GROUPS.privateMemberMedia);
  const canArchive = roleAllowed(ctx.role, ROLE_GROUPS.memberArchivers);
  const canSendRenewal = roleAllowed(ctx.role, ROLE_GROUPS.retention);

  const [memberRes, plansRes, membershipsRes, attendanceRes, attendanceCountRes] = await Promise.all([
    ctx.supabase.from("members").select("*").eq("organization_id", ctx.organization.id).eq("id", id).maybeSingle(),
    ctx.supabase.from("membership_plans").select("id,name,price_minor,currency,duration_days,included_visits,billing_type").eq("organization_id", ctx.organization.id).eq("is_active", true).order("name"),
    ctx.supabase.from("memberships").select("id,status,starts_on,ends_on,visits_remaining,price_minor,currency,plan_id,created_at,membership_plans(name),membership_freezes(id,starts_on,ends_on,reason,created_at)").eq("organization_id", ctx.organization.id).eq("member_id", id).order("created_at", { ascending: false }),
    ctx.supabase.from("attendance_sessions").select("id,checked_in_at,checked_out_at,check_in_method,forced_closed").eq("organization_id", ctx.organization.id).eq("member_id", id).order("checked_in_at", { ascending: false }).limit(500),
    ctx.supabase.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).eq("member_id", id),
  ]);

  if (memberRes.error) throw new Error(memberRes.error.message);
  if (plansRes.error) throw new Error(plansRes.error.message);
  if (membershipsRes.error) throw new Error(membershipsRes.error.message);
  if (attendanceRes.error) throw new Error(attendanceRes.error.message);

  const paymentsRes = canViewPayments
    ? await ctx.supabase.from("payments").select("id,receipt_number,amount_minor,currency,payment_method,status,paid_at,membership_id").eq("organization_id", ctx.organization.id).eq("member_id", id).order("paid_at", { ascending: false }).limit(150)
    : { data: [] as any[], error: null };
  const notesRes = canViewNotes
    ? await ctx.supabase.from("member_notes").select("id,note,is_private,created_at").eq("organization_id", ctx.organization.id).eq("member_id", id).order("created_at", { ascending: false }).limit(50)
    : { data: [] as any[], error: null };
  const credentialsRes = canViewCredentials
    ? await ctx.supabase.from("access_credentials").select("id,credential_type,last_four,label,is_active,issued_at,revoked_at").eq("organization_id", ctx.organization.id).eq("member_id", id).order("issued_at", { ascending: false })
    : { data: [] as any[], error: null };

  if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  if (notesRes.error) throw new Error(notesRes.error.message);
  if (credentialsRes.error) throw new Error(credentialsRes.error.message);

  const member: any = memberRes.data;
  if (!member) notFound();

  const memberships: any[] = membershipsRes.data ?? [];
  const payments: any[] = paymentsRes.data ?? [];
  const attendance: any[] = attendanceRes.data ?? [];
  const notes: any[] = notesRes.data ?? [];
  const credentials: any[] = credentialsRes.data ?? [];
  const today = dateInTimeZone(new Date(), ctx.organization.timezone);
  const active = memberships.find((membership) => membership.status === "active" && membership.starts_on <= today && (!membership.ends_on || membership.ends_on >= today));
  const frozenNow = Boolean(active?.membership_freezes?.some((freeze: any) => freeze.starts_on <= today && freeze.ends_on >= today));
  const insight = attendanceInsights(attendance.map((visit) => visit.checked_in_at), ctx.organization.timezone);
  const visitsLast30 = insight.visitDates.filter((date) => daysBetweenDates(date, today) <= 30).length;

  let photoUrl: string | null = null;
  if (member.photo_path && canViewPrivateMedia) {
    const { data } = await ctx.supabase.storage.from("member-private").createSignedUrl(member.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }

  const paidTotals = new Map<string, number>();
  if (canViewPayments) {
    for (const payment of payments.filter((payment) => payment.status === "paid")) {
      paidTotals.set(payment.currency, (paidTotals.get(payment.currency) ?? 0) + Number(payment.amount_minor));
    }
  }
  const paidTotalDisplay = paidTotals.size
    ? [...paidTotals].map(([currency, amount]) => formatMoney(amount, currency)).join(" · ")
    : formatMoney(0, ctx.organization.base_currency);

  const renewalMessage = active
    ? `Hi ${member.first_name}, a quick reminder from ${ctx.organization.name}: your ${active.membership_plans?.name ?? "gym membership"} expires on ${formatDate(active.ends_on)}. Reply here and we'll help you renew.`
    : `Hi ${member.first_name}, this is ${ctx.organization.name}. Your gym membership is currently not active. Reply here and we'll help you renew.`;
  const whatsapp = canSendRenewal ? whatsappHref(member.phone, renewalMessage) : null;
  const daysUntilRenewal = active?.ends_on ? daysBetweenDates(today, active.ends_on) : null;

  const timeline: TimelineItem[] = [{
    id: `join-${id}`,
    sortAt: `${member.joined_at}T00:00:00.000Z`,
    dateLabel: formatDate(member.joined_at),
    title: "Joined the gym",
    detail: `${member.first_name} became a member of ${ctx.organization.name}.`,
    kind: "join",
  }];

  for (const membership of memberships) {
    timeline.push({
      id: `membership-${membership.id}`,
      sortAt: membership.created_at,
      dateLabel: formatDateTime(membership.created_at, ctx.organization.timezone),
      title: `${membership.membership_plans?.name ?? "Membership"} added`,
      detail: `${formatDate(membership.starts_on)} → ${formatDate(membership.ends_on)}`,
      kind: "membership",
    });
    for (const freeze of membership.membership_freezes ?? []) {
      timeline.push({
        id: `freeze-${freeze.id}`,
        sortAt: freeze.created_at ?? `${freeze.starts_on}T00:00:00.000Z`,
        dateLabel: formatDate(freeze.starts_on),
        title: "Membership freeze scheduled",
        detail: `${formatDate(freeze.starts_on)} → ${formatDate(freeze.ends_on)}${freeze.reason ? ` · ${freeze.reason}` : ""}`,
        kind: "freeze",
      });
    }
  }
  for (const payment of payments) {
    timeline.push({
      id: `payment-${payment.id}`,
      sortAt: payment.paid_at,
      dateLabel: formatDateTime(payment.paid_at, ctx.organization.timezone),
      title: `${payment.status === "paid" ? "Payment received" : "Payment updated"} · ${formatMoney(payment.amount_minor, payment.currency)}`,
      detail: `Receipt #${payment.receipt_number} · ${String(payment.payment_method).replaceAll("_", " ")}`,
      kind: "payment",
    });
  }
  for (const visit of attendance.slice(0, 100)) {
    timeline.push({
      id: `visit-${visit.id}`,
      sortAt: visit.checked_in_at,
      dateLabel: formatDateTime(visit.checked_in_at, ctx.organization.timezone),
      title: visit.checked_out_at ? `Gym visit · ${durationBetween(visit.checked_in_at, visit.checked_out_at)}` : "Checked in · currently inside",
      detail: `${visit.check_in_method}${visit.forced_closed ? " · checkout auto/forced" : ""}`,
      kind: "visit",
    });
  }
  for (const note of notes) {
    timeline.push({
      id: `note-${note.id}`,
      sortAt: note.created_at,
      dateLabel: formatDateTime(note.created_at, ctx.organization.timezone),
      title: note.is_private ? "Private staff note" : "Staff note",
      detail: note.note,
      kind: "note",
    });
  }
  for (const credential of credentials) {
    timeline.push({
      id: `credential-${credential.id}`,
      sortAt: credential.issued_at,
      dateLabel: formatDateTime(credential.issued_at, ctx.organization.timezone),
      title: `${credential.label || credential.credential_type} access credential issued`,
      detail: `•••• ${credential.last_four || ""}${credential.is_active ? " · active" : " · revoked"}`,
      kind: "credential",
    });
  }
  timeline.sort((a, b) => b.sortAt.localeCompare(a.sortAt));

  const membershipState = frozenNow ? "Frozen" : active ? "Active" : memberships.length ? "Needs renewal" : "No membership";
  const membershipStateClass = active && !frozenNow
    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
    : frozenNow
      ? "bg-blue-50 text-blue-800 ring-1 ring-blue-200"
      : "bg-rose-50 text-rose-800 ring-1 ring-rose-200";

  return <section className="mx-auto max-w-7xl space-y-6">
    <div className="rounded-2xl border border-[#e4e6ea] bg-white p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-2xl bg-[#eceef1]">{photoUrl ? <img src={photoUrl} alt="Member" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-lg font-bold">{member.first_name[0]}{member.last_name[0]}</div>}</div>
          <div>
            <p className="text-sm text-[#7a7f89]">{memberDisplayNumber(member.member_number)} · Member since {formatDate(member.joined_at)}</p>
            <h1 className="text-3xl font-semibold tracking-tight">{member.first_name} {member.last_name}</h1>
            <p className="mt-1 text-sm text-[#707680]">{member.phone || "No phone"} · {member.email || "No email"}</p>
            {canManageMember && <div className="mt-2"><PhotoUploader organizationId={ctx.organization.id} memberId={id} /></div>}
          </div>
        </div>
        {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-xl bg-[#111318] px-4 py-2.5 text-sm font-semibold text-white">WhatsApp renewal</a>}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl bg-[#f7f8f9] p-4"><p className="text-xs uppercase tracking-wide text-[#8a9099]">Membership</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${membershipStateClass}`}>{membershipState}</span><p className="mt-2 text-xs text-[#7a7f89]">{active?.membership_plans?.name ?? "No active plan"}</p></div>
        <div className="rounded-xl bg-[#f7f8f9] p-4"><p className="text-xs uppercase tracking-wide text-[#8a9099]">Engagement</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${engagementBadgeClass(insight.engagement)}`}>{insight.engagementLabel}</span><p className="mt-2 text-xs text-[#7a7f89]">Attendance-derived</p></div>
        <div className="rounded-xl bg-[#f7f8f9] p-4"><p className="text-xs uppercase tracking-wide text-[#8a9099]">Current streak</p><p className="mt-2 text-2xl font-semibold">{insight.currentStreak}</p><p className="text-xs text-[#7a7f89]">Best {insight.longestStreak} consecutive days</p></div>
        <div className="rounded-xl bg-[#f7f8f9] p-4"><p className="text-xs uppercase tracking-wide text-[#8a9099]">Last visit</p><p className="mt-2 font-semibold">{insight.lastVisitDate ? formatDate(insight.lastVisitDate) : "Never"}</p><p className="text-xs text-[#7a7f89]">{insight.daysSinceLastVisit == null ? "No attendance yet" : insight.daysSinceLastVisit === 0 ? "Today" : `${insight.daysSinceLastVisit} days ago`}</p></div>
        <div className="rounded-xl bg-[#f7f8f9] p-4"><p className="text-xs uppercase tracking-wide text-[#8a9099]">Visits</p><p className="mt-2 text-2xl font-semibold">{attendanceCountRes.count ?? 0}</p><p className="text-xs text-[#7a7f89]">{visitsLast30} visit days in last 30</p></div>
        <div className="rounded-xl bg-[#f7f8f9] p-4"><p className="text-xs uppercase tracking-wide text-[#8a9099]">Renewal</p><p className="mt-2 font-semibold">{active?.ends_on ? formatDate(active.ends_on) : "Due now"}</p><p className="text-xs text-[#7a7f89]">{daysUntilRenewal == null ? "No active plan" : daysUntilRenewal === 0 ? "Expires today" : `${daysUntilRenewal} days remaining`}</p></div>
      </div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Member lifecycle</h2><p className="mt-1 text-sm text-[#7a7f89]">History is composed only from data your role is authorized to view.</p></div><span className="rounded-full bg-[#f1f3f5] px-3 py-1 text-xs font-semibold">Since {formatDate(member.joined_at)}</span></div>
          <div className="mt-5 space-y-4">{timeline.slice(0, 40).map((item) => <div key={item.id} className="flex gap-3"><div className={timelineDot(item.kind)} /><div className="min-w-0 flex-1 border-b border-[#f0f1f3] pb-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-semibold">{item.title}</p><p className="text-xs text-[#8a9099]">{item.dateLabel}</p></div><p className="mt-1 text-sm text-[#6f7580]">{item.detail}</p></div></div>)}</div>
        </section>

        <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5">
          <h2 className="font-semibold">Profile & contact</h2>
          <p className="mt-1 text-sm text-[#7a7f89]">{canManageMember ? "Use international phone format (for example +961…) so WhatsApp actions work reliably." : "Read-only for your current staff role."}</p>
          {canManageMember ? <form action={updateMemberAction} className="mt-4 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="member_id" value={id} />
            <label className="text-sm">First name<input name="first_name" required defaultValue={member.first_name} className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2" /></label>
            <label className="text-sm">Last name<input name="last_name" required defaultValue={member.last_name} className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2" /></label>
            <label className="text-sm">Phone / WhatsApp<input name="phone" placeholder="+961…" defaultValue={member.phone ?? ""} className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2" /></label>
            <label className="text-sm">Email<input name="email" type="email" defaultValue={member.email ?? ""} className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2" /></label>
            <label className="text-sm">Date of birth<input name="date_of_birth" type="date" defaultValue={member.date_of_birth ?? ""} className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2" /></label>
            <label className="text-sm">Emergency contact<input name="emergency_contact_name" defaultValue={member.emergency_contact_name ?? ""} className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2" /></label>
            <label className="text-sm">Emergency phone<input name="emergency_contact_phone" defaultValue={member.emergency_contact_phone ?? ""} className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2" /></label>
            <div className="flex items-end"><button data-feedback="Saving profile…" className="w-full rounded-lg bg-[#111318] px-4 py-2.5 text-sm font-semibold text-white">Save profile</button></div>
          </form> : <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[#f7f8f9] p-3"><p className="text-xs text-[#8a9099]">Phone</p><p className="mt-1 text-sm font-medium">{member.phone || "—"}</p></div><div className="rounded-xl bg-[#f7f8f9] p-3"><p className="text-xs text-[#8a9099]">Email</p><p className="mt-1 text-sm font-medium">{member.email || "—"}</p></div><div className="rounded-xl bg-[#f7f8f9] p-3"><p className="text-xs text-[#8a9099]">Date of birth</p><p className="mt-1 text-sm font-medium">{member.date_of_birth ? formatDate(member.date_of_birth) : "—"}</p></div><div className="rounded-xl bg-[#f7f8f9] p-3"><p className="text-xs text-[#8a9099]">Emergency contact</p><p className="mt-1 text-sm font-medium">{member.emergency_contact_name || "—"}{member.emergency_contact_phone ? ` · ${member.emergency_contact_phone}` : ""}</p></div></div>}
        </section>

        <section className="rounded-2xl border border-[#e4e6ea] bg-white">
          <div className="border-b border-[#eceef1] p-5"><h2 className="font-semibold">Membership history</h2><p className="mt-1 text-sm text-[#7a7f89]">Financial totals appear only for roles authorized to read payments.</p></div>
          <div className="divide-y divide-[#f0f1f3]">{memberships.map((membership: any) => {
            const linkedPaid = canViewPayments ? payments.filter((payment: any) => payment.status === "paid" && payment.membership_id === membership.id).reduce((sum: number, payment: any) => sum + Number(payment.amount_minor), 0) : null;
            const balance = linkedPaid == null ? null : Math.max(0, Number(membership.price_minor) - linkedPaid);
            const isFrozenNow = (membership.membership_freezes ?? []).some((freeze: any) => freeze.starts_on <= today && freeze.ends_on >= today);
            return <div key={membership.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{membership.membership_plans?.name ?? "Membership"}</p><p className="mt-1 text-xs text-[#7a7f89]">{formatDate(membership.starts_on)} → {formatDate(membership.ends_on)}{membership.visits_remaining != null ? ` · ${membership.visits_remaining} visits remaining` : ""}</p>{linkedPaid != null && balance != null && <p className="mt-1 text-xs text-[#7a7f89]">Paid {formatMoney(linkedPaid, membership.currency)} · Balance {formatMoney(balance, membership.currency)}{isFrozenNow ? " · Frozen now" : ""}</p>}</div><span className="rounded-full bg-[#f0f2f4] px-2.5 py-1 text-xs font-semibold capitalize">{membership.status}</span></div>{(membership.membership_freezes ?? []).length > 0 && <div className="mt-3 space-y-1">{membership.membership_freezes.map((freeze: any) => <p key={freeze.id} className="text-xs text-[#6f7580]">Freeze: {formatDate(freeze.starts_on)} → {formatDate(freeze.ends_on)}{freeze.reason ? ` · ${freeze.reason}` : ""}</p>)}</div>}{canManageMembership && membership.status === "active" && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold">Freeze / pause membership</summary><form action={freezeMembershipAction} className="mt-3 grid gap-2 sm:grid-cols-4"><input type="hidden" name="member_id" value={id} /><input type="hidden" name="membership_id" value={membership.id} /><input name="starts_on" type="date" min={today} required className="rounded-lg border border-[#dfe2e7] px-2 py-1.5 text-xs" /><input name="ends_on" type="date" min={today} required className="rounded-lg border border-[#dfe2e7] px-2 py-1.5 text-xs" /><input name="reason" placeholder="Reason (optional)" className="rounded-lg border border-[#dfe2e7] px-2 py-1.5 text-xs" /><button data-feedback="Applying freeze…" className="rounded-lg border border-[#111318] px-2 py-1.5 text-xs font-semibold">Apply freeze</button></form></details>}</div>;
          })}{memberships.length === 0 && <p className="p-5 text-sm text-[#7a7f89]">No memberships yet.</p>}</div>
        </section>

        <section className="rounded-2xl border border-[#e4e6ea] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceef1] p-5"><div><h2 className="font-semibold">Attendance history</h2><p className="mt-1 text-sm text-[#7a7f89]">Check-in, checkout and visit duration feed the engagement score and streak.</p></div><div className="flex gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${engagementBadgeClass(insight.engagement)}`}>{insight.engagementLabel}</span><span className="rounded-full bg-[#f1f3f5] px-2.5 py-1 text-xs font-semibold">{visitsLast30} visit days / 30d</span></div></div><div className="divide-y divide-[#f0f1f3]">{attendance.slice(0, 60).map((visit: any) => <div key={visit.id} className="flex items-center justify-between gap-4 p-4 text-sm"><div><p className="font-medium">{formatDateTime(visit.checked_in_at, ctx.organization.timezone)}</p><p className="text-xs text-[#7a7f89]">{visit.check_in_method}{visit.forced_closed ? " · auto/forced close" : ""}</p></div><div className="text-right"><p>{visit.checked_out_at ? formatDateTime(visit.checked_out_at, ctx.organization.timezone) : "Currently inside"}</p><p className="text-xs text-[#7a7f89]">{durationBetween(visit.checked_in_at, visit.checked_out_at)}</p></div></div>)}{!attendance.length && <p className="p-5 text-sm text-[#7a7f89]">No visits recorded.</p>}</div></section>
      </div>

      <div className="space-y-6">
        <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><h2 className="font-semibold">Renewal & contact</h2><div className="mt-4 rounded-xl bg-[#f7f8f9] p-4"><p className="text-sm font-semibold">{active?.membership_plans?.name ?? "Membership renewal required"}</p><p className="mt-1 text-sm text-[#7a7f89]">{active?.ends_on ? `Expires ${formatDate(active.ends_on)}${daysUntilRenewal != null ? ` · ${daysUntilRenewal} days remaining` : ""}` : "No active membership today."}</p></div>{canSendRenewal ? (whatsapp ? <a href={whatsapp} target="_blank" rel="noreferrer" className="mt-3 flex w-full justify-center rounded-lg bg-[#111318] px-4 py-2.5 text-sm font-semibold text-white">Send renewal on WhatsApp</a> : <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Add the member&apos;s phone with country code to enable WhatsApp renewal messaging.</p>) : <p className="mt-3 text-xs text-[#8a9099]">Renewal outreach is managed by reception/management roles.</p>}</section>

        {canManageMembership && <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><h2 className="font-semibold">Add / renew membership</h2><form action={enrollMembershipAction} className="mt-4 space-y-3"><input type="hidden" name="member_id" value={id} /><label className="block text-sm">Plan<select name="plan_id" required className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2.5"><option value="">Choose plan…</option>{(plansRes.data ?? []).map((plan: any) => <option key={plan.id} value={plan.id}>{plan.name} · {formatMoney(plan.price_minor, plan.currency)}</option>)}</select></label><label className="block text-sm">Start date<input name="starts_on" type="date" required defaultValue={today} className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2.5" /></label><label className="block text-sm">Amount paid now<input name="amount_paid" inputMode="decimal" defaultValue="0" className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2.5" /></label><label className="block text-sm">Payment method<select name="payment_method" defaultValue="cash" className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2.5"><option value="cash">Cash</option><option value="card_terminal">Card terminal</option><option value="bank_transfer">Bank transfer</option><option value="whish">Whish</option><option value="omt">OMT</option><option value="other">Other</option></select></label><button data-feedback="Creating membership…" className="w-full rounded-lg bg-[#111318] px-4 py-2.5 text-sm font-semibold text-white">Create membership</button></form></section>}

        {canViewPayments && <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Payments</h2><span className="text-sm text-[#6f7580]">Lifetime: {paidTotalDisplay}</span></div><div className="mt-4 space-y-2">{payments.slice(0,8).map((payment:any)=><div key={payment.id} className="flex items-center justify-between rounded-xl bg-[#f7f8f9] p-3 text-sm"><div><p className="font-medium"><a href={`/receipts/${payment.id}`} className="underline decoration-[#c5c9cf] underline-offset-4">Receipt #{payment.receipt_number}</a></p><p className="text-xs capitalize text-[#7a7f89]">{String(payment.payment_method).replaceAll("_"," ")} · {payment.status}</p></div><span className="font-semibold">{formatMoney(payment.amount_minor,payment.currency)}</span></div>)}</div><form action={recordPaymentAction} className="mt-4 grid gap-3"><input type="hidden" name="member_id" value={id}/><input type="hidden" name="currency" value={ctx.organization.base_currency}/><label className="text-sm">Apply to membership<select name="membership_id" className="mt-1 w-full rounded-lg border border-[#dfe2e7] px-3 py-2"><option value="">General payment</option>{memberships.map((membership:any)=><option key={membership.id} value={membership.id}>{membership.membership_plans?.name} · {formatDate(membership.starts_on)}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><input name="amount" required inputMode="decimal" placeholder="Amount" className="rounded-lg border border-[#dfe2e7] px-3 py-2"/><select name="payment_method" defaultValue="cash" className="rounded-lg border border-[#dfe2e7] px-3 py-2"><option value="cash">Cash</option><option value="card_terminal">Card</option><option value="bank_transfer">Transfer</option><option value="whish">Whish</option><option value="omt">OMT</option></select></div><button data-feedback="Recording payment…" className="rounded-lg border border-[#111318] px-4 py-2 text-sm font-semibold">Record payment</button></form></section>}

        {canViewCredentials && <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><h2 className="font-semibold">Access cards & fobs</h2><div className="mt-3 space-y-2">{credentials.map((credential:any)=><div key={credential.id} className="rounded-xl bg-[#f7f8f9] p-3 text-sm"><p className="font-medium capitalize">{credential.label||credential.credential_type} •••• {credential.last_four||""}</p><div className="mt-1 flex items-center justify-between gap-3"><p className="text-xs text-[#7a7f89]">{credential.is_active?"Active":"Revoked"} · issued {formatDateTime(credential.issued_at,ctx.organization.timezone)}</p>{canManageCredentials&&credential.is_active&&<form action={revokeAccessCredentialAction}><input type="hidden" name="member_id" value={id}/><input type="hidden" name="credential_id" value={credential.id}/><button data-feedback="Revoking credential…" className="text-xs font-semibold text-red-700">Revoke</button></form>}</div></div>)}</div>{canManageCredentials&&<form action={assignAccessCredentialAction} className="mt-4 space-y-3"><input type="hidden" name="member_id" value={id}/><select name="credential_type" defaultValue="rfid" className="w-full rounded-lg border border-[#dfe2e7] px-3 py-2"><option value="rfid">RFID</option><option value="nfc">NFC</option><option value="magstripe">Magstripe</option><option value="barcode">Barcode</option><option value="qr">QR</option></select><input name="raw_token" required autoComplete="off" placeholder="Swipe/tap card here" className="w-full rounded-lg border border-[#dfe2e7] px-3 py-2"/><input name="label" placeholder="Label (optional)" className="w-full rounded-lg border border-[#dfe2e7] px-3 py-2"/><button data-feedback="Assigning credential…" className="w-full rounded-lg border border-[#111318] px-4 py-2 text-sm font-semibold">Assign credential</button></form>}</section>}

        {canViewNotes && <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><h2 className="font-semibold">Notes</h2><form action={addMemberNoteAction} className="mt-3"><input type="hidden" name="member_id" value={id}/><textarea name="note" required rows={3} placeholder="Operational note…" className="w-full rounded-lg border border-[#dfe2e7] px-3 py-2 text-sm"/><button data-feedback="Adding note…" className="mt-2 rounded-lg border border-[#111318] px-3 py-2 text-sm font-semibold">Add note</button></form><div className="mt-4 space-y-2">{notes.slice(0,10).map((note:any)=><div key={note.id} className="rounded-xl bg-[#f7f8f9] p-3 text-sm"><div className="flex items-center justify-between gap-2"><p>{note.note}</p>{note.is_private&&<span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900">Private</span>}</div><p className="mt-1 text-xs text-[#7a7f89]">{formatDateTime(note.created_at,ctx.organization.timezone)}</p></div>)}</div></section>}

        {canArchive && <section className="rounded-2xl border border-red-100 bg-white p-5"><h2 className="font-semibold">Archive member</h2><p className="mt-1 text-sm text-[#7a7f89]">The profile disappears from active operations but financial, membership, access and attendance history is retained.</p><form action={archiveMemberAction} className="mt-3"><input type="hidden" name="member_id" value={id}/><button data-feedback="Archiving member…" className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Archive</button></form></section>}
      </div>
    </div>
  </section>;
}
