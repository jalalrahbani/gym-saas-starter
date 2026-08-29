import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "cache-control": "no-store, max-age=0",
};

function runtimeConfigurationReady() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      process.env.NEXT_PUBLIC_SITE_URL &&
      process.env.SUPABASE_SECRET_KEY &&
      process.env.CRON_SECRET &&
      process.env.CARD_TOKEN_HMAC_SECRET &&
      process.env.CARD_TOKEN_HMAC_SECRET.length >= 32,
  );
}

export async function GET() {
  try {
    if (!runtimeConfigurationReady()) {
      throw new Error("Required runtime configuration is incomplete.");
    }

    const admin = createAdminClient();
    const { error } = await admin.from("organizations").select("id").limit(1);

    if (error) throw error;

    return NextResponse.json(
      {
        ok: true,
        service: "gym-saas-starter",
        timestamp: new Date().toISOString(),
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Readiness check failed", {
      message: error instanceof Error ? error.message : "Unknown readiness error",
    });

    return NextResponse.json(
      {
        ok: false,
        service: "gym-saas-starter",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
