import Link from "next/link";
import { createMemberAction } from "@/app/actions";
import { requireAppContext } from "@/lib/app-context";
import { formatDate, memberDisplayNumber } from "@/lib/format";
import { attendanceInsights, daysBetweenDates, engagementBadgeClass, whatsappHref } from "@/lib/member-insights";
import { ROLE_GROUPS, roleAllowed } from "@/lib/roles";
import { dateInTimeZone } from "@/lib/time";

export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAppContext();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const canManageMembers = roleAllowed(ctx.role, ROLE_GROUPS.memberManagers);
  const showNew = params.new === "1" && canManageMembers;
  const imported = typeof params.imported === "string" ? params.imported : null;
  const today = dateInTimeZone(new Date(), ctx.organization.timezone);

  let request = ctx.supabase
    .from("members")
    .select("id, member_number, first_name, last_name, phone, email, status, joined_at")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (query) request = request.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`);
  const { data: members, error } = await request;
  if (error) throw new Error(error.message);

  const memberIds = (members ?? []).map((member: any) => member.id);
  let memberships: any[] = [];
  let attendance: any[] = [];
  if (memberIds.length) {
    const recentSince = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const [membershipsRes, attendanceRes] = await Promise.all([
      ctx.supabase
        .from("memberships")
        .select("id,member_id,status,starts_on,ends_on,visits_remaining,membership_plans(name)")
        .eq("organization_id", ctx.organization.id)
        .in("member_id", memberIds)
        .order("created_at", { ascending: false }),
      ctx.supabase
        .from("attendance_sessions")
        .select("member_id,checked_in_at")
        .eq("organization_id", ctx.organization.id)
        .in("member_id", memberIds)
        .gte("checked_in_at", recentSince)
        .order("checked_in_at", { ascending: false })
        .limit(5000),
    ]);
    if (membershipsRes.error) throw new Error(membershipsRes.error.message);
    if (attendanceRes.error) throw new Error(attendanceRes.error.message);
    memberships = membershipsRes.data ?? [];
    attendance = attendanceRes.data ?? [];
  }

  const membershipsByMember = new Map<string, any[]>();
  for (const membership of memberships) {
    const rows = membershipsByMember.get(membership.member_id) ?? [];
    rows.push(membership);
    membershipsByMember.set(membership.member_id, rows);
  }
  const attendanceByMember = new Map<string, string[]>();
  for (const visit of attendance) {
    const rows = attendanceByMember.get(visit.member_id) ?? [];
    rows.push(visit.checked_in_at);
    attendanceByMember.set(visit.member_id, rows);
  }

  return <section className="mx-auto max-w-7xl">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm text-[#7a7f89]">Member directory</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Members</h1><p className="mt-2 text-sm text-[#7a7f89]">Membership validity and attendance engagement are tracked separately so staff can see who is paid up but drifting away.</p></div>
      <div className="flex flex-wrap gap-2">
        {canManageMembers && <Link href="/members/import" className="rounded-lg border border-[#dfe2e7] bg-white px-4 py-2.5 text-sm font-semibold">Import CSV</Link>}
        {canManageMembers && <a href="/api/export/members" className="rounded-lg border border-[#dfe2e7] bg-white px-4 py-2.5 text-sm font-semibold">Export CSV</a>}
        {canManageMembers && <Link href="/members?new=1" className="rounded-lg bg-[#111318] px-4 py-2.5 text-sm font-semibold text-white">+ New member</Link>}
      </div>
    </div>

    {imported && <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">Imported {imported} member profiles successfully.</div>}
    {params.new === "1" && !canManageMembers && <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Your role has read-only member access. Ask a manager or reception user to create a new member.</div>}
    {showNew && <div className="mb-6 rounded-2xl border border-[#dfe2e7] bg-white p-5 lg:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Add member</h2><p className="mt-1 text-sm text-[#7a7f89]">Create the profile first; assign a membership from the profile next.</p></div><Link href="/members" className="text-sm font-semibold">Close</Link></div><form action={createMemberAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label className="text-sm font-medium">First name<input name="first_name" required className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-2.5" /></label><label className="text-sm font-medium">Last name<input name="last_name" required className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-2.5" /></label><label className="text-sm font-medium">Phone for WhatsApp<input name="phone" inputMode="tel" placeholder="+961…" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-2.5" /></label><label className="text-sm font-medium">Email<input name="email" type="email" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-2.5" /></label><label className="text-sm font-medium">Date of birth<input name="date_of_birth" type="date" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-2.5" /></label><label className="text-sm font-medium">Home location<select name="home_location_id" defaultValue={ctx.location.id} className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-2.5">{ctx.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label className="text-sm font-medium">Emergency contact<input name="emergency_contact_name" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-2.5" /></label><label className="text-sm font-medium">Emergency phone<input name="emergency_contact_phone" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-2.5" /></label><div className="flex items-end"><button data-feedback="Creating member…" className="w-full rounded-xl bg-[#111318] px-4 py-2.5 text-sm font-semibold text-white">Create member</button></div></form></div>}

    <div className="rounded-2xl border border-[#e4e6ea] bg-white">
      <form className="flex flex-wrap items-center gap-3 border-b border-[#eceef1] p-4"><input name="q" defaultValue={query} placeholder="Search name, phone or email…" className="min-w-[240px] flex-1 rounded-lg border border-[#dfe2e7] bg-[#fafafa] px-3 py-2.5 text-sm" /><button data-feedback="Searching…" className="rounded-lg border border-[#dfe2e7] px-4 py-2.5 text-sm font-medium">Search</button>{query && <Link href="/members" className="text-sm font-semibold">Clear</Link>}</form>
      <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-sm"><thead className="bg-[#fafafa] text-xs uppercase tracking-wide text-[#8a9099]"><tr><th className="px-5 py-3">Member</th><th>Member since</th><th>Membership</th><th>Engagement</th><th>Streak</th><th>Last visit</th><th>Phone / renewal</th><th></th></tr></thead><tbody>
        {(members ?? []).map((member: any) => {
          const rows = membershipsByMember.get(member.id) ?? [];
          const active = rows.find((membership) => membership.status === "active" && membership.starts_on <= today && (!membership.ends_on || membership.ends_on >= today));
          const latest = rows[0];
          const insight = attendanceInsights(attendanceByMember.get(member.id) ?? [], ctx.organization.timezone);
          const daysUntilExpiry = active?.ends_on ? daysBetweenDates(today, active.ends_on) : null;
          const renewalText = active
            ? `Hi ${member.first_name}, a quick reminder from ${ctx.organization.name}: your ${active.membership_plans?.name ?? "gym membership"} expires on ${formatDate(active.ends_on)}. Reply here and we'll help you renew.`
            : `Hi ${member.first_name}, this is ${ctx.organization.name}. Your gym membership is currently not active. Reply here and we'll help you renew.`;
          const wa = whatsappHref(member.phone, renewalText);
          const needsRenewal = !active || (daysUntilExpiry != null && daysUntilExpiry <= 14);
          const membershipLabel = active ? active.membership_plans?.name ?? "Active" : latest?.status === "frozen" ? "Frozen" : latest ? "Needs renewal" : "No membership";
          return <tr key={member.id} className="border-t border-[#f0f1f3] align-top hover:bg-[#fcfcfd]">
            <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#eceef1] text-xs font-bold">{member.first_name[0]}{member.last_name[0]}</div><div><p className="font-medium">{member.first_name} {member.last_name}</p><p className="mt-0.5 text-xs text-[#7a7f89]">{memberDisplayNumber(member.member_number)}</p></div></div></td>
            <td className="py-4"><p className="font-medium">{formatDate(member.joined_at)}</p><p className="mt-1 text-xs text-[#8a9099]">Original join date</p></td>
            <td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-1 ring-rose-200"}`}>{membershipLabel}</span>{active?.ends_on && <p className="mt-2 text-xs text-[#7a7f89]">Ends {formatDate(active.ends_on)}</p>}</td>
            <td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${engagementBadgeClass(insight.engagement)}`}>{insight.engagementLabel}</span>{insight.engagement === "at_risk" && <p className="mt-2 text-xs text-amber-800">No visit for {insight.daysSinceLastVisit} days</p>}{insight.engagement === "inactive" && <p className="mt-2 text-xs text-rose-700">Re-engagement recommended</p>}</td>
            <td className="py-4"><p className="font-semibold">{insight.currentStreak || 0} days</p><p className="mt-1 text-xs text-[#8a9099]">Best {insight.longestStreak} days</p></td>
            <td className="py-4">{insight.lastVisitDate ? <><p className="font-medium">{formatDate(insight.lastVisitDate)}</p><p className="mt-1 text-xs text-[#8a9099]">{insight.daysSinceLastVisit === 0 ? "Today" : `${insight.daysSinceLastVisit} days ago`}</p></> : <span className="text-[#8a9099]">Never</span>}</td>
            <td className="py-4"><p>{member.phone || "No phone"}</p>{wa && needsRenewal ? <a href={wa} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-lg bg-[#111318] px-3 py-1.5 text-xs font-semibold text-white">WhatsApp renewal</a> : wa ? <a href={wa} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-lg border border-[#dfe2e7] px-3 py-1.5 text-xs font-semibold">WhatsApp</a> : <p className="mt-1 text-xs text-[#8a9099]">Add +country-code phone</p>}</td>
            <td className="pr-5 pt-4 text-right"><Link href={`/members/${member.id}`} className="font-semibold">Open →</Link></td>
          </tr>;
        })}
      </tbody></table></div>
      <div className="border-t border-[#eceef1] px-5 py-4 text-sm text-[#7a7f89]">Showing {members?.length ?? 0} members · engagement is calculated from attendance, not membership validity.</div>
    </div>
  </section>;
}
