import Link from "next/link";
import { redirect } from "next/navigation";
import { updateRecoveredPasswordAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/forgot-password?error=Your%20password%20reset%20session%20has%20expired.%20Please%20request%20a%20new%20link.",
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] p-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-4 flex justify-end">
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
            Secure account recovery
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Choose a new password
          </h1>

          <p className="mt-2 text-sm text-[#737983]">
            Your new password must contain at least 8 characters.
          </p>

          {error && (
            <div className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <form action={updateRecoveredPasswordAction} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              New password
              <input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3 outline-none focus:border-[#111318]"
              />
            </label>

            <label className="block text-sm font-medium">
              Confirm password
              <input
                name="confirm_password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3 outline-none focus:border-[#111318]"
              />
            </label>

            <button className="w-full rounded-xl bg-[#111318] px-4 py-3 text-sm font-semibold text-white">
              Update password
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
