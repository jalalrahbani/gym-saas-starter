"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function AuthConfirmClient({
  tokenHash,
  otpType,
  next,
}: {
  tokenHash: string | null;
  otpType: string | null;
  next: string;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function confirm() {
      try {
        const supabase = createClient();

        const fragment = new URLSearchParams(
          window.location.hash.startsWith("#")
            ? window.location.hash.slice(1)
            : window.location.hash
        );

        const fragmentError =
          fragment.get("error_description") ?? fragment.get("error");

        if (fragmentError) {
          throw new Error(fragmentError.replace(/\+/g, " "));
        }

        if (tokenHash && otpType) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType as EmailOtpType,
          });

          if (verifyError) throw verifyError;
        } else {
          const accessToken = fragment.get("access_token");
          const refreshToken = fragment.get("refresh_token");

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) throw sessionError;
          }
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          throw new Error(
            "The confirmation session is missing or has expired. Please open a fresh email link."
          );
        }

        if (window.location.hash) {
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search
          );
        }

        router.replace(next);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "The confirmation link could not be completed."
        );
      }
    }

    void confirm();
  }, [next, otpType, router, tokenHash]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f9] p-6">
      <div className="w-full max-w-md rounded-3xl border border-[#e3e6ea] bg-white p-7 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#111318] text-sm font-black text-white">
          G
        </div>

        {error ? (
          <>
            <h1 className="mt-5 text-2xl font-semibold">
              Link could not be confirmed
            </h1>

            <p className="mt-3 text-sm leading-6 text-[#737983]">
              {error}
            </p>

            <a
              href="/login"
              className="mt-6 inline-flex rounded-xl bg-[#111318] px-5 py-3 text-sm font-semibold text-white"
            >
              Return to sign in
            </a>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-2xl font-semibold">
              Confirming your account
            </h1>

            <p className="mt-3 text-sm text-[#737983]">
              Preparing your secure gym workspace…
            </p>
          </>
        )}
      </div>
    </main>
  );
}
