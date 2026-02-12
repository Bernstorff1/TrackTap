import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("TAPSTER_SERVICE_ROLE_KEY") ?? "";
  const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID") ?? "";
  const SPOTIFY_REDIRECT_URI = Deno.env.get("SPOTIFY_REDIRECT_URI") ?? "";

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !SPOTIFY_CLIENT_ID ||
    !SPOTIFY_REDIRECT_URI
  ) {
    console.error("spotify-login missing env", {
      hasUrl: !!SUPABASE_URL,
      hasAnon: !!SUPABASE_ANON_KEY,
      hasService: !!SUPABASE_SERVICE_ROLE_KEY,
      hasClientId: !!SPOTIFY_CLIENT_ID,
      hasRedirect: !!SPOTIFY_REDIRECT_URI,
    });
    return new Response(JSON.stringify({ error: "missing_env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown> = {};
  if (req.method !== "GET") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  const accessToken = String(body?.accessToken || "").trim();
  if (!accessToken) {
    console.error("spotify-login missing access token");
    return new Response(JSON.stringify({ error: "missing_access_token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const clientApiKey = req.headers.get("apikey") || SUPABASE_ANON_KEY;
  const supabase = createClient(SUPABASE_URL, clientApiKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  const user = userData?.user;
  if (userError || !user) {
    console.error("spotify-login unauthorized", userError?.message || "no_user");
    return new Response(
      JSON.stringify({ error: "unauthorized", details: userError?.message || "no_user" }),
      {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const url = new URL(req.url);
  const returnTo =
    String(body?.returnTo || "").trim() ||
    url.searchParams.get("returnTo") ||
    "https://tapsterbox.dk/playlist.html";
  const state = crypto.randomUUID();

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error: insertError } = await admin.from("spotify_oauth_states").insert({
    state,
    user_id: user.id,
    return_to: returnTo,
    created_at: new Date().toISOString(),
  });
  if (insertError) {
    console.error("spotify-login state insert failed", insertError.message);
    return new Response(
      JSON.stringify({ error: "state_insert_failed", details: insertError.message }),
      {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const scope = [
    "playlist-modify-private",
    "playlist-modify-public",
  ].join(" ");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope,
    state,
  });

  return new Response(
    JSON.stringify({ url: `https://accounts.spotify.com/authorize?${params.toString()}` }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
