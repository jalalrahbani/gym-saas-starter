import { CheckInTerminal } from "@/components/access/check-in-terminal";
import { requireAppContext } from "@/lib/app-context";

export default async function CheckInPage() {
  const ctx = await requireAppContext();
  const [inside, visits] = await Promise.all([
    ctx.supabase.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).eq("location_id", ctx.location.id).is("checked_out_at", null),
    ctx.supabase.from("attendance_sessions").select("id,checked_in_at,checked_out_at,members(first_name,last_name)").eq("organization_id", ctx.organization.id).eq("location_id", ctx.location.id).order("checked_in_at", { ascending: false }).limit(20),
  ]);
  return <section className="mx-auto max-w-7xl"><div className="mb-7"><p className="text-sm text-[#7a7f89]">Access & attendance</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Fast entry, accurate time tracking.</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#717782]">Every accepted swipe becomes an attendance session, so occupancy and time-in-gym reporting come from the same records.</p></div><CheckInTerminal initialInside={inside.count ?? 0} initialVisits={(visits.data ?? []) as any} timezone={ctx.organization.timezone} /></section>;
}
