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
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("TAPSTER_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "missing_env" }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const accessToken = String(body?.accessToken || "").trim();
  if (!accessToken) return json({ error: "missing_access_token" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const userId = String(userData?.user?.id || "").trim();
  if (!userId) return json({ error: "unauthorized", details: userError?.message || "no_user" }, 401);

  const { data, error } = await admin
    .from("playlists")
    .select("code, bar_name, playlist_name, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) return json({ error: "query_failed", details: error.message }, 500);

  return json({ items: data || [] });
});

