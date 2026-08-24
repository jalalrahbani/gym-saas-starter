import Link from "next/link";
import { signupAction } from "@/app/actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f9] p-6">
      <div className="w-full max-w-md rounded-3xl border border-[#e3e6ea] bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a9099]">14-day trial</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Create your gym workspace</h1>
        <p className="mt-2 text-sm text-[#737983]">One account starts the organization; you can invite staff after setup.</p>
        {error && <div className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <form action={signupAction} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Your name<input name="full_name" required autoComplete="name" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3" /></label>
          <label className="block text-sm font-medium">Email<input name="email" type="email" required autoComplete="email" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3" /></label>
          <label className="block text-sm font-medium">Password<input name="password" type="password" minLength={8} required autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3" /></label>
          <button className="w-full rounded-xl bg-[#111318] px-4 py-3 text-sm font-semibold text-white">Create account</button>
        </form>
        <p className="mt-5 text-center text-sm text-[#747a84]">Already have an account? <Link className="font-semibold text-[#111318]" href="/login">Sign in</Link></p>
      </div>
    </main>
  );
}
