import { completePtSessionAction, createPtPackageAction } from "@/app/actions";
import { cancelPtSessionAction, reschedulePtSessionAction } from "./actions";
import { PtBookingForm } from "@/components/training/pt-booking-form";
import { requireAppContext } from "@/lib/app-context";
import { formatDateTime } from "@/lib/format";
import { whatsappHref } from "@/lib/member-insights";
import { buildPtWhatsAppMessage, ptReminderLabel, type PtMessageKind } from "@/lib/pt-messages";

function localDateTimeInput(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

function durationMinutes(startsAt: string, endsAt: string) {
  return Math.max(15, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000));
}

function MessageButton({ href, children, primary = false }: { href: string | null; children: React.ReactNode; primary?: boolean }) {
  if (!href) return <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">Add member phone</span>;
  return <a href={href} target="_blank" rel="noreferrer" className={primary ? "rounded-lg bg-[#111318] px-3 py-2 text-xs font-semibold text-white" : "rounded-lg border border-[#dfe2e7] bg-white px-3 py-2 text-xs font-semibold"}>{children}</a>;
}

export default async function TrainingPage() {
  const ctx = await requireAppContext();
  const [sessionsRes, membersRes, trainersRes, packagesRes] = await Promise.all([
    ctx.supabase
      .from("pt_sessions")
      .select("id,starts_at,ends_at,status,member_id,trainer_user_id,pt_package_id,members(first_name,last_name,phone)")
      .eq("organization_id", ctx.organization.id)
      .order("starts_at", { ascending: false })
      .limit(150),
    ctx.supabase
      .from("members")
      .select("id,first_name,last_name,phone")
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("first_name")
      .limit(500),
    ctx.supabase
      .from("organization_members")
      .select("user_id,role,profiles(full_name)")
      .eq("organization_id", ctx.organization.id)
      .eq("is_active", true)
      .in("role", ["trainer", "owner", "admin", "manager"]),
    ctx.supabase
      .from("pt_packages")
      .select("id,member_id,sessions_purchased,sessions_remaining,expires_on")
      .eq("organization_id", ctx.organization.id)
      .gt("sessions_remaining", 0),
  ]);

  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (trainersRes.error) throw new Error(trainersRes.error.message);
  if (packagesRes.error) throw new Error(packagesRes.error.message);

  const trainerNameById = new Map<string, string>();
  for (const trainer of trainersRes.data ?? []) {
    trainerNameById.set((trainer as any).user_id, (trainer as any).profiles?.full_name || (trainer as any).role || "Trainer");
  }

  const sessions = (sessionsRes.data ?? []) as any[];
  const upcoming = sessions
    .filter((session) => session.status === "scheduled")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const history = sessions
    .filter((session) => session.status !== "scheduled")
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

  const whatsappFor = (session: any, kind: PtMessageKind) => {
    const member = session.members;
    const text = buildPtWhatsAppMessage({
      kind,
      gymName: ctx.organization.name,
      memberFirstName: member?.first_name ?? "there",
      trainerName: trainerNameById.get(session.trainer_user_id),
      startsAt: session.starts_at,
      timezone: ctx.organization.timezone,
    });
    return whatsappHref(member?.phone ?? null, text);
  };

  return <section className="mx-auto max-w-7xl space-y-6">
    <div>
      <p className="text-sm text-[#7a7f89]">Personal training</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Training</h1>
      <p className="mt-2 max-w-3xl text-sm text-[#7a7f89]">Book PT sessions, manage the trainer schedule, and open manual pre-filled WhatsApp messages for confirmations, reminders, reschedules, and cancellations.</p>
    </div>

    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-emerald-950">Manual WhatsApp PT workflow</p>
          <p className="mt-1 max-w-3xl text-sm text-emerald-900">No WhatsApp Business API is required. Staff review the appointment and click the appropriate message button; WhatsApp opens with the member, trainer, date, and time already filled in.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200">Staff-controlled</span>
      </div>
    </section>

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5">
        <h2 className="font-semibold">Sell PT package</h2>
        <form action={createPtPackageAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <select name="member_id" required className="rounded-lg border border-[#dfe2e7] px-3 py-2">
            <option value="">Member…</option>
            {(membersRes.data ?? []).map((m: any) => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
          </select>
          <select name="trainer_user_id" className="rounded-lg border border-[#dfe2e7] px-3 py-2">
            <option value="">Any trainer</option>
            {(trainersRes.data ?? []).map((t: any) => <option key={t.user_id} value={t.user_id}>{t.profiles?.full_name || t.role}</option>)}
          </select>
          <input name="sessions" required type="number" min="1" placeholder="Sessions" className="rounded-lg border border-[#dfe2e7] px-3 py-2" />
          <input name="expires_on" type="date" className="rounded-lg border border-[#dfe2e7] px-3 py-2" />
          <button className="sm:col-span-2 rounded-lg bg-[#111318] px-4 py-2 text-sm font-semibold text-white">Create package</button>
        </form>
      </section>

      <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5">
        <h2 className="font-semibold">Book PT session</h2>
        <PtBookingForm members={(membersRes.data ?? []) as any} trainers={(trainersRes.data ?? []) as any} packages={(packagesRes.data ?? []) as any} timezone={ctx.organization.timezone} />
      </section>
    </div>

    <section className="overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white">
      <div className="border-b border-[#eceef1] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-semibold">Upcoming PT sessions</h2><p className="mt-1 text-sm text-[#7a7f89]">The timing badge indicates which manual reminder is most relevant now.</p></div>
          <span className="text-sm text-[#7a7f89]">{upcoming.length} scheduled</span>
        </div>
      </div>
      <div className="divide-y divide-[#f0f1f3]">
        {upcoming.map((session: any) => {
          const member = session.members;
          const trainerName = trainerNameById.get(session.trainer_user_id) || "Trainer";
          const phone = member?.phone ?? null;
          return <div key={session.id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{member?.first_name} {member?.last_name}</p>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">{ptReminderLabel(session.starts_at)}</span>
                </div>
                <p className="mt-1 text-sm text-[#575d67]">{formatDateTime(session.starts_at, ctx.organization.timezone)} → {formatDateTime(session.ends_at, ctx.organization.timezone)}</p>
                <p className="mt-1 text-xs text-[#7a7f89]">{trainerName} · {phone || "No member phone on file"}</p>
              </div>
              <form action={completePtSessionAction}>
                <input type="hidden" name="session_id" value={session.id} />
                <button className="rounded-lg border border-[#111318] px-3 py-2 text-xs font-semibold">Complete session</button>
              </form>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8a9099]">WhatsApp</p>
              <div className="flex flex-wrap gap-2">
                <MessageButton href={whatsappFor(session, "confirmation")} primary>Confirmation</MessageButton>
                <MessageButton href={whatsappFor(session, "reminder_24h")}>24h reminder</MessageButton>
                <MessageButton href={whatsappFor(session, "reminder_2h")}>2h reminder</MessageButton>
                <MessageButton href={whatsappFor(session, "rescheduled")}>Reschedule notice</MessageButton>
              </div>
              <p className="mt-2 text-xs text-[#8a9099]">These links open WhatsApp only; the staff member reviews and presses Send.</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <details className="rounded-xl border border-[#e5e7eb] bg-[#fafbfc] p-4">
                <summary className="cursor-pointer text-sm font-semibold">Reschedule appointment</summary>
                <form action={reschedulePtSessionAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="session_id" value={session.id} />
                  <label className="text-xs font-medium text-[#686e78]">New date & time<input name="starts_at" type="datetime-local" required defaultValue={localDateTimeInput(session.starts_at, ctx.organization.timezone)} className="mt-1.5 w-full rounded-lg border border-[#dfe2e7] bg-white px-3 py-2 text-sm" /></label>
                  <label className="text-xs font-medium text-[#686e78]">Duration (minutes)<input name="duration_minutes" type="number" min="15" max="480" required defaultValue={durationMinutes(session.starts_at, session.ends_at)} className="mt-1.5 w-full rounded-lg border border-[#dfe2e7] bg-white px-3 py-2 text-sm" /></label>
                  <button className="sm:col-span-2 rounded-lg bg-[#111318] px-3 py-2 text-xs font-semibold text-white">Save new appointment time</button>
                </form>
                <p className="mt-2 text-xs text-[#8a9099]">After saving, use “Reschedule notice” above to message the member with the updated time.</p>
              </details>

              <details className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-rose-900">Cancel appointment</summary>
                <p className="mt-3 text-xs text-rose-800">This changes the session status to cancelled. It does not send a message automatically.</p>
                <form action={cancelPtSessionAction} className="mt-3">
                  <input type="hidden" name="session_id" value={session.id} />
                  <button className="rounded-lg bg-rose-900 px-3 py-2 text-xs font-semibold text-white">Confirm cancellation</button>
                </form>
              </details>
            </div>
          </div>;
        })}
        {!upcoming.length && <p className="p-5 text-sm text-[#7a7f89]">No scheduled PT sessions.</p>}
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white">
      <div className="border-b border-[#eceef1] p-5"><h2 className="font-semibold">PT session history</h2></div>
      <div className="divide-y divide-[#f0f1f3]">
        {history.slice(0, 100).map((session: any) => {
          const member = session.members;
          const trainerName = trainerNameById.get(session.trainer_user_id) || "Trainer";
          const cancelledHref = session.status === "cancelled" ? whatsappFor(session, "cancelled") : null;
          return <div key={session.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{member?.first_name} {member?.last_name}</p>
              <p className="mt-1 text-xs text-[#7a7f89]">{formatDateTime(session.starts_at, ctx.organization.timezone)} · {trainerName}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#f0f2f4] px-2.5 py-1 text-xs font-semibold capitalize">{String(session.status).replace("_", " ")}</span>
              {session.status === "cancelled" && <MessageButton href={cancelledHref}>Cancellation WhatsApp</MessageButton>}
            </div>
          </div>;
        })}
        {!history.length && <p className="p-5 text-sm text-[#7a7f89]">No completed or cancelled PT sessions yet.</p>}
      </div>
    </section>
  </section>;
}
