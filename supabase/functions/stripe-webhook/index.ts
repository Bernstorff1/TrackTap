import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};
const ALLOWED_CREDITS = new Set([10, 25, 50]);

const encoder = new TextEncoder();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqualHex(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function parseStripeSignature(header: string) {
  const parts = header.split(",").map((part) => part.trim());
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (!key || !value) continue;
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }
  return { timestamp, signatures };
}

async function hmacHex(secret: string, payload: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payload));
  const bytes = new Uint8Array(signature);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string) {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || !signatures.length) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = await hmacHex(secret, signedPayload);
  return signatures.some((sig) => timingSafeEqualHex(sig, expected));
}

function extractValue(obj: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
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
  const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_WEBHOOK_SECRET) {
    return json({ error: "missing_env" }, 500);
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("stripe-signature") || "";
  const isValid = await verifyStripeSignature(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return json({ error: "invalid_signature" }, 400);
  }

  let event: Record<string, unknown> = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const eventType = String(event?.type || "");
  if (eventType !== "payment_intent.succeeded") {
    return json({ received: true, ignored: true });
  }

  const paymentIntent = extractValue(event, "data.object") as Record<string, unknown>;
  const paymentIntentId = String(paymentIntent?.id || "").trim();
  const metadata = (paymentIntent?.metadata || {}) as Record<string, unknown>;
  const userId = String(metadata?.user_id || "").trim();
  const credits = Number(metadata?.credits || 0);
  const amountOre = Number(paymentIntent?.amount_received || paymentIntent?.amount || 0);

  if (
    !paymentIntentId ||
    !userId ||
    !Number.isFinite(credits) ||
    !ALLOWED_CREDITS.has(credits) ||
    amountOre !== credits * 100
  ) {
    return json({ error: "missing_payment_metadata" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error: insertError } = await admin.from("credit_payments").insert({
    payment_intent_id: paymentIntentId,
    user_id: userId,
    credits,
    amount_ore: amountOre,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    const message = insertError.message || "";
    if (insertError.code === "23505" || /duplicate key|already exists/i.test(message)) {
      return json({ received: true, duplicate: true });
    }
    return json({ error: "payment_log_failed", details: message }, 500);
  }

  const { data: profile } = await admin.from("profiles").select("credits").eq("id", userId).maybeSingle();
  const nextCredits = Number(profile?.credits ?? 0) + credits;
  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    credits: nextCredits,
    updated_at: new Date().toISOString(),
  });

  if (profileError) {
    return json({ error: "profile_update_failed", details: profileError.message }, 500);
  }

  return json({ received: true, applied: true, paymentIntentId, credits });
});
