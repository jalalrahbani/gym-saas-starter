import Link from "next/link";
import { requireAppContext } from "@/lib/app-context";
import { formatDate } from "@/lib/format";
import { attendanceInsights, whatsappHref } from "@/lib/member-insights";
import { dateInTimeZone } from "@/lib/time";

export default async function MessagesPage() {
  const ctx = await requireAppContext();
  const now = new Date();
  const today = dateInTimeZone(now, ctx.organization.timezone);
  const inFourteen = dateInTimeZone(new Date(now.getTime() + 14 * 86_400_000), ctx.organization.timezone);
  const recentSince = new Date(now.getTime() - 120 * 86_400_000).toISOString();

  const [expiringRes, membersRes, attendanceRes] = await Promise.all([
    ctx.supabase
      .from("memberships")
      .select("id,member_id,ends_on,members(first_name,last_name,phone,email),membership_plans(name)")
      .eq("organization_id", ctx.organization.id)
      .eq("status", "active")
      .gte("ends_on", today)
      .lte("ends_on", inFourteen)
      .order("ends_on")
      .limit(150),
    ctx.supabase
      .from("members")
      .select("id,first_name,last_name,phone,email,joined_at")
      .eq("organization_id", ctx.organization.id)
      .eq("status", "active")
      .is("archived_at", null)
      .limit(1000),
    ctx.supabase
      .from("attendance_sessions")
      .select("member_id,checked_in_at")
      .eq("organization_id", ctx.organization.id)
      .gte("checked_in_at", recentSince)
      .order("checked_in_at", { ascending: false })
      .limit(10000),
  ]);

  if (expiringRes.error) throw new Error(expiringRes.error.message);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (attendanceRes.error) throw new Error(attendanceRes.error.message);

  const attendanceByMember = new Map<string, string[]>();
  for (const visit of attendanceRes.data ?? []) {
    const rows = attendanceByMember.get((visit as any).member_id) ?? [];
    rows.push((visit as any).checked_in_at);
    attendanceByMember.set((visit as any).member_id, rows);
  }

  const engagementRows = (membersRes.data ?? []).map((member: any) => ({
    member,
    insight: attendanceInsights(attendanceByMember.get(member.id) ?? [], ctx.organization.timezone, now),
  }));

  const streakMembers = engagementRows.filter(({ insight }) => insight.currentStreak >= 5).sort((a, b) => b.insight.currentStreak - a.insight.currentStreak).slice(0, 50);
  const atRisk = engagementRows.filter(({ insight }) => insight.engagement === "at_risk").sort((a, b) => (b.insight.daysSinceLastVisit ?? 0) - (a.insight.daysSinceLastVisit ?? 0)).slice(0, 50);
  const inactive = engagementRows.filter(({ insight }) => insight.engagement === "inactive").slice(0, 50);

  return <section className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm text-[#7a7f89]">Member communication</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Retention & Messages</h1><p className="mt-2 max-w-3xl text-sm text-[#7a7f89]">Renewal outreach and engagement follow-up are generated from live membership dates and attendance behavior. Staff can review the segment, then open a pre-filled WhatsApp message.</p></div>
      <Link href="/members" className="rounded-lg border border-[#dfe2e7] bg-white px-4 py-2.5 text-sm font-semibold">Open member directory</Link>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><p className="text-sm text-[#6f7580]">Renewals due</p><p className="mt-3 text-3xl font-semibold">{expiringRes.data?.length ?? 0}</p><p className="mt-2 text-xs text-[#8b919a]">Expire within 14 days</p></div>
      <div className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><p className="text-sm text-[#6f7580]">5+ day streaks</p><p className="mt-3 text-3xl font-semibold">{streakMembers.length}</p><p className="mt-2 text-xs text-[#8b919a]">High-engagement members</p></div>
      <div className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><p className="text-sm text-[#6f7580]">At risk</p><p className="mt-3 text-3xl font-semibold">{atRisk.length}</p><p className="mt-2 text-xs text-[#8b919a]">No visit for 8–30 days</p></div>
      <div className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><p className="text-sm text-[#6f7580]">Inactive</p><p className="mt-3 text-3xl font-semibold">{inactive.length}</p><p className="mt-2 text-xs text-[#8b919a]">No visit for 30+ days / never</p></div>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white">
        <div className="border-b border-[#eceef1] p-5"><h2 className="font-semibold">Renewal WhatsApp queue</h2><p className="mt-1 text-sm text-[#7a7f89]">Members expiring within 14 days, with the exact plan and renewal date inserted into the message.</p></div>
        <div className="divide-y divide-[#f0f1f3]">
          {(expiringRes.data ?? []).map((row: any) => {
            const member = row.members;
            const name = `${member?.first_name ?? ""} ${member?.last_name ?? ""}`.trim();
            const text = `Hi ${member?.first_name ?? "there"}, a quick reminder from ${ctx.organization.name}: your ${row.membership_plans?.name ?? "gym membership"} expires on ${formatDate(row.ends_on)}. Reply here and we'll help you renew.`;
            const wa = whatsappHref(member?.phone ?? null, text);
            const mail = member?.email ? `mailto:${encodeURIComponent(member.email)}?subject=${encodeURIComponent(`${ctx.organization.name} membership renewal`)}&body=${encodeURIComponent(text)}` : null;
            return <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{name}</p><p className="mt-1 text-xs text-[#7a7f89]">{row.membership_plans?.name ?? "Membership"} · expires {formatDate(row.ends_on)} · {member?.phone || "no phone"}</p></div><div className="flex gap-2">{wa ? <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg bg-[#111318] px-3 py-2 text-xs font-semibold text-white">WhatsApp renewal</a> : <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Add +country-code phone</span>}{mail && <a href={mail} className="rounded-lg border border-[#dfe2e7] px-3 py-2 text-xs font-semibold">Email</a>}</div></div>;
          })}
          {!(expiringRes.data?.length) && <p className="p-5 text-sm text-[#7a7f89]">No renewals are due in the next 14 days.</p>}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white">
        <div className="border-b border-[#eceef1] p-5"><h2 className="font-semibold">Engagement watchlist</h2><p className="mt-1 text-sm text-[#7a7f89]">Members with valid profiles who are drifting away based on actual check-ins.</p></div>
        <div className="divide-y divide-[#f0f1f3]">
          {[...atRisk, ...inactive].slice(0, 50).map(({ member, insight }) => {
            const text = `Hi ${member.first_name}, we haven't seen you at ${ctx.organization.name} for a little while. We'd love to have you back—reply here if we can help with your training or membership.`;
            const wa = whatsappHref(member.phone, text);
            return <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{member.first_name} {member.last_name}</p><p className="mt-1 text-xs text-[#7a7f89]">{insight.lastVisitDate ? `Last visit ${formatDate(insight.lastVisitDate)} · ${insight.daysSinceLastVisit} days ago` : "No recorded gym visit"}</p></div>{wa ? <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg border border-[#111318] px-3 py-2 text-xs font-semibold">Win-back WhatsApp</a> : <span className="text-xs text-[#8a9099]">No WhatsApp phone</span>}</div>;
          })}
          {!atRisk.length && !inactive.length && <p className="p-5 text-sm text-[#7a7f89]">No at-risk or inactive members in this view.</p>}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white xl:col-span-2">
        <div className="border-b border-[#eceef1] p-5"><h2 className="font-semibold">5+ consecutive-day streaks</h2><p className="mt-1 text-sm text-[#7a7f89]">High-engagement members worth recognizing before they become a retention problem.</p></div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{streakMembers.map(({ member, insight }) => {
          const text = `Hi ${member.first_name}! Great work—you're on a ${insight.currentStreak}-day training streak at ${ctx.organization.name}. Keep it going 💪`;
          const wa = whatsappHref(member.phone, text);
          return <div key={member.id} className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-emerald-950">{member.first_name} {member.last_name}</p><p className="mt-1 text-sm text-emerald-800">{insight.currentStreak}-day current streak · best {insight.longestStreak}</p></div><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-emerald-800">🔥 {insight.currentStreak}</span></div>{wa && <a href={wa} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg bg-emerald-900 px-3 py-2 text-xs font-semibold text-white">Send recognition</a>}</div>;
        })}{!streakMembers.length && <p className="text-sm text-[#7a7f89]">No current 5-day streaks yet.</p>}</div>
      </section>
    </div>
  </section>;
}
