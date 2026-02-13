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

async function refreshTokenFromRefreshToken(
  refreshToken: string,
  spotifyClientId: string,
  spotifyClientSecret: string
): Promise<{ accessToken: string; refreshToken: string }> {
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
  const nextRefresh = String(tokenData.refresh_token || "").trim() || refreshToken;
  return { accessToken: nextAccess, refreshToken: nextRefresh };
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

  const { data: serviceTokenRow, error: serviceTokenError } = await admin
    .from("spotify_service_tokens")
    .select("key, refresh_token, user_id")
    .eq("key", "tapster_service")
    .maybeSingle();
  if (serviceTokenError || !serviceTokenRow) {
    return new Response(JSON.stringify({ error: "service_spotify_not_connected" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const serviceRefreshToken = String(serviceTokenRow.refresh_token || "").trim();
  if (!serviceRefreshToken) {
    return new Response(JSON.stringify({ error: "missing_service_refresh_token" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let userSpotifyAccess = "";
  try {
    const refreshed = await refreshTokenFromRefreshToken(
      serviceRefreshToken,
      spotifyClientId,
      spotifyClientSecret
    );
    userSpotifyAccess = refreshed.accessToken;
    await admin
      .from("spotify_service_tokens")
      .update({
        refresh_token: refreshed.refreshToken,
        updated_at: new Date().toISOString(),
      })
      .eq("key", "tapster_service");
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

  const createRes = await fetch("https://api.spotify.com/v1/me/playlists", {
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

  let addedCount = 0;
  let skippedCount = 0;
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
      // Some tracks can be blocked by region/rights even if playlist creation succeeds.
      // Fall back to per-track insert so we can skip forbidden tracks instead of failing all.
      if (addRes.status === 403) {
        for (const uri of chunk) {
          const singleRes = await fetch(
            `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${userSpotifyAccess}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ uris: [uri] }),
            }
          );
          if (singleRes.ok) {
            addedCount += 1;
            continue;
          }
          if (singleRes.status === 403 || singleRes.status === 404) {
            skippedCount += 1;
            continue;
          }
          const details = await singleRes.text();
          return new Response(JSON.stringify({ error: "add_tracks_failed", details }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        continue;
      }
      const details = await addRes.text();
      return new Response(JSON.stringify({ error: "add_tracks_failed", details }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    addedCount += chunk.length;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      playlistUrl,
      added: addedCount,
      skipped: skippedCount,
      playlistName,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
