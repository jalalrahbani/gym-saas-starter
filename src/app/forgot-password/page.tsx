import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;

  return (
    <main className="min-h-screen bg-[#f6f7f9] p-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/login"
            className="text-sm font-semibold text-[#59606b] hover:text-[#111318]"
          >
            ← Back to sign in
          </Link>

          <Link
            href="/"
            aria-label="Gym Operations Platform home"
            className="grid h-10 w-10 place-items-center rounded-xl bg-[#111318] text-sm font-black text-white shadow-sm"
          >
            G
          </Link>
        </div>

        <div className="rounded-3xl border border-[#e3e6ea] bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a9099]">
            Account recovery
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Reset your password
          </h1>

          <p className="mt-2 text-sm leading-6 text-[#737983]">
            Enter the email address associated with your gym account and we’ll
            send you a secure password reset link.
          </p>

          {message && (
            <div className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              {message}
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <form action={forgotPasswordAction} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3 outline-none focus:border-[#111318]"
              />
            </label>

            <button className="w-full rounded-xl bg-[#111318] px-4 py-3 text-sm font-semibold text-white">
              Send reset link
            </button>
          </form>

          <p className="mt-5 text-center text-xs leading-5 text-[#8a9099]">
            For security, we won’t confirm whether an email address exists in
            the system.
          </p>
        </div>
      </div>
    </main>
  );
}
