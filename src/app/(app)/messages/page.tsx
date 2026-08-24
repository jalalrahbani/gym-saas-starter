import { requireAppContext } from "@/lib/app-context";
import { formatDate } from "@/lib/format";

function whatsappLink(phone: string | null, message: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}

export default async function MessagesPage() {
  const ctx = await requireAppContext();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const inSeven = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const inactiveBefore = new Date(now.getTime() - 30 * 86400000).toISOString();

  const [expiringRes, recentAttendanceRes] = await Promise.all([
    ctx.supabase
      .from("memberships")
      .select("id,member_id,ends_on,members(first_name,last_name,phone,email),membership_plans(name)")
      .eq("organization_id", ctx.organization.id)
      .eq("status", "active")
      .gte("ends_on", today)
      .lte("ends_on", inSeven)
      .order("ends_on")
      .limit(100),
    ctx.supabase
      .from("attendance_sessions")
      .select("member_id")
      .eq("organization_id", ctx.organization.id)
      .gte("checked_in_at", inactiveBefore),
  ]);

  const recentlyActive = new Set((recentAttendanceRes.data ?? []).map((v: any) => v.member_id));
  const { data: inactiveMembers } = await ctx.supabase
    .from("members")
    .select("id,first_name,last_name,phone,email")
    .eq("organization_id", ctx.organization.id)
    .eq("status", "active")
    .is("archived_at", null)
    .limit(250);
  const inactive = (inactiveMembers ?? []).filter((member: any) => !recentlyActive.has(member.id)).slice(0, 50);

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-sm text-[#7a7f89]">Member communication</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#7a7f89]">Start with safe, human-reviewed outreach. Open a pre-filled WhatsApp message or email from a live member segment; official automated messaging can plug into the same segments later.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white">
          <div className="border-b border-[#eceef1] p-5"><h2 className="font-semibold">Expiring within 7 days</h2><p className="mt-1 text-sm text-[#7a7f89]">{expiringRes.data?.length ?? 0} members ready for a renewal reminder.</p></div>
          <div className="divide-y divide-[#f0f1f3]">
            {(expiringRes.data ?? []).map((row: any) => {
              const member = row.members;
              const name = `${member?.first_name ?? ""} ${member?.last_name ?? ""}`.trim();
              const text = `Hi ${member?.first_name ?? "there"}, a quick reminder from ${ctx.organization.name}: your ${row.membership_plans?.name ?? "gym membership"} expires on ${formatDate(row.ends_on)}. Reply here and we'll help you renew.`;
              const wa = whatsappLink(member?.phone ?? null, text);
              const mail = member?.email ? `mailto:${encodeURIComponent(member.email)}?subject=${encodeURIComponent(`${ctx.organization.name} membership renewal`)}&body=${encodeURIComponent(text)}` : null;
              return <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{name}</p><p className="mt-1 text-xs text-[#7a7f89]">{row.membership_plans?.name ?? "Membership"} · expires {formatDate(row.ends_on)}</p></div><div className="flex gap-2">{wa ? <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg bg-[#111318] px-3 py-2 text-xs font-semibold text-white">WhatsApp</a> : <span className="rounded-lg bg-[#f0f1f3] px-3 py-2 text-xs text-[#8a9099]">No phone</span>}{mail && <a href={mail} className="rounded-lg border border-[#dfe2e7] px-3 py-2 text-xs font-semibold">Email</a>}</div></div>;
            })}
            {!(expiringRes.data?.length) && <p className="p-5 text-sm text-[#7a7f89]">No renewals are due this week.</p>}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white">
          <div className="border-b border-[#eceef1] p-5"><h2 className="font-semibold">No visit in 30+ days</h2><p className="mt-1 text-sm text-[#7a7f89]">A simple win-back queue based on attendance.</p></div>
          <div className="divide-y divide-[#f0f1f3]">
            {inactive.map((member: any) => {
              const text = `Hi ${member.first_name}, we haven't seen you at ${ctx.organization.name} for a little while. We'd love to have you back—reply here if we can help with your training or membership.`;
              const wa = whatsappLink(member.phone, text);
              return <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{member.first_name} {member.last_name}</p><p className="mt-1 text-xs text-[#7a7f89]">No recorded check-in during the last 30 days</p></div>{wa ? <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg border border-[#111318] px-3 py-2 text-xs font-semibold">Open WhatsApp</a> : <span className="text-xs text-[#8a9099]">No phone</span>}</div>;
            })}
            {!inactive.length && <p className="p-5 text-sm text-[#7a7f89]">No inactive members in this view.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}
