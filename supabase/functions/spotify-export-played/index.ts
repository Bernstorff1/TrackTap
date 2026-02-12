import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type InputTrack = {
  title?: string;
  artist?: string;
  uri?: string;
  webUrl?: string;
};

function parseTrackUri(track: InputTrack): string {
  const uri = String(track?.uri || "").trim();
  if (uri.startsWith("spotify:track:")) return uri;
  const web = String(track?.webUrl || "").trim();
  const m = web.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  return m ? `spotify:track:${m[1]}` : "";
}

async function refreshUserToken(
  row: Record<string, unknown>,
  spotifyClientId: string,
  spotifyClientSecret: string
): Promise<string> {
  const accessToken = String(row.access_token || "");
  const refreshToken = String(row.refresh_token || "");
  const expiresAtRaw = String(row.expires_at || "");
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).getTime() : 0;
  if (accessToken && expiresAt && Date.now() < expiresAt - 30000) return accessToken;
  if (!refreshToken) return accessToken;

  const basic = btoa(`${spotifyClientId}:${spotifyClientSecret}`);
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!tokenRes.ok) throw new Error("refresh_failed");

  const tokenData = await tokenRes.json();
  const nextAccess = String(tokenData.access_token || "");
  if (!nextAccess) throw new Error("refresh_missing_access_token");
  return nextAccess;
}

async function searchSpotifyTrackUri(appToken: string, title: string, artist: string): Promise<string> {
  const query = `${title || ""} ${artist || ""}`.trim();
  if (!query) return "";
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${appToken}` },
  });
  if (!res.ok) return "";
  const data = await res.json();
  return String(data?.tracks?.items?.[0]?.uri || "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("TAPSTER_SERVICE_ROLE_KEY") ?? "";
  const spotifyClientId = Deno.env.get("SPOTIFY_CLIENT_ID") ?? "";
  const spotifyClientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !spotifyClientId || !spotifyClientSecret) {
    return new Response(JSON.stringify({ error: "missing_env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const accessToken = String(body?.accessToken || "").trim();
  const fallbackUserId = String(body?.userId || "").trim();
  const playlistNameRaw = String(body?.playlistName || "").trim();
  const playlistName = (playlistNameRaw || "Tapster Played").slice(0, 90);
  const tracks = Array.isArray(body?.tracks) ? (body.tracks as InputTrack[]) : [];

  if (!accessToken) {
    return new Response(JSON.stringify({ error: "missing_access_token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!tracks.length) {
    return new Response(JSON.stringify({ error: "no_played_tracks" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const userId = userData?.user?.id || fallbackUserId;
  if (!userId) {
    return new Response(JSON.stringify({ error: "unauthorized", details: userError?.message || "no_user" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: tokenRow, error: tokenError } = await admin
    .from("spotify_tokens")
    .select("user_id, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (tokenError || !tokenRow) {
    return new Response(JSON.stringify({ error: "spotify_not_connected" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let userSpotifyAccess = "";
  try {
    userSpotifyAccess = await refreshUserToken(tokenRow, spotifyClientId, spotifyClientSecret);
  } catch {
    return new Response(JSON.stringify({ error: "refresh_failed" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const basic = btoa(`${spotifyClientId}:${spotifyClientSecret}`);
  const appTokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!appTokenRes.ok) {
    return new Response(JSON.stringify({ error: "app_token_failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const appTokenData = await appTokenRes.json();
  const appToken = String(appTokenData?.access_token || "");

  const meRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${userSpotifyAccess}` },
  });
  if (!meRes.ok) {
    return new Response(JSON.stringify({ error: "me_failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const me = await meRes.json();
  const spotifyUserId = String(me?.id || "");
  if (!spotifyUserId) {
    return new Response(JSON.stringify({ error: "missing_spotify_user" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const createRes = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userSpotifyAccess}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: playlistName,
      description: "Created from Tapster (Played)",
      public: false,
    }),
  });
  if (!createRes.ok) {
    const details = await createRes.text();
    return new Response(JSON.stringify({ error: "create_playlist_failed", details }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const playlist = await createRes.json();
  const playlistId = String(playlist?.id || "");
  const playlistUrl = String(playlist?.external_urls?.spotify || "");
  if (!playlistId) {
    return new Response(JSON.stringify({ error: "missing_playlist_id" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const uriSet = new Set<string>();
  const orderedUris: string[] = [];
  for (const track of tracks) {
    let uri = parseTrackUri(track);
    if (!uri) {
      uri = await searchSpotifyTrackUri(appToken, String(track?.title || ""), String(track?.artist || ""));
    }
    if (!uri || uriSet.has(uri)) continue;
    uriSet.add(uri);
    orderedUris.push(uri);
  }

  for (let i = 0; i < orderedUris.length; i += 100) {
    const chunk = orderedUris.slice(i, i + 100);
    const addRes = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userSpotifyAccess}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: chunk }),
    });
    if (!addRes.ok) {
      const details = await addRes.text();
      return new Response(JSON.stringify({ error: "add_tracks_failed", details }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      playlistUrl,
      added: orderedUris.length,
      playlistName,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
