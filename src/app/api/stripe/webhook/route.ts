import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeSignature } from "@/lib/stripe";

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const WEBHOOK_LEASE_SECONDS = 300;

type WebhookClaim = {
  state?: "claimed" | "busy" | "processed";
  event_row_id?: string;
  attempt_count?: number;
};

function isoFromUnix(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

function responseHeaders(requestId: string) {
  return {
    "cache-control": "no-store, max-age=0",
    "x-request-id": requestId,
  };
}

function assertDatabaseSuccess(
  error: { message?: string } | null,
  operation: string,
) {
  if (error) {
    throw new Error(`${operation}: ${error.message ?? "database error"}`);
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Webhook is not configured" },
      { status: 503, headers: responseHeaders(requestId) },
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { error: "Payload is too large" },
      { status: 413, headers: responseHeaders(requestId) },
    );
  }

  const payload = await request.text();
  if (new TextEncoder().encode(payload).byteLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { error: "Payload is too large" },
      { status: 413, headers: responseHeaders(requestId) },
    );
  }

  if (
    !verifyStripeSignature(
      payload,
      request.headers.get("stripe-signature"),
      webhookSecret,
    )
  ) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400, headers: responseHeaders(requestId) },
    );
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400, headers: responseHeaders(requestId) },
    );
  }

  if (
    typeof event?.id !== "string" ||
    !event.id ||
    event.id.length > 255 ||
    typeof event?.type !== "string" ||
    !event.type ||
    event.type.length > 255
  ) {
    return NextResponse.json(
      { error: "Invalid event" },
      { status: 400, headers: responseHeaders(requestId) },
    );
  }

  const admin = createAdminClient();
  const { data: claimData, error: claimError } = await admin.rpc(
    "claim_webhook_event",
    {
      p_provider: "stripe",
      p_external_event_id: event.id,
      p_event_type: event.type,
      p_payload: event,
      p_lease_seconds: WEBHOOK_LEASE_SECONDS,
    },
  );

  if (claimError) {
    console.error("Stripe webhook claim failed", {
      requestId,
      code: claimError.code,
      message: claimError.message,
    });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500, headers: responseHeaders(requestId) },
    );
  }

  const claim = (claimData ?? {}) as WebhookClaim;
  if (claim.state === "processed") {
    return NextResponse.json(
      { received: true, duplicate: true },
      { headers: responseHeaders(requestId) },
    );
  }

  if (claim.state === "busy") {
    // Do not acknowledge a concurrent or leased delivery as successful.
    // Stripe should retry, after which the completed event will be deduplicated.
    return NextResponse.json(
      { received: false, retry: true },
      { status: 409, headers: responseHeaders(requestId) },
    );
  }

  if (claim.state !== "claimed" || !claim.event_row_id) {
    console.error("Stripe webhook claim returned an invalid state", {
      requestId,
      state: claim.state ?? "missing",
    });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500, headers: responseHeaders(requestId) },
    );
  }

  const eventRowId = claim.event_row_id;

  try {
    const object = event.data?.object ?? {};

    if (
      event.type === "checkout.session.completed" &&
      object.mode === "subscription"
    ) {
      const orgId =
        object.client_reference_id || object.metadata?.organization_id;

      if (orgId) {
        const { error } = await admin
          .from("saas_subscriptions")
          .update({
            provider_customer_id: object.customer || null,
            provider_subscription_id: object.subscription || null,
            plan_code: object.metadata?.plan_code || "starter",
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", orgId);

        assertDatabaseSuccess(error, "Activate SaaS subscription");
      }
    }

    if (
      [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ].includes(event.type)
    ) {
      const orgId = object.metadata?.organization_id;
      const patch = {
        provider_customer_id: object.customer || null,
        provider_subscription_id: object.id || null,
        plan_code: object.metadata?.plan_code || "starter",
        status:
          object.status ||
          (event.type.endsWith("deleted") ? "canceled" : "active"),
        current_period_ends_at: isoFromUnix(object.current_period_end),
        grace_ends_at:
          object.status === "past_due"
            ? new Date(Date.now() + 7 * 86400000).toISOString()
            : null,
        updated_at: new Date().toISOString(),
      };

      const query = admin.from("saas_subscriptions").update(patch);
      const { error } = orgId
        ? await query.eq("organization_id", orgId)
        : object.customer
          ? await query.eq("provider_customer_id", object.customer)
          : { error: null };

      assertDatabaseSuccess(error, "Update SaaS subscription");
    }

    const { error: finishError } = await admin.rpc("finish_webhook_event", {
      p_event_row_id: eventRowId,
      p_success: true,
      p_error_message: null,
    });

    assertDatabaseSuccess(finishError, "Mark webhook processed");

    return NextResponse.json(
      { received: true },
      { headers: responseHeaders(requestId) },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown webhook processing error";

    const { error: releaseError } = await admin.rpc("finish_webhook_event", {
      p_event_row_id: eventRowId,
      p_success: false,
      p_error_message: message,
    });

    if (releaseError) {
      console.error("Stripe webhook lease release failed", {
        requestId,
        code: releaseError.code,
        message: releaseError.message,
      });
    }

    console.error("Stripe webhook processing failed", {
      requestId,
      message,
    });

    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500, headers: responseHeaders(requestId) },
    );
  }
}
