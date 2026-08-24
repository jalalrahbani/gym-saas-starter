"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";

const members = [
  { id: "M-0184", name: "Maya Haddad", phone: "+961 70 555 182", plan: "Monthly", expiry: "26 Aug 2026", status: "Expiring" },
  { id: "M-0183", name: "Karim Nassar", phone: "+961 71 442 010", plan: "Quarterly", expiry: "27 Aug 2026", status: "Expiring" },
  { id: "M-0182", name: "Rita Daher", phone: "+961 76 118 921", plan: "Annual", expiry: "29 Aug 2026", status: "Active" },
  { id: "M-0181", name: "Joe Saad", phone: "+961 03 889 431", plan: "Monthly", expiry: "31 Aug 2026", status: "Active" },
  { id: "M-0180", name: "Sarah Fares", phone: "+961 81 642 004", plan: "Monthly", expiry: "28 Aug 2026", status: "Active" },
  { id: "M-0179", name: "Nadim Karam", phone: "+961 70 220 107", plan: "10 Visits", expiry: "—", status: "Active" },
];

export default function MembersPage() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => [m.name, m.phone, m.id, m.plan].some((v) => v.toLowerCase().includes(q)));
  }, [query]);

  return (
    <AppShell active="Members">
      <section className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm text-[#7a7f89]">Member directory</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Members</h1></div>
          <button className="rounded-lg bg-[#111318] px-4 py-2.5 text-sm font-semibold text-white">+ New member</button>
        </div>

        <div className="rounded-2xl border border-[#e4e6ea] bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#eceef1] p-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone or member ID…"
              className="min-w-[240px] flex-1 rounded-lg border border-[#dfe2e7] bg-[#fafafa] px-3 py-2.5 text-sm outline-none focus:border-[#989da5]"
            />
            <button className="rounded-lg border border-[#dfe2e7] px-3 py-2.5 text-sm">Status ▾</button>
            <button className="rounded-lg border border-[#dfe2e7] px-3 py-2.5 text-sm">Plan ▾</button>
            <button className="rounded-lg border border-[#dfe2e7] px-3 py-2.5 text-sm">Import</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-[#fafafa] text-xs uppercase tracking-wide text-[#8a9099]">
                <tr><th className="px-5 py-3">Member</th><th>ID</th><th>Phone</th><th>Plan</th><th>Expiry</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-t border-[#f0f1f3] hover:bg-[#fcfcfd]">
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#eceef1] text-xs font-bold">{m.name.split(" ").map(v => v[0]).join("")}</div><span className="font-medium">{m.name}</span></div></td>
                    <td className="text-[#6f7580]">{m.id}</td><td>{m.phone}</td><td>{m.plan}</td><td>{m.expiry}</td>
                    <td><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${m.status === "Expiring" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{m.status}</span></td>
                    <td className="pr-5 text-right"><button className="font-semibold">Open →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#eceef1] px-5 py-4 text-sm text-[#7a7f89]">Showing {filtered.length} of {members.length} demo members</div>
        </div>
      </section>
    </AppShell>
  );
}
