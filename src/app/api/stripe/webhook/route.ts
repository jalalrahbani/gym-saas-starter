import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeSignature } from "@/lib/stripe";

function isoFromUnix(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function assertDatabaseSuccess(error: { message?: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message ?? "database error"}`);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });

  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
  if (!event?.id || !event?.type) return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  const admin = createAdminClient();
  const { data: previous, error: previousError } = await admin
    .from("webhook_events")
    .select("id,processed_at,error_message")
    .eq("provider", "stripe")
    .eq("external_event_id", event.id)
    .maybeSingle();
  assertDatabaseSuccess(previousError, "Load webhook event");
  if (previous?.processed_at) return NextResponse.json({ received: true, duplicate: true });

  let eventRowId = previous?.id as string | undefined;
  if (!eventRowId) {
    const { data, error } = await admin
      .from("webhook_events")
      .insert({ provider: "stripe", external_event_id: event.id, event_type: event.type, payload: event })
      .select("id")
      .single();
    if (error) {
      // A racing delivery can win the unique provider/event insert. Re-read once.
      const { data: raced, error: racedError } = await admin
        .from("webhook_events")
        .select("id,processed_at")
        .eq("provider", "stripe")
        .eq("external_event_id", event.id)
        .maybeSingle();
      assertDatabaseSuccess(racedError, "Recover duplicate webhook event");
      if (raced?.processed_at) return NextResponse.json({ received: true, duplicate: true });
      if (!raced?.id) return NextResponse.json({ error: "Unable to record webhook" }, { status: 500 });
      eventRowId = raced.id;
    } else {
      eventRowId = data.id;
    }
  }

  try {
    const object = event.data?.object ?? {};

    if (event.type === "checkout.session.completed" && object.mode === "subscription") {
      const orgId = object.client_reference_id || object.metadata?.organization_id;
      if (orgId) {
        const { error } = await admin.from("saas_subscriptions").update({
          provider_customer_id: object.customer || null,
          provider_subscription_id: object.subscription || null,
          plan_code: object.metadata?.plan_code || "starter",
          status: "active",
          updated_at: new Date().toISOString(),
        }).eq("organization_id", orgId);
        assertDatabaseSuccess(error, "Activate SaaS subscription");
      }
    }

    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const orgId = object.metadata?.organization_id;
      const patch = {
        provider_customer_id: object.customer || null,
        provider_subscription_id: object.id || null,
        plan_code: object.metadata?.plan_code || "starter",
        status: object.status || (event.type.endsWith("deleted") ? "canceled" : "active"),
        current_period_ends_at: isoFromUnix(object.current_period_end),
        grace_ends_at: object.status === "past_due" ? new Date(Date.now() + 7 * 86400000).toISOString() : null,
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

    const { error: processedError } = await admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString(), error_message: null })
      .eq("id", eventRowId);
    assertDatabaseSuccess(processedError, "Mark webhook processed");
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook processing error";
    await admin.from("webhook_events").update({ error_message: message.slice(0, 1000) }).eq("id", eventRowId);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
