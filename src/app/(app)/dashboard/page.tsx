import Link from "next/link";
import { requireAppContext } from "@/lib/app-context";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { attendanceInsights, whatsappHref } from "@/lib/member-insights";
import { dateInTimeZone, wallTimeToUtcIso } from "@/lib/time";

export default async function DashboardPage() {
  const ctx = await requireAppContext();
  const now = new Date();
  const todayDate = dateInTimeZone(now, ctx.organization.timezone);
  const [year, month] = todayDate.split("-");
  const monthStartLocal = `${year}-${month}-01T00:00`;
  const startMonth = wallTimeToUtcIso(monthStartLocal, ctx.organization.timezone);
  const startToday = wallTimeToUtcIso(`${todayDate}T00:00`, ctx.organization.timezone);
  const sevenDate = dateInTimeZone(new Date(now.getTime() + 7 * 86_400_000), ctx.organization.timezone);
  const engagementSince = new Date(now.getTime() - 120 * 86_400_000).toISOString();

  const [activeMembershipsRes, memberProfilesRes, engagementAttendanceRes, insideRes, todayRes, paymentsRes, expiringRes, recentRes] = await Promise.all([
    ctx.supabase.from("memberships").select("member_id").eq("organization_id", ctx.organization.id).eq("status", "active").lte("starts_on", todayDate).or(`ends_on.is.null,ends_on.gte.${todayDate}`),
    ctx.supabase.from("members").select("id,first_name,last_name,phone").eq("organization_id", ctx.organization.id).eq("status", "active").is("archived_at", null).limit(2000),
    ctx.supabase.from("attendance_sessions").select("member_id,checked_in_at").eq("organization_id", ctx.organization.id).gte("checked_in_at", engagementSince).order("checked_in_at", { ascending: false }).limit(10000),
    ctx.supabase.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).is("checked_out_at", null),
    ctx.supabase.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).gte("checked_in_at", startToday),
    ctx.supabase.from("payments").select("amount_minor, currency").eq("organization_id", ctx.organization.id).eq("status", "paid").gte("paid_at", startMonth),
    ctx.supabase.from("memberships").select("id, ends_on, price_minor, currency, member_id, plan_id, members(first_name,last_name,phone), membership_plans(name)").eq("organization_id", ctx.organization.id).eq("status", "active").gte("ends_on", todayDate).lte("ends_on", sevenDate).order("ends_on").limit(12),
    ctx.supabase.from("attendance_sessions").select("id, checked_in_at, checked_out_at, members(first_name,last_name)").eq("organization_id", ctx.organization.id).order("checked_in_at", { ascending: false }).limit(8),
  ]);

  const activeMembers = new Set((activeMembershipsRes.data ?? []).map((row: any) => row.member_id)).size;
  const revenueByCurrency = new Map<string, number>();
  for (const payment of paymentsRes.data ?? []) revenueByCurrency.set(payment.currency, (revenueByCurrency.get(payment.currency) ?? 0) + Number(payment.amount_minor));
  const revenueText = revenueByCurrency.size === 0 ? formatMoney(0, ctx.organization.base_currency) : [...revenueByCurrency.entries()].map(([currency, amount]) => formatMoney(amount, currency)).join(" · ");

  const attendanceByMember = new Map<string, string[]>();
  for (const visit of engagementAttendanceRes.data ?? []) {
    const memberId = (visit as any).member_id;
    const rows = attendanceByMember.get(memberId) ?? [];
    rows.push((visit as any).checked_in_at);
    attendanceByMember.set(memberId, rows);
  }
  const engagement = (memberProfilesRes.data ?? []).map((member: any) => ({ member, insight: attendanceInsights(attendanceByMember.get(member.id) ?? [], ctx.organization.timezone, now) }));
  const streakCount = engagement.filter(({ insight }) => insight.currentStreak >= 5).length;
  const atRiskCount = engagement.filter(({ insight }) => insight.engagement === "at_risk").length;
  const inactiveCount = engagement.filter(({ insight }) => insight.engagement === "inactive").length;

  const metrics = [
    ["Active memberships", String(activeMembers), "Valid membership today"],
    ["Inside right now", String(insideRes.count ?? 0), `${todayRes.count ?? 0} check-ins today`],
    ["5+ day streaks", String(streakCount), "Consecutive attendance days"],
    ["Retention watch", String(atRiskCount + inactiveCount), `${atRiskCount} at risk · ${inactiveCount} inactive`],
    ["Revenue this month", revenueText, "Paid transactions only"],
    ["Renewals this week", String(expiringRes.data?.length ?? 0), "WhatsApp-ready renewal queue"],
  ];

  return <section className="mx-auto max-w-7xl">
    <div className="mb-7"><p className="text-sm text-[#7a7f89]">{new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: ctx.organization.timezone }).format(now)}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Here’s what needs attention.</h1><p className="mt-2 text-sm text-[#7a7f89]">Membership health, attendance behavior and renewal actions are intentionally shown together.</p></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value, note]) => <div key={label} className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><p className="text-sm text-[#6f7580]">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-xs text-[#8b919a]">{note}</p></div>)}</div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <section className="rounded-2xl border border-[#e4e6ea] bg-white">
        <div className="flex items-center justify-between border-b border-[#eceef1] p-5"><div><h2 className="font-semibold">Renewal queue</h2><p className="mt-1 text-sm text-[#7a7f89]">Upcoming expiries with direct member contact.</p></div><Link href="/messages" className="text-sm font-semibold">Retention center →</Link></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#fafafa] text-xs uppercase text-[#8a9099]"><tr><th className="px-5 py-3">Member</th><th>Plan</th><th>Expires</th><th>Value</th><th>Action</th></tr></thead><tbody>{(expiringRes.data ?? []).map((row: any) => {
          const member = row.members;
          const text = `Hi ${member?.first_name ?? "there"}, a quick reminder from ${ctx.organization.name}: your ${row.membership_plans?.name ?? "gym membership"} expires on ${formatDate(row.ends_on)}. Reply here and we'll help you renew.`;
          const wa = whatsappHref(member?.phone, text);
          return <tr key={row.id} className="border-t border-[#f0f1f3]"><td className="px-5 py-4"><p className="font-medium">{member?.first_name} {member?.last_name}</p><p className="mt-1 text-xs text-[#8a9099]">{member?.phone || "No phone"}</p></td><td>{row.membership_plans?.name ?? "—"}</td><td>{formatDate(row.ends_on)}</td><td>{formatMoney(row.price_minor, row.currency)}</td><td className="pr-5">{wa ? <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg bg-[#111318] px-3 py-1.5 text-xs font-semibold text-white">WhatsApp renewal</a> : <Link href={`/members/${row.member_id}`} className="rounded-lg border border-[#dfe2e7] px-3 py-1.5 text-xs font-semibold">Add phone</Link>}</td></tr>;
        })}</tbody></table></div>
        {!(expiringRes.data?.length) && <p className="p-5 text-sm text-[#7a7f89]">Nothing expires in the next seven days.</p>}
      </section>

      <section className="rounded-2xl border border-[#e4e6ea] bg-white"><div className="border-b border-[#eceef1] p-5"><h2 className="font-semibold">Recent access</h2><p className="mt-1 text-sm text-[#7a7f89]">Latest member visits.</p></div><div className="divide-y divide-[#f0f1f3]">{(recentRes.data ?? []).map((row: any) => <div key={row.id} className="flex items-center gap-3 p-4"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#eef0f2] text-xs font-bold">{`${row.members?.first_name?.[0] ?? ""}${row.members?.last_name?.[0] ?? ""}`}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{row.members?.first_name} {row.members?.last_name}</p><p className="text-xs text-[#858b94]">{row.checked_out_at ? "Checked out" : "Currently inside"}</p></div><span className="text-xs text-[#858b94]">{formatDateTime(row.checked_in_at, ctx.organization.timezone)}</span></div>)}</div></section>
    </div>

    <section className="mt-6 rounded-2xl border border-[#e4e6ea] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eceef1] p-5"><div><h2 className="font-semibold">Retention pulse</h2><p className="mt-1 text-sm text-[#7a7f89]">Membership validity alone does not tell you whether members are engaged.</p></div><Link href="/messages" className="rounded-lg border border-[#dfe2e7] px-3 py-2 text-xs font-semibold">Open engagement queues</Link></div>
      <div className="grid gap-0 divide-y divide-[#f0f1f3] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-5"><p className="text-sm font-medium">High engagement</p><p className="mt-2 text-3xl font-semibold text-emerald-700">{streakCount}</p><p className="mt-2 text-xs text-[#7a7f89]">Members currently on a 5+ consecutive-day streak.</p></div>
        <div className="p-5"><p className="text-sm font-medium">At risk</p><p className="mt-2 text-3xl font-semibold text-amber-700">{atRiskCount}</p><p className="mt-2 text-xs text-[#7a7f89]">No visit for 8–30 days. Best time for a friendly follow-up.</p></div>
        <div className="p-5"><p className="text-sm font-medium">Inactive</p><p className="mt-2 text-3xl font-semibold text-rose-700">{inactiveCount}</p><p className="mt-2 text-xs text-[#7a7f89]">No visit for 30+ days or no attendance history.</p></div>
      </div>
    </section>
  </section>;
}
