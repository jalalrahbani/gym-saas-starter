import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function bearerMatches(actual: string | null, secret: string) {
  if (!actual) return false;

  const expected = `Bearer ${secret}`;
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function responseHeaders(requestId: string) {
  return {
    "cache-control": "no-store, max-age=0",
    "x-request-id": requestId,
  };
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  const secret = process.env.CRON_SECRET;

  if (!secret || !bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: responseHeaders(requestId) },
    );
  }

  const admin = createAdminClient();
  const { data: organizations, error } = await admin
    .from("organizations")
    .select("id");

  if (error) {
    console.error("Attendance maintenance could not load organizations", {
      requestId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { ok: false, error: "Maintenance could not be completed." },
      { status: 500, headers: responseHeaders(requestId) },
    );
  }

  let closed = 0;
  let expiredMemberships = 0;
  let failureCount = 0;

  for (const organization of organizations ?? []) {
    const { data, error: closeError } = await admin.rpc(
      "auto_close_stale_attendance",
      {
        p_organization_id: organization.id,
        p_max_hours: 12,
      },
    );

    if (closeError) {
      failureCount += 1;
      console.error("Attendance maintenance operation failed", {
        requestId,
        operation: "auto_close_stale_attendance",
        organizationId: organization.id,
        code: closeError.code,
        message: closeError.message,
      });
    } else {
      closed += Number(data ?? 0);
    }

    const { data: expired, error: expiryError } = await admin.rpc(
      "expire_stale_memberships",
      { p_organization_id: organization.id },
    );

    if (expiryError) {
      failureCount += 1;
      console.error("Attendance maintenance operation failed", {
        requestId,
        operation: "expire_stale_memberships",
        organizationId: organization.id,
        code: expiryError.code,
        message: expiryError.message,
      });
    } else {
      expiredMemberships += Number(expired ?? 0);
    }
  }

  return NextResponse.json(
    {
      ok: failureCount === 0,
      closed,
      expiredMemberships,
      failureCount,
    },
    {
      status: failureCount === 0 ? 200 : 500,
      headers: responseHeaders(requestId),
    },
  );
}
