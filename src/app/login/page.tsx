import Link from "next/link";
import { loginAction } from "@/app/actions";

export default async function LoginPage({
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
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#59606b] transition hover:text-[#111318]"
          >
            ← Back to home
          </Link>

          <Link
            href="/"
            aria-label="Gym Operations Platform home"
            className="grid h-10 w-10 place-items-center rounded-xl bg-[#111318] text-sm font-black text-white shadow-sm"
          >
            G
          </Link>
        </div>

        <div className="w-full rounded-3xl border border-[#e3e6ea] bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a9099]">
            Gym operations platform
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Welcome back
          </h1>

          <p className="mt-2 text-sm text-[#737983]">
            Sign in to your gym workspace.
          </p>

          <div className="mt-4 rounded-xl bg-[#f7f8f9] px-4 py-3 text-xs leading-5 text-[#666d77]">
            Invited to a gym? Use the email address associated with your invitation.
          </div>

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

          <form action={loginAction} className="mt-6 space-y-4">
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

            <label className="block text-sm font-medium">
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3 outline-none focus:border-[#111318]"
              />
            </label>

            <button className="w-full rounded-xl bg-[#111318] px-4 py-3 text-sm font-semibold text-white">
              Sign in
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-[#747a84]">
            Setting up a new gym?{" "}
            <Link className="font-semibold text-[#111318]" href="/signup">
              Create a gym workspace
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
