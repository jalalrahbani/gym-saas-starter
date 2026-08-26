import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingBrandingForm } from "@/components/onboarding-branding-form";
import { getExistingOrganizationMembership, requireUser } from "@/lib/app-context";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  if (await getExistingOrganizationMembership()) redirect("/dashboard");

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#eef1f7] px-5 py-8 lg:px-8 lg:py-12">
      <div className="pointer-events-none absolute inset-0 onboarding-grid opacity-55" />
      <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-violet-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-1/3 h-[30rem] w-[30rem] rounded-full bg-cyan-400/15 blur-3xl" />

      <div className="relative mx-auto max-w-7xl">
        <header className="mb-7 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#111827] text-sm font-black text-white">G</span>
            <div>
              <p className="text-sm font-bold text-[#171a21]">Gym Operations Platform</p>
              <p className="text-[10px] text-[#8a9099]">Create your workspace</p>
            </div>
          </Link>
          <span className="rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#5e6470] shadow-sm backdrop-blur">14-day trial</span>
        </header>

        <OnboardingBrandingForm error={error} />
      </div>
    </main>
  );
}
