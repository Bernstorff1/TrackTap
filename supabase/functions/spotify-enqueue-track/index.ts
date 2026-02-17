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

function normalizeTrackUri(raw: string): string {
  const value = String(raw || "").trim();
  if (value.startsWith("spotify:track:")) return value;
  const m = value.match(/open\.spotify\.com\/(?:intl-[^/]+\/)?track\/([A-Za-z0-9]+)/);
  return m ? `spotify:track:${m[1]}` : "";
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
  const trackUri = normalizeTrackUri(String(body?.trackUri || ""));
  if (!accessToken) return json({ error: "missing_access_token" }, 401);
  if (!roomId) return json({ error: "missing_room_id" }, 400);
  if (!trackUri) return json({ error: "invalid_track_uri" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const callerUserId = String(userData?.user?.id || fallbackUserId || "").trim();
  if (!callerUserId) return json({ error: "unauthorized", details: userError?.message || "no_user" }, 401);

  let ownerId = callerUserId;
  const { data: roomSettings } = await admin
    .from("room_settings")
    .select("owner_id, spotify_connected")
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

  async function queueCall(token: string): Promise<Response> {
    const url = new URL("https://api.spotify.com/v1/me/player/queue");
    url.searchParams.set("uri", trackUri);
    return fetch(url.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  let queueRes = await queueCall(spotifyAccessToken);
  if (queueRes.status === 401 && refreshToken) {
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
      queueRes = await queueCall(spotifyAccessToken);
    } catch {
      // keep original response handling below
    }
  }

  if (queueRes.status === 429) {
    return json({ error: "rate_limited", retryAfter: retryAfterSeconds(queueRes) }, 429);
  }
  if (queueRes.status === 404) {
    await setRoomSpotifyStatus(admin, roomId, ownerId, "restricted_device");
    return json({ error: "restricted_device", details: "no_active_device" }, 400);
  }
  if (queueRes.status === 403) {
    await setRoomSpotifyStatus(admin, roomId, ownerId, "restricted_device");
    const details = await queueRes.text().catch(() => "");
    return json({ error: "queue_forbidden", details: details || "forbidden" }, 403);
  }
  if (!queueRes.ok) {
    const details = await queueRes.text().catch(() => "");
    return json({ error: "queue_failed", details: details || `http_${queueRes.status}` }, 502);
  }

  await setRoomSpotifyStatus(admin, roomId, ownerId, "ok");
  return json({ ok: true });
});

