import Link from "next/link";
import { requireAppContext } from "@/lib/app-context";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { dateInTimeZone, wallTimeToUtcIso } from "@/lib/time";

export default async function DashboardPage() {
  const ctx = await requireAppContext();
  const now = new Date();
  const todayDate = dateInTimeZone(now, ctx.organization.timezone);
  const [year, month] = todayDate.split("-");
  const monthStartLocal = `${year}-${month}-01T00:00`;
  const startMonth = wallTimeToUtcIso(monthStartLocal, ctx.organization.timezone);
  const startToday = wallTimeToUtcIso(`${todayDate}T00:00`, ctx.organization.timezone);
  const sevenDate = dateInTimeZone(new Date(now.getTime() + 7 * 86400000), ctx.organization.timezone);

  const [activeMembershipsRes, insideRes, todayRes, paymentsRes, expiringRes, recentRes] = await Promise.all([
    ctx.supabase.from("memberships").select("member_id").eq("organization_id", ctx.organization.id).eq("status", "active").lte("starts_on", todayDate).or(`ends_on.is.null,ends_on.gte.${todayDate}`),
    ctx.supabase.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).is("checked_out_at", null),
    ctx.supabase.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).gte("checked_in_at", startToday),
    ctx.supabase.from("payments").select("amount_minor, currency").eq("organization_id", ctx.organization.id).eq("status", "paid").gte("paid_at", startMonth),
    ctx.supabase.from("memberships").select("id, ends_on, price_minor, currency, member_id, plan_id, members(first_name,last_name), membership_plans(name)").eq("organization_id", ctx.organization.id).eq("status", "active").gte("ends_on", todayDate).lte("ends_on", sevenDate).order("ends_on").limit(8),
    ctx.supabase.from("attendance_sessions").select("id, checked_in_at, checked_out_at, members(first_name,last_name)").eq("organization_id", ctx.organization.id).order("checked_in_at", { ascending: false }).limit(8),
  ]);

  const activeMembers = new Set((activeMembershipsRes.data ?? []).map((row: any) => row.member_id)).size;
  const revenueByCurrency = new Map<string, number>();
  for (const payment of paymentsRes.data ?? []) revenueByCurrency.set(payment.currency, (revenueByCurrency.get(payment.currency) ?? 0) + Number(payment.amount_minor));
  const revenueText = revenueByCurrency.size === 0 ? formatMoney(0, ctx.organization.base_currency) : [...revenueByCurrency.entries()].map(([c, amount]) => formatMoney(amount, c)).join(" · ");

  const metrics = [
    ["Active members", String(activeMembers), "Valid membership today"],
    ["Inside right now", String(insideRes.count ?? 0), `${todayRes.count ?? 0} check-ins today`],
    ["Revenue this month", revenueText, "Paid transactions only"],
    ["Needs attention", String(expiringRes.data?.length ?? 0), "Memberships expiring within 7 days"],
  ];

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-7"><p className="text-sm text-[#7a7f89]">{new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: ctx.organization.timezone }).format(now)}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Here’s what needs attention.</h1></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, note]) => <div key={label} className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><p className="text-sm text-[#6f7580]">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-xs text-[#8b919a]">{note}</p></div>)}</div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <section className="rounded-2xl border border-[#e4e6ea] bg-white">
          <div className="flex items-center justify-between border-b border-[#eceef1] p-5"><div><h2 className="font-semibold">Renewal queue</h2><p className="mt-1 text-sm text-[#7a7f89]">Upcoming expiries, ready for action.</p></div><Link href="/memberships" className="text-sm font-semibold">View all →</Link></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#fafafa] text-xs uppercase text-[#8a9099]"><tr><th className="px-5 py-3">Member</th><th>Plan</th><th>Expires</th><th>Value</th><th></th></tr></thead><tbody>{(expiringRes.data ?? []).map((row: any) => <tr key={row.id} className="border-t border-[#f0f1f3]"><td className="px-5 py-4 font-medium">{row.members?.first_name} {row.members?.last_name}</td><td>{row.membership_plans?.name ?? "—"}</td><td>{formatDate(row.ends_on)}</td><td>{formatMoney(row.price_minor, row.currency)}</td><td className="pr-5 text-right"><Link href={`/members/${row.member_id}`} className="rounded-lg bg-[#111318] px-3 py-1.5 text-xs font-semibold text-white">Renew</Link></td></tr>)}</tbody></table></div>
          {!(expiringRes.data?.length) && <p className="p-5 text-sm text-[#7a7f89]">Nothing expires in the next seven days.</p>}
        </section>
        <section className="rounded-2xl border border-[#e4e6ea] bg-white"><div className="border-b border-[#eceef1] p-5"><h2 className="font-semibold">Recent access</h2><p className="mt-1 text-sm text-[#7a7f89]">Latest member visits.</p></div><div className="divide-y divide-[#f0f1f3]">{(recentRes.data ?? []).map((row: any) => <div key={row.id} className="flex items-center gap-3 p-4"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#eef0f2] text-xs font-bold">{`${row.members?.first_name?.[0] ?? ""}${row.members?.last_name?.[0] ?? ""}`}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{row.members?.first_name} {row.members?.last_name}</p><p className="text-xs text-[#858b94]">{row.checked_out_at ? "Checked out" : "Currently inside"}</p></div><span className="text-xs text-[#858b94]">{formatDateTime(row.checked_in_at, ctx.organization.timezone)}</span></div>)}</div></section>
      </div>
    </section>
  );
}
