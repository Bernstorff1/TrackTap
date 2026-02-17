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

function retryAfterSeconds(res: Response): number {
  const raw = res.headers.get("retry-after");
  const value = Number(raw || "");
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 30;
}

async function refreshSpotifyAccessToken(
  refreshToken: string,
  spotifyClientId: string,
  spotifyClientSecret: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
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
  const accessToken = String(tokenData?.access_token || "").trim();
  if (!accessToken) throw new Error("refresh_missing_access_token");
  const nextRefresh = String(tokenData?.refresh_token || "").trim() || refreshToken;
  const expiresInSec = Math.max(60, Number(tokenData?.expires_in || 3600));
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
  return { accessToken, refreshToken: nextRefresh, expiresAt };
}

async function setRoomSpotifyStatus(
  admin: ReturnType<typeof createClient>,
  roomId: string,
  ownerId: string,
  status: string
) {
  if (!roomId || !ownerId) return;
  await admin
    .from("room_settings")
    .upsert(
      {
        room_id: roomId,
        owner_id: ownerId,
        spotify_connected: true,
        spotify_status: status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "room_id" }
    );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("TAPSTER_SERVICE_ROLE_KEY") ?? "";
  const spotifyClientId = Deno.env.get("SPOTIFY_CLIENT_ID") ?? "";
  const spotifyClientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !spotifyClientId || !spotifyClientSecret) {
    return json({ error: "missing_env" }, 500);
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
  if (!accessToken) return json({ error: "missing_access_token" }, 401);
  if (!roomId) return json({ error: "missing_room_id" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const callerUserId = String(userData?.user?.id || fallbackUserId || "").trim();
  if (!callerUserId) return json({ error: "unauthorized", details: userError?.message || "no_user" }, 401);

  let ownerId = callerUserId;
  const { data: roomSettings } = await admin
    .from("room_settings")
    .select("owner_id")
    .eq("room_id", roomId)
    .maybeSingle();
  if (roomSettings?.owner_id) ownerId = String(roomSettings.owner_id || "").trim() || callerUserId;

  const { data: ownerTokenRow } = await admin
    .from("spotify_tokens")
    .select("user_id, access_token, refresh_token, expires_at")
    .eq("user_id", ownerId)
    .maybeSingle();
  const { data: callerTokenRow } = await admin
    .from("spotify_tokens")
    .select("user_id, access_token, refresh_token, expires_at")
    .eq("user_id", callerUserId)
    .maybeSingle();

  const tokenRow = ownerTokenRow || callerTokenRow;
  const tokenUserId = String(tokenRow?.user_id || "").trim();
  if (!tokenRow || !tokenUserId) return json({ error: "spotify_not_connected" }, 400);

  let spotifyAccessToken = String(tokenRow?.access_token || "").trim();
  let refreshToken = String(tokenRow?.refresh_token || "").trim();
  const expiresAtMs = Date.parse(String(tokenRow?.expires_at || ""));
  const isExpired = !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + 60_000;
  if (!spotifyAccessToken || isExpired) {
    if (!refreshToken) return json({ error: "spotify_missing_refresh_token" }, 401);
    try {
      const refreshed = await refreshSpotifyAccessToken(refreshToken, spotifyClientId, spotifyClientSecret);
      spotifyAccessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken;
      await admin
        .from("spotify_tokens")
        .upsert(
          {
            user_id: tokenUserId,
            access_token: spotifyAccessToken,
            refresh_token: refreshToken,
            expires_at: refreshed.expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
    } catch {
      return json({ error: "spotify_refresh_failed" }, 401);
    }
  }

  async function playbackCall(token: string): Promise<Response> {
    return fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  let playbackRes = await playbackCall(spotifyAccessToken);
  if (playbackRes.status === 401 && refreshToken) {
    try {
      const refreshed = await refreshSpotifyAccessToken(refreshToken, spotifyClientId, spotifyClientSecret);
      spotifyAccessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken;
      await admin
        .from("spotify_tokens")
        .upsert(
          {
            user_id: tokenUserId,
            access_token: spotifyAccessToken,
            refresh_token: refreshToken,
            expires_at: refreshed.expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      playbackRes = await playbackCall(spotifyAccessToken);
    } catch {
      // handled below
    }
  }

  if (playbackRes.status === 429) {
    return json({ error: "rate_limited", retryAfter: retryAfterSeconds(playbackRes) }, 429);
  }
  if (playbackRes.status === 204) {
    await setRoomSpotifyStatus(admin, roomId, ownerId, "ok");
    return json({ ok: true, isPlaying: false, remainingMs: 0, trackUri: "" });
  }
  if (playbackRes.status === 404 || playbackRes.status === 403) {
    await setRoomSpotifyStatus(admin, roomId, ownerId, "restricted_device");
    return json({ error: "restricted_device" }, 400);
  }
  if (!playbackRes.ok) {
    const details = await playbackRes.text().catch(() => "");
    return json({ error: "playback_failed", details: details || `http_${playbackRes.status}` }, 502);
  }

  const data = await playbackRes.json();
  const isPlaying = !!data?.is_playing;
  const progressMs = Math.max(0, Number(data?.progress_ms || 0));
  const durationMs = Math.max(0, Number(data?.item?.duration_ms || 0));
  const remainingMs = Math.max(0, durationMs - progressMs);
  const trackUri = String(data?.item?.uri || "");
  await setRoomSpotifyStatus(admin, roomId, ownerId, "ok");
  return json({
    ok: true,
    isPlaying,
    progressMs,
    durationMs,
    remainingMs,
    trackUri,
  });
});

