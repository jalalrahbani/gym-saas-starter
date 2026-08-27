import Link from "next/link";

export function AccessDenied({ area = "this workspace" }: { area?: string }) {
  return <section className="mx-auto max-w-3xl">
    <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
      <div className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">Role restricted</div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">You don&apos;t have access to {area}.</h1>
      <p className="mt-2 text-sm leading-6 text-[#707680]">Your account is signed in correctly, but this area is outside the permissions assigned to your staff role.</p>
      <Link href="/dashboard" className="mt-5 inline-flex rounded-lg bg-[#111318] px-4 py-2.5 text-sm font-semibold text-white">Return to dashboard</Link>
    </div>
  </section>;
}
