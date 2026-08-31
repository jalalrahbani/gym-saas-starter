import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  const successUrl = request.nextUrl.clone();
  successUrl.pathname = "/reset-password";
  successUrl.search = "";

  const failureUrl = request.nextUrl.clone();
  failureUrl.pathname = "/forgot-password";
  failureUrl.search = "";
  failureUrl.searchParams.set(
    "error",
    "The password reset link is invalid or expired.",
  );

  const supabase = await createClient();

  // Current Supabase SSR / PKCE password recovery flow.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(successUrl);
    }
  }

  // Also support a future custom token-hash email template.
  if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (!error) {
      return NextResponse.redirect(successUrl);
    }
  }

  return NextResponse.redirect(failureUrl);
}
