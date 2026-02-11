import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("TAPSTER_SERVICE_ROLE_KEY") ?? "";
  const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID") ?? "";
  const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? "";
  const SPOTIFY_REDIRECT_URI = Deno.env.get("SPOTIFY_REDIRECT_URI") ?? "";

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !SPOTIFY_CLIENT_ID ||
    !SPOTIFY_CLIENT_SECRET ||
    !SPOTIFY_REDIRECT_URI
  ) {
    return new Response("Missing env", { status: 500 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return new Response("Missing code/state", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: stateRow } = await admin
    .from("spotify_oauth_states")
    .select("user_id, return_to")
    .eq("state", state)
    .maybeSingle();

  if (!stateRow?.user_id) {
    return new Response("Invalid state", { status: 400 });
  }

  const basic = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
  });

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body,
  });

  if (!tokenRes.ok) {
    return new Response("Token exchange failed", { status: 400 });
  }

  const tokenData = await tokenRes.json();
  const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 0) * 1000).toISOString();
  await admin.from("spotify_tokens").upsert({
    user_id: stateRow.user_id,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    scope: tokenData.scope,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  await admin.from("spotify_oauth_states").delete().eq("state", state);

  const returnTo = stateRow.return_to || "https://tapsterbox.dk/playlist.html";
  return Response.redirect(returnTo, 302);
});
