import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("TAPSTER_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "missing_env" }, 500);

  let prefix = "";
  if (req.method === "GET") {
    const url = new URL(req.url);
    prefix = String(url.searchParams.get("prefix") || "").trim().toUpperCase();
  } else {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    prefix = String(body?.prefix || "").trim().toUpperCase();
  }

  if (!prefix) return json({ items: [] });
  if (!/^[A-Z0-9]+$/.test(prefix)) return json({ items: [] });

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await admin
    .from("playlists")
    .select("code, playlist_name")
    .ilike("code", `${prefix}%`)
    .order("code", { ascending: true })
    .limit(5);

  if (error) return json({ error: "query_failed", details: error.message }, 500);
  return json({ items: data || [] });
});

