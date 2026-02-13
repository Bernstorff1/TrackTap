import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function detectStripeMode(value: string) {
  if (!value) return "missing";
  if (value.startsWith("sk_live_") || value.startsWith("pk_live_")) return "live";
  if (value.startsWith("sk_test_") || value.startsWith("pk_test_")) return "test";
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const STRIPE_PUBLISHABLE_KEY = Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "";
  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const TAPSTER_SERVICE_ROLE_KEY = Deno.env.get("TAPSTER_SERVICE_ROLE_KEY") ?? "";

  const publishableMode = detectStripeMode(STRIPE_PUBLISHABLE_KEY);
  const secretMode = detectStripeMode(STRIPE_SECRET_KEY);
  const stripeModesMatch =
    publishableMode !== "missing" &&
    secretMode !== "missing" &&
    publishableMode === secretMode &&
    publishableMode !== "unknown";

  return json({
    ok: true,
    env: {
      hasSupabaseUrl: !!SUPABASE_URL,
      hasSupabaseServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
      hasTapsterServiceRoleKey: !!TAPSTER_SERVICE_ROLE_KEY,
      hasStripePublishableKey: !!STRIPE_PUBLISHABLE_KEY,
      hasStripeSecretKey: !!STRIPE_SECRET_KEY,
      hasStripeWebhookSecret: !!STRIPE_WEBHOOK_SECRET,
    },
    stripe: {
      publishableMode,
      secretMode,
      modesMatch: stripeModesMatch,
      webhookPrefixOk: STRIPE_WEBHOOK_SECRET.startsWith("whsec_"),
    },
    supabase: {
      urlHost: SUPABASE_URL ? new URL(SUPABASE_URL).host : "",
    },
    checkedAt: new Date().toISOString(),
  });
});
