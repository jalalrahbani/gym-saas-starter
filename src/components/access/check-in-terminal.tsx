"use client";

import { FormEvent, useMemo, useState } from "react";

type DemoMember = {
  id: string;
  code: string;
  name: string;
  memberNumber: string;
  plan: string;
  expiry: string;
  state: "active" | "warning" | "expired";
};

type Visit = {
  memberId: string;
  name: string;
  checkedInAt: Date;
  checkedOutAt?: Date;
};

const members: DemoMember[] = [
  { id: "m1", code: "10004562", name: "Maya Haddad", memberNumber: "M-0184", plan: "Annual", expiry: "14 Aug 2027", state: "active" },
  { id: "m2", code: "10007814", name: "Sarah Fares", memberNumber: "M-0241", plan: "Monthly", expiry: "28 Aug 2026", state: "warning" },
  { id: "m3", code: "10009900", name: "Karim Nassar", memberNumber: "M-0312", plan: "Quarterly", expiry: "22 Aug 2026", state: "expired" },
];

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(date);
}

function formatDuration(start: Date, end: Date) {
  const totalMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function CheckInTerminal() {
  const [mode, setMode] = useState<"toggle" | "in" | "out">("toggle");
  const [scan, setScan] = useState("");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [message, setMessage] = useState("Swipe, tap, scan, or search for a member.");
  const [lastMember, setLastMember] = useState<DemoMember | null>(null);
  const [lastAction, setLastAction] = useState<"in" | "out" | "denied" | null>(null);

  const insideCount = useMemo(() => visits.filter((visit) => !visit.checkedOutAt).length, [visits]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = scan.trim().toLowerCase();
    if (!value) return;

    const member = members.find((item) =>
      [item.code, item.name.toLowerCase(), item.memberNumber.toLowerCase()].includes(value)
    );

    if (!member) {
      setLastMember(null);
      setLastAction("denied");
      setMessage("No member or active access card matched that input.");
      setScan("");
      return;
    }

    setLastMember(member);
    if (member.state === "expired" && mode !== "out") {
      setLastAction("denied");
      setMessage("Access blocked: membership expired. Renew or use a manager override.");
      setScan("");
      return;
    }

    const openVisit = visits.find((visit) => visit.memberId === member.id && !visit.checkedOutAt);
    const action = mode === "toggle" ? (openVisit ? "out" : "in") : mode;

    if (action === "in") {
      if (openVisit) {
        setLastAction("denied");
        setMessage("Duplicate scan ignored: this member is already checked in.");
      } else {
        setVisits((current) => [{ memberId: member.id, name: member.name, checkedInAt: new Date() }, ...current]);
        setLastAction("in");
        setMessage("Check-in recorded successfully.");
      }
    } else if (!openVisit) {
      setLastAction("denied");
      setMessage("No open visit was found to check out.");
    } else {
      setVisits((current) => current.map((visit) =>
        visit === openVisit ? { ...visit, checkedOutAt: new Date() } : visit
      ));
      setLastAction("out");
      setMessage("Check-out recorded successfully.");
    }

    setScan("");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="rounded-2xl border border-[#e4e6ea] bg-white p-5 shadow-sm shadow-black/[0.02] lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a9099]">Front desk terminal</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Member access</h2>
            <p className="mt-1 max-w-xl text-sm text-[#727883]">USB card readers can type directly into this field. QR, barcode, member number and name use the same workflow.</p>
          </div>
          <div className="rounded-xl bg-[#f2f4f6] px-4 py-3 text-right">
            <p className="text-xs text-[#7b818b]">Currently inside</p>
            <p className="text-2xl font-semibold">{insideCount}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2" aria-label="Terminal mode">
          {([
            ["toggle", "Smart in / out"],
            ["in", "Check-in only"],
            ["out", "Check-out only"],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setMode(value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === value ? "bg-[#111318] text-white" : "border border-[#e1e4e8] bg-white text-[#505660]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <label htmlFor="access-scan" className="text-sm font-semibold">Swipe / tap / scan</label>
          <div className="mt-2 flex gap-2">
            <input
              id="access-scan"
              autoFocus
              autoComplete="off"
              value={scan}
              onChange={(event) => setScan(event.target.value)}
              placeholder="Card ID, QR, member #, or exact member name"
              className="min-w-0 flex-1 rounded-xl border border-[#dcdfe4] bg-white px-4 py-3 text-base outline-none ring-0 focus:border-[#111318]"
            />
            <button type="submit" className="rounded-xl bg-[#111318] px-5 py-3 text-sm font-semibold text-white">Process</button>
          </div>
          <p className="mt-2 text-xs text-[#8a9099]">Demo cards: 10004562 active · 10007814 expiring · 10009900 expired</p>
        </form>

        <div className={`mt-6 rounded-2xl border p-5 ${lastAction === "denied" ? "border-[#ead7d7] bg-[#fffafa]" : "border-[#e4e6ea] bg-[#fafbfc]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{message}</p>
              {lastMember && (
                <p className="mt-1 text-sm text-[#747a84]">{lastMember.name} · {lastMember.memberNumber} · {lastMember.plan} · expires {lastMember.expiry}</p>
              )}
            </div>
            {lastAction && (
              <span className="rounded-full border border-[#dfe2e6] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                {lastAction === "in" ? "Checked in" : lastAction === "out" ? "Checked out" : "Not admitted"}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e4e6ea] bg-white">
        <div className="border-b border-[#eceef1] p-5">
          <h2 className="font-semibold">Today’s visit log</h2>
          <p className="mt-1 text-sm text-[#7a7f89]">Check-in, check-out and calculated visit duration.</p>
        </div>
        <div className="divide-y divide-[#f0f1f3]">
          {visits.length === 0 ? (
            <div className="p-5 text-sm text-[#7d838d]">No demo swipes yet.</div>
          ) : visits.slice(0, 12).map((visit, index) => (
            <div key={`${visit.memberId}-${index}`} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{visit.name}</p>
                <span className={`text-xs font-semibold ${visit.checkedOutAt ? "text-[#777d86]" : "text-[#111318]"}`}>{visit.checkedOutAt ? "Completed" : "Inside"}</span>
              </div>
              <p className="mt-1 text-xs text-[#858b94]">
                In {formatTime(visit.checkedInAt)} · Out {visit.checkedOutAt ? formatTime(visit.checkedOutAt) : "—"}
                {visit.checkedOutAt ? ` · ${formatDuration(visit.checkedInAt, visit.checkedOutAt)}` : ""}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
