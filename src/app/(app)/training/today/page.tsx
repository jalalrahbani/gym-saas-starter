import { AccessDenied } from "@/components/access-denied";
import { requireAppContext } from "@/lib/app-context";
import { formatDate, formatDateTime } from "@/lib/format";
import { ROLE_GROUPS, roleAllowed } from "@/lib/roles";
import { dateInTimeZone, wallTimeToUtcIso } from "@/lib/time";
import {
  completePtSessionWithWorkoutAction,
  savePtSessionPlanAction,
} from "../actions";

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function validDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function trainedMuscles(session: any) {
  return (session.pt_session_muscles ?? [])
    .filter((item: any) => item.is_trained)
    .map((item: any) => item.muscle_groups?.name)
    .filter(Boolean);
}

function plannedMuscleIds(session: any) {
  return new Set(
    (session.pt_session_muscles ?? [])
      .filter((item: any) => item.is_planned || item.is_trained)
      .map((item: any) => item.muscle_group_id),
  );
}

export default async function TodayTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const ctx = await requireAppContext();
  if (!roleAllowed(ctx.role, ROLE_GROUPS.training)) {
    return <AccessDenied area="personal training" />;
  }

  const requested = (await searchParams).date;
  const today = dateInTimeZone(new Date(), ctx.organization.timezone);
  const date = validDate(requested) ? String(requested) : today;
  const nextDate = shiftDate(date, 1);
  const startIso = wallTimeToUtcIso(`${date}T00:00`, ctx.organization.timezone);
  const endIso = wallTimeToUtcIso(`${nextDate}T00:00`, ctx.organization.timezone);
  const canCoach = ["owner", "admin", "manager", "trainer"].includes(ctx.role);

  const [sessionsRes, musclesRes, trainersRes] = await Promise.all([
    ctx.supabase
      .from("pt_sessions")
      .select(
        "id,starts_at,ends_at,status,member_id,trainer_user_id,pt_package_id,notes,members(first_name,last_name,phone),pt_packages(label,sessions_purchased,sessions_remaining,starts_on,expires_on),pt_session_workouts(session_goal,coach_notes,completed_at),pt_session_muscles(muscle_group_id,is_planned,is_trained,notes,muscle_groups(name))",
      )
      .eq("organization_id", ctx.organization.id)
      .gte("starts_at", startIso)
      .lt("starts_at", endIso)
      .order("starts_at", { ascending: true }),
    ctx.supabase
      .from("muscle_groups")
      .select("id,name,body_region,sort_order")
      .eq("organization_id", ctx.organization.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    ctx.supabase
      .from("organization_members")
      .select("user_id,role,profiles(full_name)")
      .eq("organization_id", ctx.organization.id)
      .eq("is_active", true)
      .in("role", ["trainer", "owner", "admin", "manager"]),
  ]);

  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  if (musclesRes.error) throw new Error(musclesRes.error.message);
  if (trainersRes.error) throw new Error(trainersRes.error.message);

  const sessions = (sessionsRes.data ?? []) as any[];
  const muscles = (musclesRes.data ?? []) as any[];
  const trainerNames = new Map<string, string>();
  for (const trainer of trainersRes.data ?? []) {
    trainerNames.set(
      (trainer as any).user_id,
      (trainer as any).profiles?.full_name || (trainer as any).role || "Trainer",
    );
  }

  const scheduled = sessions.filter((session) => session.status === "scheduled").length;
  const completed = sessions.filter((session) => session.status === "completed").length;
  const cancelled = sessions.filter((session) => session.status === "cancelled").length;

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[#7a7f89]">Coach workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {date === today ? "Today" : "Daily agenda"}
          </h1>
          <p className="mt-2 text-sm text-[#7a7f89]">
            {formatDate(date)} · chronological PT schedule, package balance, muscle plan,
            and workout completion.
          </p>
        </div>
        <a
          href="/training"
          className="rounded-lg border border-[#dfe2e7] bg-white px-3 py-2 text-sm font-semibold"
        >
          Training home
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#e4e6ea] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[#8a9099]">Scheduled</p>
          <p className="mt-2 text-2xl font-semibold">{scheduled}</p>
        </div>
        <div className="rounded-2xl border border-[#e4e6ea] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[#8a9099]">Completed</p>
          <p className="mt-2 text-2xl font-semibold">{completed}</p>
        </div>
        <div className="rounded-2xl border border-[#e4e6ea] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[#8a9099]">Cancelled</p>
          <p className="mt-2 text-2xl font-semibold">{cancelled}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-[#e4e6ea] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <a
              href={`/training/today?date=${shiftDate(date, -1)}`}
              className="rounded-lg border border-[#dfe2e7] px-3 py-2 text-sm font-semibold"
            >
              ← Previous day
            </a>
            <a
              href={`/training/today?date=${shiftDate(date, 1)}`}
              className="rounded-lg border border-[#dfe2e7] px-3 py-2 text-sm font-semibold"
            >
              Next day →
            </a>
          </div>
          <form method="get" className="flex gap-2">
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="rounded-lg border border-[#dfe2e7] px-3 py-2 text-sm"
            />
            <button className="rounded-lg border border-[#111318] px-3 py-2 text-sm font-semibold">
              Open date
            </button>
          </form>
        </div>
      </section>

      {!canCoach && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Your role can view and coordinate the PT schedule. Workout programming and completion
          details are restricted to coaches and managers.
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white">
        <div className="border-b border-[#eceef1] p-5">
          <h2 className="font-semibold">Agenda</h2>
          <p className="mt-1 text-sm text-[#7a7f89]">
            {sessions.length} appointment{sessions.length === 1 ? "" : "s"} on {formatDate(date)}.
          </p>
        </div>

        <div className="divide-y divide-[#f0f1f3]">
          {sessions.map((session: any) => {
            const member = session.members;
            const workout = Array.isArray(session.pt_session_workouts)
              ? session.pt_session_workouts[0]
              : session.pt_session_workouts;
            const selected = plannedMuscleIds(session);
            const trained = trainedMuscles(session);
            const packageRow = session.pt_packages;
            const packageLabel =
              packageRow?.label ||
              (packageRow ? `${packageRow.sessions_purchased} session PT package` : "No PT package");

            return (
              <article key={session.id} className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <a
                      href={`/members/${session.member_id}/training`}
                      className="text-lg font-semibold underline decoration-[#cfd3d8] underline-offset-4"
                    >
                      {member?.first_name} {member?.last_name}
                    </a>
                    <p className="mt-1 text-sm text-[#575d67]">
                      {formatDateTime(session.starts_at, ctx.organization.timezone)} →{" "}
                      {formatDateTime(session.ends_at, ctx.organization.timezone)}
                    </p>
                    <p className="mt-1 text-xs text-[#7a7f89]">
                      {trainerNames.get(session.trainer_user_id) || "Trainer"}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#f0f2f4] px-3 py-1.5 text-xs font-semibold capitalize">
                    {String(session.status).replace("_", " ")}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-[#f7f8f9] p-3">
                    <p className="text-xs uppercase tracking-wide text-[#8a9099]">PT package</p>
                    <p className="mt-1 text-sm font-semibold">{packageLabel}</p>
                  </div>
                  <div className="rounded-xl bg-[#f7f8f9] p-3">
                    <p className="text-xs uppercase tracking-wide text-[#8a9099]">Remaining</p>
                    <p className="mt-1 text-sm font-semibold">
                      {packageRow ? `${packageRow.sessions_remaining} / ${packageRow.sessions_purchased}` : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#f7f8f9] p-3">
                    <p className="text-xs uppercase tracking-wide text-[#8a9099]">Focus</p>
                    <p className="mt-1 text-sm font-semibold">
                      {trained.length ? trained.join(", ") : workout?.session_goal || "Not logged yet"}
                    </p>
                  </div>
                </div>

                {session.status === "completed" && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-950">Workout completed</p>
                    <p className="mt-1 text-sm text-emerald-900">
                      {trained.length ? `Muscles: ${trained.join(", ")}` : "No muscles were recorded."}
                    </p>
                    {workout?.coach_notes && (
                      <p className="mt-1 text-sm text-emerald-900">{workout.coach_notes}</p>
                    )}
                  </div>
                )}

                {session.status === "scheduled" && canCoach && (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <details className="rounded-xl border border-[#e5e7eb] bg-[#fafbfc] p-4">
                      <summary className="cursor-pointer text-sm font-semibold">Plan muscles</summary>
                      <form action={savePtSessionPlanAction} className="mt-4 space-y-4">
                        <input type="hidden" name="session_id" value={session.id} />
                        <input type="hidden" name="member_id" value={session.member_id} />
                        <label className="block text-sm">
                          Session goal
                          <input
                            name="session_goal"
                            defaultValue={workout?.session_goal ?? ""}
                            placeholder="e.g. Chest + triceps strength"
                            className="mt-1 w-full rounded-lg border border-[#dfe2e7] bg-white px-3 py-2"
                          />
                        </label>
                        <div>
                          <p className="text-sm font-medium">Planned muscles</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {muscles.map((muscle: any) => (
                              <label
                                key={muscle.id}
                                className="flex items-center gap-2 rounded-lg border border-[#e2e5e9] bg-white px-3 py-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  name="muscle_group_ids"
                                  value={muscle.id}
                                  defaultChecked={selected.has(muscle.id)}
                                />
                                {muscle.name}
                              </label>
                            ))}
                          </div>
                        </div>
                        <button
                          data-feedback="Saving workout plan…"
                          className="rounded-lg border border-[#111318] px-3 py-2 text-sm font-semibold"
                        >
                          Save plan
                        </button>
                      </form>
                    </details>

                    <details className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-950">
                        Complete & log workout
                      </summary>
                      <form action={completePtSessionWithWorkoutAction} className="mt-4 space-y-4">
                        <input type="hidden" name="session_id" value={session.id} />
                        <input type="hidden" name="member_id" value={session.member_id} />
                        <input type="hidden" name="session_goal" value={workout?.session_goal ?? ""} />

                        <div>
                          <p className="text-sm font-medium text-emerald-950">Muscles actually trained</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {muscles.map((muscle: any) => (
                              <label
                                key={muscle.id}
                                className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  name="muscle_group_ids"
                                  value={muscle.id}
                                  defaultChecked={selected.has(muscle.id)}
                                />
                                {muscle.name}
                              </label>
                            ))}
                          </div>
                        </div>

                        <label className="block text-sm font-medium text-emerald-950">
                          Exercises <span className="font-normal">(optional)</span>
                          <textarea
                            name="exercise_lines"
                            rows={5}
                            placeholder={"One exercise per line:\nBench Press | 3 | 8 | 70 | 8\nCable Fly | 3 | 12 | 20 | 7"}
                            className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                          />
                          <span className="mt-1 block text-xs font-normal text-emerald-800">
                            Format: Exercise | sets | reps | weight kg | RPE. Leave blank for simple muscle-only logging.
                          </span>
                        </label>

                        <label className="block text-sm font-medium text-emerald-950">
                          Coach notes
                          <textarea
                            name="coach_notes"
                            rows={3}
                            placeholder="Technique, pain, progression, next-session note…"
                            className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                          />
                        </label>

                        <button
                          data-feedback="Completing workout…"
                          className="w-full rounded-lg bg-emerald-950 px-4 py-2.5 text-sm font-semibold text-white"
                        >
                          Complete workout & deduct 1 session
                        </button>
                      </form>
                    </details>
                  </div>
                )}
              </article>
            );
          })}

          {!sessions.length && (
            <p className="p-6 text-sm text-[#7a7f89]">No PT appointments on this date.</p>
          )}
        </div>
      </section>
    </section>
  );
}
