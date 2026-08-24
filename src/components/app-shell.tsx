import Link from "next/link";

const primary = [
  ["Dashboard", "/dashboard"],
  ["Members", "/members"],
  ["Check-in", "/check-in"],
  ["Memberships", "#"],
  ["Payments", "#"],
  ["Training", "#"],
  ["Classes", "#"],
  ["Leads", "#"],
];

const secondary = ["Messages", "Reports", "Staff", "Settings"];

export function AppShell({ children, active }: { children: React.ReactNode; active: string }) {
  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#111318]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#e7e9ee] bg-white lg:block">
        <div className="flex h-20 items-center border-b border-[#e7e9ee] px-6">
          <div>
            <div className="text-lg font-bold tracking-tight">ATLAS / GYM</div>
            <div className="text-xs text-[#7a7f89]">working product UI</div>
          </div>
        </div>
        <nav className="p-4">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-[#9ba0aa]">Operate</p>
          {primary.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className={`mb-1 block rounded-lg px-3 py-2.5 text-sm font-medium ${active === label ? "bg-[#111318] text-white" : "text-[#4e535c] hover:bg-[#f3f4f6]"}`}
            >
              {label}
            </Link>
          ))}
          <p className="mt-7 px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-[#9ba0aa]">Manage</p>
          {secondary.map((label) => (
            <span key={label} className="mb-1 block rounded-lg px-3 py-2.5 text-sm font-medium text-[#7a7f89]">{label}</span>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b border-[#e7e9ee] bg-white/95 px-5 backdrop-blur lg:px-8">
          <div>
            <div className="text-xs font-medium text-[#8a9099]">Titan Fitness · Beirut</div>
            <div className="mt-0.5 font-semibold">{active}</div>
          </div>
          <div className="flex items-center gap-3">
            <button className="hidden rounded-lg border border-[#e1e4e8] bg-white px-4 py-2 text-sm font-medium sm:block">Search ⌘K</button>
            <button className="rounded-lg bg-[#111318] px-4 py-2 text-sm font-semibold text-white">+ Quick add</button>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#eceef1] text-xs font-bold">JA</div>
          </div>
        </header>
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
