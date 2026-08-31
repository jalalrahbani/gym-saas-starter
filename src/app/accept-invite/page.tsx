"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type InviteState = "loading" | "ready" | "invalid" | "saving";

export default function AcceptInvitePage() {
  const router = useRouter();

  const [state, setState] = useState<InviteState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function establishInviteSession() {
      const supabase = createClient();

      const hash = new URLSearchParams(
        window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash,
      );

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const authError = hash.get("error_description");

      if (authError) {
        if (!cancelled) {
          setError(decodeURIComponent(authError.replace(/\+/g, " ")));
          setState("invalid");
        }
        return;
      }

      // Supabase's default invite template returns an authenticated
      // session in the URL fragment. Persist it into the browser client.
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          if (!cancelled) {
            setError("The invitation link is invalid or has expired.");
            setState("invalid");
          }
          return;
        }

        // Remove sensitive tokens from the visible URL/history.
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + window.location.search,
        );
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userError || !user) {
        setError("The invitation link is invalid or has expired.");
        setState("invalid");
        return;
      }

      setState("ready");
    }

    establishInviteSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");

    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setState("saving");

    const supabase = createClient();

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setState("ready");
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
            className="text-sm font-semibold text-[#59606b] hover:text-[#111318]"
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
            Gym invitation
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Welcome to your gym workspace
          </h1>

          {state === "loading" && (
            <p className="mt-4 text-sm text-[#737983]">
              Verifying your invitation…
            </p>
          )}

          {state === "invalid" && (
            <>
              <div className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {error ?? "This invitation is no longer valid."}
              </div>

              <p className="mt-5 text-center text-sm text-[#747a84]">
                Ask your gym administrator to send you a new invitation.
              </p>

              <Link
                href="/login"
                className="mt-5 block rounded-xl border border-[#dfe2e7] px-4 py-3 text-center text-sm font-semibold text-[#111318]"
              >
                Go to sign in
              </Link>
            </>
          )}

          {(state === "ready" || state === "saving") && (
            <>
              <p className="mt-2 text-sm leading-6 text-[#737983]">
                Your invitation has been verified. Create a password for future
                sign-ins to this workspace.
              </p>

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
                    disabled={state === "saving"}
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
                    disabled={state === "saving"}
                    className="mt-1.5 w-full rounded-xl border border-[#dfe2e7] px-3 py-3 outline-none focus:border-[#111318]"
                  />
                </label>

                <button
                  disabled={state === "saving"}
                  className="w-full rounded-xl bg-[#111318] px-4 py-3 text-sm font-semibold text-white"
                >
                  {state === "saving"
                    ? "Setting up your account…"
                    : "Create password & continue"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
