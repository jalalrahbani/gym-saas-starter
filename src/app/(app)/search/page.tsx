import Link from "next/link";
import { requireAppContext } from "@/lib/app-context";
import { formatMoney } from "@/lib/format";

function cleanQuery(value: unknown) {
  return String(value ?? "").trim().slice(0, 80);
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireAppContext();
  const q = cleanQuery((await searchParams).q);
  const digits = q.replace(/\D/g, "");
  const memberNumber = /^M-?\d+$/i.test(q) ? Number(digits) : null;

  if (!q) return <section className="mx-auto max-w-5xl"><h1 className="text-3xl font-semibold">Search</h1><p className="mt-2 text-[#7a7f89]">Enter a member name, phone, member number, lead name or receipt number.</p></section>;

  let membersQuery = ctx.supabase.from("members").select("id,member_number,first_name,last_name,phone,status").eq("organization_id", ctx.organization.id).is("archived_at", null).limit(12);
  if (memberNumber) membersQuery = membersQuery.eq("member_number", memberNumber);
  else membersQuery = membersQuery.or(`first_name.ilike.%${q.replace(/[,()]/g, "")}%,last_name.ilike.%${q.replace(/[,()]/g, "")}%,phone.ilike.%${q.replace(/[,()]/g, "")}%`);

  const [membersRes, leadsRes, paymentsRes] = await Promise.all([
    membersQuery,
    ctx.supabase.from("leads").select("id,full_name,phone,stage,converted_member_id").eq("organization_id", ctx.organization.id).or(`full_name.ilike.%${q.replace(/[,()]/g, "")}%,phone.ilike.%${q.replace(/[,()]/g, "")}%`).limit(12),
    /^\d+$/.test(q)
      ? ctx.supabase.from("payments").select("id,receipt_number,member_id,amount_minor,currency,status,members(first_name,last_name)").eq("organization_id", ctx.organization.id).eq("receipt_number", Number(q)).limit(8)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);

  const count = (membersRes.data?.length ?? 0) + (leadsRes.data?.length ?? 0) + (paymentsRes.data?.length ?? 0);
  return <section className="mx-auto max-w-5xl space-y-6"><div><p className="text-sm text-[#7a7f89]">Workspace search</p><h1 className="mt-1 text-3xl font-semibold">Results for “{q}”</h1><p className="mt-2 text-sm text-[#7a7f89]">{count} matching record{count === 1 ? "" : "s"}</p></div>
    <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><h2 className="font-semibold">Members</h2><div className="mt-3 divide-y divide-[#edf0f2]">{membersRes.data?.length ? membersRes.data.map((member:any)=><Link key={member.id} href={`/members/${member.id}`} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium">{member.first_name} {member.last_name}</p><p className="text-xs text-[#7a7f89]">M-{String(member.member_number).padStart(5,"0")} · {member.phone||"No phone"}</p></div><span className="text-sm font-semibold">Open →</span></Link>) : <p className="py-3 text-sm text-[#7a7f89]">No matching members.</p>}</div></section>
    <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><h2 className="font-semibold">Leads</h2><div className="mt-3 divide-y divide-[#edf0f2]">{leadsRes.data?.length ? leadsRes.data.map((lead:any)=><Link key={lead.id} href={lead.converted_member_id ? `/members/${lead.converted_member_id}` : "/leads"} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium">{lead.full_name}</p><p className="text-xs capitalize text-[#7a7f89]">{lead.phone||"No phone"} · {lead.stage}</p></div><span className="text-sm font-semibold">Open →</span></Link>) : <p className="py-3 text-sm text-[#7a7f89]">No matching leads.</p>}</div></section>
    {paymentsRes.data?.length ? <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><h2 className="font-semibold">Receipts</h2><div className="mt-3 divide-y divide-[#edf0f2]">{paymentsRes.data.map((payment:any)=><Link key={payment.id} href={`/receipts/${payment.id}`} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium">Receipt #{payment.receipt_number}</p><p className="text-xs text-[#7a7f89]">{payment.members?.first_name} {payment.members?.last_name} · {payment.status}</p></div><span className="font-semibold">{formatMoney(payment.amount_minor,payment.currency)}</span></Link>)}</div></section> : null}
  </section>;
}
