import { AppShell } from "@/components/app-shell";

const metrics = [
  ["Active members", "842", "+3.8% this month"],
  ["Inside right now", "37", "96 check-ins today"],
  ["Revenue this month", "$18,420", "+8.1% vs last month"],
  ["Needs attention", "14", "6 expiring · 8 overdue"],
];

const expiring = [
  ["Maya Haddad", "Monthly", "Tomorrow", "$55"],
  ["Karim Nassar", "Quarterly", "2 days", "$135"],
  ["Rita Daher", "Annual", "4 days", "$420"],
  ["Joe Saad", "Monthly", "6 days", "$55"],
];

const checkins = [
  ["Maya Haddad", "7:42 PM", "Active"],
  ["Joe Saad", "7:37 PM", "Active"],
  ["Sarah Fares", "7:31 PM", "Expires in 3 days"],
  ["Karim Nassar", "7:28 PM", "Active"],
];

export default function DashboardPage() {
  return (
    <AppShell active="Dashboard">
      <section className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-[#7a7f89]">Tuesday, 25 August</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Good evening. Here’s what needs attention.</h1>
          </div>
          <button className="rounded-lg border border-[#dfe2e7] bg-white px-4 py-2 text-sm font-medium">Today ▾</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([label, value, note]) => (
            <div key={label} className="rounded-2xl border border-[#e4e6ea] bg-white p-5 shadow-sm shadow-black/[0.02]">
              <p className="text-sm text-[#6f7580]">{label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
              <p className="mt-2 text-xs text-[#8b919a]">{note}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
          <section className="rounded-2xl border border-[#e4e6ea] bg-white">
            <div className="flex items-center justify-between border-b border-[#eceef1] p-5">
              <div>
                <h2 className="font-semibold">Renewal queue</h2>
                <p className="mt-1 text-sm text-[#7a7f89]">Members whose memberships expire within seven days.</p>
              </div>
              <button className="text-sm font-semibold">View all →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-[#fafafa] text-xs uppercase tracking-wide text-[#8a9099]">
                  <tr><th className="px-5 py-3">Member</th><th>Plan</th><th>Expires</th><th>Renewal</th><th></th></tr>
                </thead>
                <tbody>
                  {expiring.map((row) => (
                    <tr key={row[0]} className="border-t border-[#f0f1f3]">
                      <td className="px-5 py-4 font-medium">{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td><td>{row[3]}</td>
                      <td className="pr-5 text-right"><button className="rounded-lg bg-[#111318] px-3 py-1.5 text-xs font-semibold text-white">Renew</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-[#e4e6ea] bg-white">
            <div className="border-b border-[#eceef1] p-5">
              <h2 className="font-semibold">Recent access</h2>
              <p className="mt-1 text-sm text-[#7a7f89]">Check-ins and check-outs in real time.</p>
            </div>
            <div className="divide-y divide-[#f0f1f3]">
              {checkins.map(([name, time, status]) => (
                <div key={name} className="flex items-center gap-3 p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eef0f2] text-xs font-bold">{name.split(" ").map(v => v[0]).join("")}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name}</p><p className="text-xs text-[#858b94]">{status}</p></div>
                  <span className="text-xs text-[#858b94]">{time}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
