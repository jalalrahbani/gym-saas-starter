import { requireAppContext } from "@/lib/app-context";
import { formatMoney } from "@/lib/format";
import { dateInTimeZone } from "@/lib/time";

export default async function ReportsPage(){
  const ctx=await requireAppContext();
  const since30=new Date(Date.now()-30*86400000).toISOString();
  const today=dateInTimeZone(new Date(),ctx.organization.timezone);
  const [activeMemberships,attendance,payments,leads,renewals]=await Promise.all([
    ctx.supabase.from("memberships").select("member_id").eq("organization_id",ctx.organization.id).eq("status","active").lte("starts_on",today).or(`ends_on.is.null,ends_on.gte.${today}`),
    ctx.supabase.from("attendance_sessions").select("id,member_id,checked_in_at,checked_out_at").eq("organization_id",ctx.organization.id).gte("checked_in_at",since30),
    ctx.supabase.from("payments").select("amount_minor,currency,status,paid_at").eq("organization_id",ctx.organization.id).gte("paid_at",since30),
    ctx.supabase.from("leads").select("id,stage,source").eq("organization_id",ctx.organization.id).gte("created_at",since30),
    ctx.supabase.from("memberships").select("id,status,created_at").eq("organization_id",ctx.organization.id).gte("created_at",since30),
  ]);
  const active=new Set((activeMemberships.data??[]).map((m:any)=>m.member_id)).size;
  const visits=attendance.data?.length??0;
  const uniqueVisitors=new Set((attendance.data??[]).map((a:any)=>a.member_id)).size;
  const completed=(attendance.data??[]).filter((a:any)=>a.checked_out_at);
  const avgMinutes=completed.length?Math.round(completed.reduce((sum:number,a:any)=>sum+(new Date(a.checked_out_at).getTime()-new Date(a.checked_in_at).getTime())/60000,0)/completed.length):0;
  const revenue=new Map<string,number>();(payments.data??[]).filter((p:any)=>p.status==='paid').forEach((p:any)=>revenue.set(p.currency,(revenue.get(p.currency)??0)+Number(p.amount_minor)));
  const joinedLeads=(leads.data??[]).filter((l:any)=>l.stage==='joined').length; const totalLeads=leads.data?.length??0; const conversion=totalLeads?Math.round(joinedLeads/totalLeads*100):0;
  const metrics=[["Active members",active],["Visits · 30 days",visits],["Unique visitors",uniqueVisitors],["Avg visit",`${avgMinutes} min`],["New memberships",renewals.data?.length??0],["Lead conversion",`${conversion}%`]];
  return <section className="mx-auto max-w-7xl space-y-6"><div><p className="text-sm text-[#7a7f89]">Business intelligence</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Reports</h1><p className="mt-2 text-sm text-[#7a7f89]">A concise 30-day operational view sourced directly from memberships, attendance, payments and leads.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label,value])=><div key={String(label)} className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><p className="text-sm text-[#6f7580]">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p></div>)}</div><section className="rounded-2xl border border-[#e4e6ea] bg-white p-5"><h2 className="font-semibold">Revenue · last 30 days</h2><div className="mt-4 flex flex-wrap gap-3">{revenue.size?[...revenue].map(([c,v])=><div key={c} className="rounded-xl bg-[#f5f6f7] px-4 py-3"><p className="text-xs text-[#7a7f89]">{c}</p><p className="mt-1 text-xl font-semibold">{formatMoney(v,c)}</p></div>):<p className="text-sm text-[#7a7f89]">No paid transactions in this period.</p>}</div></section></section>;
}
