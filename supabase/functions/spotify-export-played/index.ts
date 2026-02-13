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

type SpotifyPlaylist = {
  id?: string;
  uri?: string;
  name?: string;
  description?: string;
  external_urls?: { spotify?: string };
};

function retryAfterSeconds(res: Response): number {
  const raw = res.headers.get("retry-after");
  const value = Number(raw || "");
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 30;
}

function parseTrackUri(track: InputTrack): string {
  const uri = String(track?.uri || "").trim();
  if (uri.startsWith("spotify:track:")) return uri;
  const web = String(track?.webUrl || "").trim();
  const m = web.match(/open\.spotify\.com\/(?:intl-[^/]+\/)?track\/([A-Za-z0-9]+)/);
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

async function searchSpotifyTrackUri(tokens: string[], title: string, artist: string): Promise<string> {
  const titleSafe = String(title || "").trim();
  const artistSafe = String(artist || "").trim();
  const queries = [`${titleSafe} ${artistSafe}`.trim(), titleSafe].filter(Boolean);
  if (!queries.length) return "";

  for (const token of tokens.filter(Boolean)) {
    for (const query of queries) {
      const url = new URL("https://api.spotify.com/v1/search");
      url.searchParams.set("type", "track");
      url.searchParams.set("limit", "5");
      url.searchParams.set("q", query);
      url.searchParams.set("market", "from_token");
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 429) continue;
      if (!res.ok) continue;
      const data = await res.json();
      const items = Array.isArray(data?.tracks?.items) ? data.tracks.items : [];
      const firstUri = String(items[0]?.uri || "");
      if (firstUri.startsWith("spotify:track:")) return firstUri;
    }
  }
  return "";
}

async function findRoomPlaylist(
  accessToken: string,
  roomId: string,
  playlistName: string
): Promise<SpotifyPlaylist | null> {
  const marker = `[tapster_room:${roomId}]`;
  const targetName = String(playlistName || "").trim().toLowerCase();
  let nameMatch: SpotifyPlaylist | null = null;
  let url = "https://api.spotify.com/v1/me/playlists?limit=50";
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const found = items.find((pl: SpotifyPlaylist) =>
      String(pl?.description || "").includes(marker)
    );
    if (found) return found;
    if (!nameMatch && targetName) {
      const byName = items.find(
        (pl: SpotifyPlaylist) => String(pl?.name || "").trim().toLowerCase() === targetName
      );
      if (byName) {
        nameMatch = byName;
      }
    }
    url = String(data?.next || "");
  }
  return nameMatch;
}

async function fetchPlaylistTrackUris(accessToken: string, playlistId: string): Promise<Set<string>> {
  const uris = new Set<string>();
  let offset = 0;
  while (true) {
    const url = new URL(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("fields", "items(track(uri,is_local)),next");
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    for (const item of items) {
      const uri = String(item?.track?.uri || "");
      if (uri.startsWith("spotify:track:")) uris.add(uri);
    }
    const hasNext = !!data?.next;
    if (!hasNext || !items.length) break;
    offset += items.length;
  }
  return uris;
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
  const roomId = String(body?.roomId || "").trim().toUpperCase();
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

  const roomMarker = roomId ? `[tapster_room:${roomId}]` : "";
  let playlist: SpotifyPlaylist | null = roomId
    ? await findRoomPlaylist(userSpotifyAccess, roomId, playlistName)
    : null;
  if (!playlist) {
    const createRes = await fetch("https://api.spotify.com/v1/me/playlists", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userSpotifyAccess}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: playlistName,
        description: roomMarker
          ? `Created from Tapster (Played) ${roomMarker}`
          : "Created from Tapster (Played)",
        public: false,
      }),
    });
    if (!createRes.ok) {
      if (createRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "rate_limited", retryAfter: retryAfterSeconds(createRes) }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const details = await createRes.text();
      return new Response(JSON.stringify({ error: "create_playlist_failed", details }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    playlist = await createRes.json();
  }
  const playlistId = String(playlist?.id || "");
  const playlistUrl = String(playlist?.external_urls?.spotify || "");
  const playlistUri = String(playlist?.uri || "");
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
      uri = await searchSpotifyTrackUri(
        [userSpotifyAccess, appToken],
        String(track?.title || ""),
        String(track?.artist || "")
      );
    }
    if (!uri || uriSet.has(uri)) continue;
    uriSet.add(uri);
    orderedUris.push(uri);
  }

  const existingUris = await fetchPlaylistTrackUris(userSpotifyAccess, playlistId);
  const newUris = orderedUris.filter((uri) => !existingUris.has(uri));

  let addedCount = 0;
  let skippedCount = 0;
  for (let i = 0; i < newUris.length; i += 100) {
    const chunk = newUris.slice(i, i + 100);
    const addRes = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userSpotifyAccess}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: chunk }),
    });
    if (!addRes.ok) {
      if (addRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "rate_limited", retryAfter: retryAfterSeconds(addRes) }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
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
          if (singleRes.status === 429) {
            return new Response(
              JSON.stringify({ error: "rate_limited", retryAfter: retryAfterSeconds(singleRes) }),
              {
                status: 429,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
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
      playlistUri,
      added: addedCount,
      skipped: skippedCount,
      existing: existingUris.size,
      playlistName,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
