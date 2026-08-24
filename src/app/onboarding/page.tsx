import { redirect } from "next/navigation";
import { createOrganizationAction } from "@/app/actions";
import { getExistingOrganizationMembership, requireUser } from "@/lib/app-context";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  if (await getExistingOrganizationMembership()) redirect("/dashboard");
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-[#f6f7f9] px-5 py-12">
      <div className="rounded-3xl border border-[#e3e6ea] bg-white p-7 lg:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a9099]">Workspace setup · 1 of 1</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Tell us about your gym</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#737983]">These defaults power receipts, reports, membership prices and local scheduling. You can add more branches later.</p>
        {error && <div className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <form action={createOrganizationAction} className="mt-8 grid gap-5 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm font-medium">Gym name<input name="name" required placeholder="Titan Fitness" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3" /></label>
          <label className="text-sm font-medium">Main branch name<input name="location_name" required defaultValue="Main Branch" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3" /></label>
          <label className="text-sm font-medium">Country<select name="country_code" defaultValue="LB" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3"><option value="LB">Lebanon</option><option value="CY">Cyprus</option><option value="AE">United Arab Emirates</option><option value="SA">Saudi Arabia</option><option value="GB">United Kingdom</option><option value="US">United States</option><option value="CA">Canada</option></select></label>
          <label className="text-sm font-medium">Timezone<select name="timezone" defaultValue="Asia/Beirut" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3"><option>Asia/Beirut</option><option>Asia/Nicosia</option><option>Asia/Dubai</option><option>Europe/London</option><option>America/Toronto</option></select></label>
          <label className="text-sm font-medium">Base currency<select name="base_currency" defaultValue="USD" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3"><option>USD</option><option>EUR</option><option>LBP</option><option>AED</option><option>SAR</option><option>CAD</option><option>GBP</option></select></label>
          <button className="sm:col-span-2 mt-2 rounded-xl bg-[#111318] px-5 py-3 text-sm font-semibold text-white">Create gym workspace</button>
        </form>
      </div>
    </main>
  );
}
