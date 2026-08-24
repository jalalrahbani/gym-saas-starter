"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { setActiveLocationAction, signOutAction } from "@/app/actions";

const primary = [
  ["Dashboard", "/dashboard"],
  ["Members", "/members"],
  ["Access", "/check-in"],
  ["Memberships", "/memberships"],
  ["Payments", "/payments"],
  ["Training", "/training"],
  ["Classes", "/classes"],
  ["Leads", "/leads"],
] as const;

const secondary = [
  ["Messages", "/messages"],
  ["Reports", "/reports"],
  ["Staff", "/staff"],
  ["Settings", "/settings"],
] as const;

function activeLabel(pathname: string) {
  return [...primary, ...secondary].find(([, href]) => pathname === href || pathname.startsWith(`${href}/`))?.[0] ?? "Workspace";
}

export function AppShell({
  children,
  organizationName,
  locationName,
  locationId,
  locations,
  userName,
  role,
}: {
  children: React.ReactNode;
  organizationName: string;
  locationName: string;
  locationId: string;
  locations: Array<{ id: string; name: string }>;
  userName: string;
  role: string;
}) {
  const pathname = usePathname();
  const active = activeLabel(pathname);
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((v) => v[0]?.toUpperCase()).join("") || "U";
  const nav = (items: readonly (readonly [string, string])[]) => items.map(([label, href]) => {
    const isActive = pathname === href || pathname.startsWith(`${href}/`);
    return <Link key={href} href={href} className={`mb-1 block rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? "bg-[#111318] text-white" : "text-[#4e535c] hover:bg-[#f3f4f6]"}`}>{label}</Link>;
  });

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#111318]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#e7e9ee] bg-white lg:block">
        <div className="flex h-20 items-center border-b border-[#e7e9ee] px-6">
          <div className="min-w-0"><div className="truncate text-lg font-bold tracking-tight">{organizationName}</div><div className="truncate text-xs text-[#7a7f89]">{locationName}</div></div>
        </div>
        <nav className="p-4">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-[#9ba0aa]">Operate</p>
          {nav(primary)}
          <p className="mt-7 px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-[#9ba0aa]">Manage</p>
          {nav(secondary)}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-[#e7e9ee] bg-white/95 backdrop-blur">
          <div className="flex h-20 items-center justify-between px-5 lg:px-8">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-[#8a9099]">
                <span className="hidden truncate sm:inline">{organizationName}</span>
                {locations.length > 1 ? (
                  <form action={setActiveLocationAction}>
                    <select
                      name="location_id"
                      defaultValue={locationId}
                      aria-label="Active gym location"
                      onChange={(event) => event.currentTarget.form?.requestSubmit()}
                      className="max-w-44 rounded-md border border-[#e1e4e8] bg-white px-2 py-1 text-xs font-semibold text-[#3e434b]"
                    >
                      {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                    </select>
                  </form>
                ) : <span className="truncate">{locationName}</span>}
              </div>
              <div className="mt-0.5 font-semibold">{active}</div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <form action="/search" method="get" className="hidden xl:block">
                <label className="sr-only" htmlFor="global-search">Search workspace</label>
                <input id="global-search" name="q" type="search" placeholder="Search members, leads…" className="w-56 rounded-lg border border-[#e1e4e8] bg-white px-3 py-2 text-sm outline-none focus:border-[#9aa0aa]"/>
              </form>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-lg bg-[#111318] px-3 py-2 text-sm font-semibold text-white sm:px-4">+ Quick add</summary>
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[#e1e4e8] bg-white p-2 shadow-lg">
                  <Link href="/members?new=1" className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f3f4f6]">New member</Link>
                  <Link href="/check-in" className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f3f4f6]">Check in / out</Link>
                  <Link href="/payments" className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f3f4f6]">Record payment</Link>
                  <Link href="/training" className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f3f4f6]">Book PT</Link>
                  <Link href="/leads" className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f3f4f6]">Add lead</Link>
                </div>
              </details>
              <details className="relative">
                <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full bg-[#eceef1] text-xs font-bold">{initials}</summary>
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[#e1e4e8] bg-white p-2 shadow-lg">
                  <div className="px-3 py-2"><p className="truncate text-sm font-semibold">{userName}</p><p className="text-xs capitalize text-[#7a7f89]">{role}</p></div>
                  <form action={signOutAction}><button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f3f4f6]">Sign out</button></form>
                </div>
              </details>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-[#f0f1f3] px-3 py-2 lg:hidden">
            {[...primary, ...secondary].map(([label, href]) => <Link key={href} href={href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${pathname === href || pathname.startsWith(`${href}/`) ? "bg-[#111318] text-white" : "bg-[#f5f6f7] text-[#555b64]"}`}>{label}</Link>)}
          </nav>
        </header>
        <main className="p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
