"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AcceptInvitePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError(
          "Your invitation session is missing or has expired. Please open a fresh invitation email."
        );
        setReady(true);
        return;
      }

      setEmail(user.email ?? "");
      setReady(true);
    }

    void loadUser();
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(
      formData.get("confirm_password") ?? ""
    );

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] p-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold text-[#59606b] transition hover:text-[#111318]"
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

        <div className="rounded-3xl border border-[#e3e6ea] bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a9099]">
            Staff invitation
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Finish setting up your account
          </h1>

          <p className="mt-2 text-sm leading-6 text-[#737983]">
            Create a password for your gym workspace. You will use this
            email and password whenever you sign in.
          </p>

          {!ready ? (
            <div className="mt-6 rounded-xl bg-[#f7f8f9] p-4 text-sm text-[#737983]">
              Checking your invitation…
            </div>
          ) : error && !email ? (
            <>
              <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">
                {error}
              </div>

              <Link
                href="/login"
                className="mt-5 flex w-full justify-center rounded-xl bg-[#111318] px-4 py-3 text-sm font-semibold text-white"
              >
                Return to sign in
              </Link>
            </>
          ) : (
            <>
              <div className="mt-5 rounded-xl bg-[#f7f8f9] px-4 py-3">
                <p className="text-xs font-medium text-[#8a9099]">
                  Your sign-in email
                </p>
                <p className="mt-1 text-sm font-semibold text-[#111318]">
                  {email}
                </p>
              </div>

              {error && (
                <div className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block text-sm font-medium">
                  Create password
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

                <button
                  disabled={saving}
                  className="w-full rounded-xl bg-[#111318] px-4 py-3 text-sm font-semibold text-white"
                >
                  {saving ? "Setting up account…" : "Continue to dashboard"}
                </button>
              </form>

              <p className="mt-5 text-center text-xs leading-5 text-[#8a9099]">
                Already completed setup?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-[#111318]"
                >
                  Sign in normally
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
