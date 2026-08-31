import { AuthConfirmClient } from "@/components/auth-confirm-client";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const tokenHash =
    typeof params.token_hash === "string" ? params.token_hash : null;

  const otpType =
    typeof params.type === "string" ? params.type : null;

  const requestedNext =
    typeof params.next === "string" ? params.next : "/onboarding";

  const safeNext =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/onboarding";

  return (
    <AuthConfirmClient
      tokenHash={tokenHash}
      otpType={otpType}
      next={safeNext}
    />
  );
}
