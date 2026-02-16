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
  owner?: { id?: string };
};

type RequestRow = {
  track_title?: string;
  artist?: string;
  spotify_app_url?: string;
  spotify_web_url?: string;
};

type ResolvedTrack = {
  title: string;
  artist: string;
  uri: string;
};

type PlaylistRow = {
  playlist_name?: string;
  bar_name?: string;
};

type RoomExportRow = {
  room_id?: string;
  spotify_playlist_id?: string;
  spotify_playlist_url?: string;
  spotify_playlist_uri?: string;
  spotify_playlist_name?: string;
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

function parseTrackIdFromUri(uri: string): string {
  const clean = String(uri || "").trim();
  const m = clean.match(/^spotify:track:([A-Za-z0-9]+)$/);
  return m ? m[1] : "";
}

function toInputTrack(row: RequestRow): InputTrack {
  return {
    title: String(row?.track_title || ""),
    artist: String(row?.artist || ""),
    uri: String(row?.spotify_app_url || ""),
    webUrl: String(row?.spotify_web_url || ""),
  };
}

function buildSpotifyPlaylistName(base: string): string {
  const clean = String(base || "").trim() || "Tapster";
  if (clean.toLowerCase().endsWith(" - tapster")) return clean.slice(0, 90);
  return `${clean} - Tapster`.slice(0, 90);
}

function isMissingRelationError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("42p01");
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

async function searchSpotifyTrackUriNoMarket(tokens: string[], title: string, artist: string): Promise<string> {
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

async function isTrackPlayableForToken(accessToken: string, uri: string): Promise<boolean> {
  const trackId = parseTrackIdFromUri(uri);
  if (!trackId) return false;
  const res = await fetch(
    `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}?market=from_token`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return res.ok;
}

async function getSpotifyUser(accessToken: string): Promise<{ id: string; country: string }> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("spotify_me_failed");
  const data = await res.json();
  return {
    id: String(data?.id || "").trim(),
    country: String(data?.country || "").trim().toUpperCase(),
  };
}

async function getPlaylistMeta(accessToken: string, playlistId: string): Promise<SpotifyPlaylist | null> {
  const url = new URL(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}`);
  url.searchParams.set("fields", "id,name,uri,external_urls.spotify,owner.id");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data as SpotifyPlaylist;
}

async function findRoomPlaylist(
  accessToken: string,
  roomId: string,
  playlistName: string,
  ownerId: string
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
      String(pl?.owner?.id || "") === ownerId &&
      String(pl?.description || "").includes(marker)
    );
    if (found) return found;
    if (!nameMatch && targetName) {
      const byName = items.find(
        (pl: SpotifyPlaylist) =>
          String(pl?.owner?.id || "") === ownerId &&
          String(pl?.name || "").trim().toLowerCase() === targetName
      );
      if (byName) {
        nameMatch = byName;
      }
    }
    url = String(data?.next || "");
  }
  return nameMatch;
}

async function fetchPlaylistTrackTotal(accessToken: string, playlistId: string): Promise<number | null> {
  const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=1&fields=total`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const total = Number(data?.total);
  return Number.isFinite(total) && total >= 0 ? total : null;
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

  if (!accessToken) {
    return new Response(JSON.stringify({ error: "missing_access_token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!roomId) {
    return new Response(JSON.stringify({ error: "missing_room_id" }), {
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

  const { data: roomData } = await admin
    .from("playlists")
    .select("playlist_name, bar_name")
    .eq("code", roomId)
    .maybeSingle();
  const roomRow = (roomData || {}) as PlaylistRow;
  const baseName =
    String(roomRow?.playlist_name || "").trim() ||
    String(roomRow?.bar_name || "").trim() ||
    roomId;
  const playlistName = buildSpotifyPlaylistName(baseName);

  const { data: playedRows, error: playedError } = await admin
    .from("requests")
    .select("track_title, artist, spotify_app_url, spotify_web_url, played_at, created_at")
    .eq("room_id", roomId)
    .eq("status", "played")
    .order("played_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (playedError) {
    return new Response(JSON.stringify({ error: "played_query_failed", details: playedError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tracks = Array.isArray(playedRows) ? playedRows.map((row) => toInputTrack(row as RequestRow)) : [];
  if (!tracks.length) {
    return new Response(JSON.stringify({ error: "no_played_tracks" }), {
      status: 400,
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
  let serviceSpotifyUserId = "";
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
  try {
    const me = await getSpotifyUser(userSpotifyAccess);
    serviceSpotifyUserId = me.id;
  } catch {
    return new Response(JSON.stringify({ error: "service_spotify_profile_failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: roomExportRow, error: roomExportError } = await admin
    .from("spotify_room_exports")
    .select("room_id, spotify_playlist_id, spotify_playlist_url, spotify_playlist_uri, spotify_playlist_name")
    .eq("room_id", roomId)
    .maybeSingle();

  if (roomExportError && isMissingRelationError(roomExportError)) {
    return new Response(JSON.stringify({ error: "missing_export_tables" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (roomExportError) {
    return new Response(JSON.stringify({ error: "room_export_query_failed", details: roomExportError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const exportRow = (roomExportRow || {}) as RoomExportRow;
  let playlistId = String(exportRow?.spotify_playlist_id || "");
  let playlistUrl = String(exportRow?.spotify_playlist_url || "");
  let playlistUri = String(exportRow?.spotify_playlist_uri || "");
  if (playlistId) {
    const meta = await getPlaylistMeta(userSpotifyAccess, playlistId);
    const ownerId = String(meta?.owner?.id || "");
    if (!meta || !ownerId || ownerId !== serviceSpotifyUserId) {
      playlistId = "";
      playlistUrl = "";
      playlistUri = "";
    }
  }

  if (!playlistId) {
    let playlist = await findRoomPlaylist(userSpotifyAccess, roomId, playlistName, serviceSpotifyUserId);
    if (!playlist) {
      const createRes = await fetch("https://api.spotify.com/v1/me/playlists", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userSpotifyAccess}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: playlistName,
          description: `Created from Tapster (Played) [tapster_room:${roomId}]`,
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

    playlistId = String(playlist?.id || "");
    playlistUrl = String(playlist?.external_urls?.spotify || "");
    playlistUri = String(playlist?.uri || "");
    if (!playlistId) {
      return new Response(JSON.stringify({ error: "missing_playlist_id" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: saveExportError } = await admin.from("spotify_room_exports").upsert(
      {
        room_id: roomId,
        spotify_playlist_id: playlistId,
        spotify_playlist_url: playlistUrl,
        spotify_playlist_uri: playlistUri,
        spotify_playlist_name: playlistName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "room_id" }
    );
    if (saveExportError) {
      return new Response(JSON.stringify({ error: "room_export_save_failed", details: saveExportError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const uriSet = new Set<string>();
  const resolvedTracks: ResolvedTrack[] = [];
  for (const track of tracks) {
    const title = String(track?.title || "").trim();
    const artist = String(track?.artist || "").trim();
    let uri = parseTrackUri(track);

    // A URI from another market/account can exist but still be unavailable for
    // the service account. Re-resolve against current token when needed.
    if (uri) {
      const playable = await isTrackPlayableForToken(userSpotifyAccess, uri);
      if (!playable) {
        uri = "";
      }
    }

    if (!uri) {
      uri = await searchSpotifyTrackUri(
        [userSpotifyAccess, appToken],
        title,
        artist
      );
    }
    if (!uri) {
      uri = await searchSpotifyTrackUriNoMarket([userSpotifyAccess, appToken], title, artist);
    }
    if (!uri || uriSet.has(uri)) continue;
    uriSet.add(uri);
    resolvedTracks.push({ title, artist, uri });
  }
  const orderedUris = resolvedTracks.map((item) => item.uri);
  if (!orderedUris.length) {
    return new Response(JSON.stringify({ error: "no_matchable_tracks" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: exportedRows, error: exportedError } = await admin
    .from("spotify_room_export_tracks")
    .select("track_uri")
    .eq("room_id", roomId);

  if (exportedError && isMissingRelationError(exportedError)) {
    return new Response(JSON.stringify({ error: "missing_export_tables" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (exportedError) {
    return new Response(JSON.stringify({ error: "export_tracks_query_failed", details: exportedError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const exportedSet = new Set<string>(
    (Array.isArray(exportedRows) ? exportedRows : [])
      .map((r) => String((r as { track_uri?: string })?.track_uri || ""))
      .filter((uri) => uri.startsWith("spotify:track:"))
  );

  const newUris = orderedUris.filter((uri) => !exportedSet.has(uri));
  let urisToAdd = newUris;

  // If Supabase memory says "already exported" but the Spotify playlist is empty,
  // recover by re-syncing all current played URIs.
  if (!urisToAdd.length && orderedUris.length && playlistId) {
    const total = await fetchPlaylistTrackTotal(userSpotifyAccess, playlistId);
    if (total === 0 && exportedSet.size > 0) {
      urisToAdd = [...orderedUris];
      const { error: clearError } = await admin
        .from("spotify_room_export_tracks")
        .delete()
        .eq("room_id", roomId);
      if (clearError) {
        return new Response(JSON.stringify({ error: "export_tracks_reset_failed", details: clearError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      exportedSet.clear();
    }
  }

  let addedCount = 0;
  let skippedCount = 0;
  const insertedUris: string[] = [];
  const rejectionSamples: string[] = [];
  const resolvedByUri = new Map<string, ResolvedTrack>();
  for (const item of resolvedTracks) resolvedByUri.set(item.uri, item);
  for (let i = 0; i < urisToAdd.length; i += 100) {
    const chunk = urisToAdd.slice(i, i + 100);
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
            insertedUris.push(uri);
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
            const source = resolvedByUri.get(uri);
            let retried = false;
            if (source?.title) {
              const fallbackUri =
                (await searchSpotifyTrackUri([userSpotifyAccess], source.title, source.artist)) ||
                (await searchSpotifyTrackUriNoMarket([userSpotifyAccess, appToken], source.title, source.artist));
              if (fallbackUri && fallbackUri !== uri) {
                const retryRes = await fetch(
                  `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${userSpotifyAccess}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ uris: [fallbackUri] }),
                  }
                );
                if (retryRes.ok) {
                  addedCount += 1;
                  insertedUris.push(fallbackUri);
                  retried = true;
                } else if (retryRes.status === 429) {
                  return new Response(
                    JSON.stringify({ error: "rate_limited", retryAfter: retryAfterSeconds(retryRes) }),
                    {
                      status: 429,
                      headers: { ...corsHeaders, "Content-Type": "application/json" },
                    }
                  );
                } else {
                  const retryDetails = await retryRes.text().catch(() => "");
                  if (retryDetails) rejectionSamples.push(retryDetails.slice(0, 300));
                }
              }
            }
            if (retried) continue;
            const details = await singleRes.text().catch(() => "");
            if (details) rejectionSamples.push(details.slice(0, 300));
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
    insertedUris.push(...chunk);
  }

  if (addedCount === 0 && skippedCount > 0) {
    return new Response(
      JSON.stringify({
        error: "all_tracks_rejected",
        details:
          rejectionSamples[0] ||
          "Spotify rejected all tracks for this account/market.",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (insertedUris.length) {
    const nowIso = new Date().toISOString();
    const rows = insertedUris.map((uri) => ({
      room_id: roomId,
      track_uri: uri,
      exported_at: nowIso,
    }));
    const { error: saveTracksError } = await admin
      .from("spotify_room_export_tracks")
      .upsert(rows, { onConflict: "room_id,track_uri" });
    if (saveTracksError) {
      return new Response(JSON.stringify({ error: "export_tracks_save_failed", details: saveTracksError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  await admin
    .from("spotify_room_exports")
    .upsert(
      {
        room_id: roomId,
        spotify_playlist_id: playlistId,
        spotify_playlist_url: playlistUrl,
        spotify_playlist_uri: playlistUri,
        spotify_playlist_name: playlistName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "room_id" }
    );

  return new Response(
    JSON.stringify({
      ok: true,
      playlistUrl,
      playlistUri,
      added: addedCount,
      skipped: skippedCount,
      existing: exportedSet.size,
      playlistName,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
