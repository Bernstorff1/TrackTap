import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_AMOUNTS = new Set([10, 25, 50]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("TAPSTER_SERVICE_ROLE_KEY") ?? "";
  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const STRIPE_PUBLISHABLE_KEY = Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY) {
    return json({ error: "missing_env" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return json({ error: "missing_access_token" }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const amount = Number(body?.amount ?? 0);
  if (!ALLOWED_AMOUNTS.has(amount)) {
    return json({ error: "invalid_amount" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const userId = userData?.user?.id || "";
  if (!userId) {
    return json({ error: "unauthorized", details: userError?.message || "no_user" }, 401);
  }

  const amountOre = amount * 100;
  const stripeBody = new URLSearchParams({
    amount: String(amountOre),
    currency: "dkk",
    "payment_method_types[]": "card",
    description: `Tapster credits (${amount})`,
    "metadata[user_id]": userId,
    "metadata[credits]": String(amount),
    "metadata[product]": "tapster_credits",
  });

  const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: stripeBody,
  });

  const stripeData = await stripeRes.json().catch(() => ({}));
  if (!stripeRes.ok || !stripeData?.client_secret) {
    return json({ error: "stripe_create_failed", details: stripeData?.error?.message || "unknown" }, 502);
  }

  return json({
    clientSecret: stripeData.client_secret,
    paymentIntentId: stripeData.id,
    amount,
    publishableKey: STRIPE_PUBLISHABLE_KEY,
  });
});
