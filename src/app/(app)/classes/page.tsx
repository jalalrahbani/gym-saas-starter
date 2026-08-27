import { bookClassAction, createClassSessionAction, createGroupClassAction } from "@/app/actions";
import { AccessDenied } from "@/components/access-denied";
import { requireAppContext } from "@/lib/app-context";
import { formatDateTime } from "@/lib/format";
import { ROLE_GROUPS, roleAllowed } from "@/lib/roles";

export default async function ClassesPage() {
  const ctx = await requireAppContext();
  if (!roleAllowed(ctx.role, ROLE_GROUPS.training)) return <AccessDenied area="classes" />;
  const canCreateClassType = roleAllowed(ctx.role, ROLE_GROUPS.classManagers);
  const isTrainer = ctx.role === "trainer";

  const [classesRes, sessionsRes, membersRes, trainersRes] = await Promise.all([
    ctx.supabase.from("group_classes").select("*").eq("organization_id", ctx.organization.id).eq("is_active", true).order("name"),
    ctx.supabase.from("class_sessions").select("id,starts_at,ends_at,capacity,status,class_id,trainer_user_id,group_classes(name),class_bookings(status)").eq("organization_id", ctx.organization.id).gte("starts_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at").limit(80),
    ctx.supabase.from("members").select("id,first_name,last_name").eq("organization_id", ctx.organization.id).is("archived_at", null).order("first_name").limit(500),
    ctx.supabase.from("organization_members").select("user_id,role,profiles(full_name)").eq("organization_id", ctx.organization.id).eq("is_active", true).in("role", ["trainer", "owner", "admin", "manager"]),
  ]);

  if (classesRes.error) throw new Error(classesRes.error.message);
  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (trainersRes.error) throw new Error(trainersRes.error.message);

  return <section className="mx-auto max-w-7xl space-y-6">
    <div><p className="text-sm text-[#7a7f89]">Group scheduling</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Classes</h1></div>

    <div className={`grid gap-6 ${canCreateClassType ? "xl:grid-cols-2" : ""}`}>
      {canCreateClassType && <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5">
        <h2 className="font-semibold">Create class type</h2>
        <form action={createGroupClassAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="name" required placeholder="HIIT" className="rounded-lg border border-[#dfe2e7] px-3 py-2"/>
          <input name="capacity" required type="number" min="1" defaultValue="12" className="rounded-lg border border-[#dfe2e7] px-3 py-2"/>
          <input name="duration_minutes" required type="number" min="10" defaultValue="60" className="rounded-lg border border-[#dfe2e7] px-3 py-2"/>
          <input name="description" placeholder="Description" className="rounded-lg border border-[#dfe2e7] px-3 py-2"/>
          <button data-feedback="Creating class…" className="sm:col-span-2 rounded-lg bg-[#111318] px-4 py-2 text-sm font-semibold text-white">Create class</button>
        </form>
      </section>}

      <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5">
        <h2 className="font-semibold">Schedule class</h2>
        <form action={createClassSessionAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <select name="class_id" required className="rounded-lg border border-[#dfe2e7] px-3 py-2">
            <option value="">Class…</option>
            {(classesRes.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {isTrainer ? (
            <>
              <input type="hidden" name="trainer_user_id" value={ctx.userId} />
              <div className="rounded-lg border border-[#dfe2e7] bg-[#f7f8f9] px-3 py-2 text-sm font-medium">Assigned to you</div>
            </>
          ) : (
            <select name="trainer_user_id" className="rounded-lg border border-[#dfe2e7] px-3 py-2">
              <option value="">Trainer optional</option>
              {(trainersRes.data ?? []).map((t: any) => <option key={t.user_id} value={t.user_id}>{t.profiles?.full_name || t.role}</option>)}
            </select>
          )}
          <input name="starts_at" required type="datetime-local" className="rounded-lg border border-[#dfe2e7] px-3 py-2"/>
          <input name="duration_minutes" required type="number" min="10" defaultValue="60" className="rounded-lg border border-[#dfe2e7] px-3 py-2"/>
          <input name="capacity" required type="number" min="1" defaultValue="12" className="rounded-lg border border-[#dfe2e7] px-3 py-2"/>
          <button data-feedback="Scheduling class…" className="rounded-lg bg-[#111318] px-4 py-2 text-sm font-semibold text-white">Schedule</button>
        </form>
      </section>
    </div>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {(sessionsRes.data ?? []).map((s: any) => {
        const bookings = (s.class_bookings ?? []).filter((b: any) => ["booked", "attended"].includes(b.status)).length;
        const waitlisted = (s.class_bookings ?? []).filter((b: any) => b.status === "waitlisted").length;
        return <div key={s.id} className="rounded-2xl border border-[#e4e6ea] bg-white p-5">
          <div className="flex justify-between gap-3">
            <div><h2 className="font-semibold">{s.group_classes?.name}</h2><p className="mt-1 text-sm text-[#7a7f89]">{formatDateTime(s.starts_at, ctx.organization.timezone)}</p></div>
            <div className="text-right"><span className="text-sm font-semibold">{bookings}/{s.capacity}</span>{waitlisted > 0 && <p className="text-xs text-[#7a7f89]">{waitlisted} waitlisted</p>}</div>
          </div>
          <form action={bookClassAction} className="mt-4 flex gap-2">
            <input type="hidden" name="class_session_id" value={s.id}/>
            <select name="member_id" required className="min-w-0 flex-1 rounded-lg border border-[#dfe2e7] px-3 py-2 text-sm">
              <option value="">Book member…</option>
              {(membersRes.data ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
            </select>
            <button data-feedback="Booking member…" className="rounded-lg border border-[#111318] px-3 py-2 text-xs font-semibold">Book</button>
          </form>
        </div>;
      })}
    </section>
  </section>;
}
