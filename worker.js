const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const POLL_MS = 5000;
const NEAR_END_MS = 10000;
const DEDUPE_WINDOW_MS = 60000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error("Missing env vars. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let appToken = null;
let appTokenExpiresAt = 0;

async function getAppToken() {
  if (appToken && Date.now() < appTokenExpiresAt - 30000) return appToken;
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error("Failed to get app token");
  const data = await res.json();
  appToken = data.access_token;
  appTokenExpiresAt = Date.now() + data.expires_in * 1000;
  return appToken;
}

async function refreshUserToken(row) {
  if (!row.refresh_token) return row.access_token;
  if (row.expires_at && Date.now() < new Date(row.expires_at).getTime() - 30000) {
    return row.access_token;
  }
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    }),
  });
  if (!res.ok) throw new Error("Failed to refresh user token");
  const data = await res.json();
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await supabase.from("spotify_tokens").upsert({
    user_id: row.user_id,
    access_token: data.access_token,
    refresh_token: data.refresh_token || row.refresh_token,
    scope: data.scope || row.scope,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  return data.access_token;
}

function scoreOf(item) {
  if (item.dj_pinned) return 10000 + (item.upvotes - item.downvotes);
  return item.upvotes - item.downvotes;
}

function sortQueued(a, b) {
  if (!!a.dj_pinned !== !!b.dj_pinned) return b.dj_pinned ? 1 : -1;
  const scoreDiff = scoreOf(b) - scoreOf(a);
  if (scoreDiff !== 0) return scoreDiff;
  const upDiff = (b.upvotes || 0) - (a.upvotes || 0);
  if (upDiff !== 0) return upDiff;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function extractUri(item) {
  if (item.spotify_app_url?.startsWith("spotify:track:")) return item.spotify_app_url;
  const web = item.spotify_web_url || "";
  const match = web.match(/open\.spotify\.com\/track\/(\w+)/);
  if (match) return `spotify:track:${match[1]}`;
  return "";
}

async function searchSpotifyTrack(title, artist) {
  const token = await getAppToken();
  const q = `${title} ${artist || ""}`.trim();
  if (!q) return "";
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", q);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return "";
  const data = await res.json();
  const item = data?.tracks?.items?.[0];
  return item?.uri || "";
}

async function queueTrack(accessToken, uri) {
  const url = new URL("https://api.spotify.com/v1/me/player/queue");
  url.searchParams.set("uri", uri);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok;
}

async function getCurrentlyPlaying(accessToken) {
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 204) return null;
  if (!res.ok) return null;
  return res.json();
}

async function processRoom(room) {
  const { data: tokenRow } = await supabase
    .from("spotify_tokens")
    .select("user_id, access_token, refresh_token, expires_at, scope")
    .eq("user_id", room.owner_id)
    .maybeSingle();

  if (!tokenRow) return;

  const accessToken = await refreshUserToken(tokenRow);
  const playing = await getCurrentlyPlaying(accessToken);
  if (!playing || !playing.is_playing) return;

  const remaining = (playing.item?.duration_ms || 0) - (playing.progress_ms || 0);
  if (remaining > NEAR_END_MS) return;

  const { data: queued } = await supabase
    .from("requests")
    .select("*")
    .eq("room_id", room.room_id)
    .eq("status", "queued");

  if (!queued || queued.length === 0) return;
  queued.sort(sortQueued);
  const next = queued[0];

  if (room.last_queued_request_id === next.id) {
    const lastTime = room.last_queued_at ? new Date(room.last_queued_at).getTime() : 0;
    if (Date.now() - lastTime < DEDUPE_WINDOW_MS) return;
  }

  let uri = extractUri(next);
  if (!uri) {
    uri = await searchSpotifyTrack(next.track_title || next.title, next.artist || "");
  }
  if (!uri) return;

  const queuedOk = await queueTrack(accessToken, uri);
  if (!queuedOk) return;

  await supabase.from("requests").update({
    status: "played",
    played_at: new Date().toISOString(),
  }).eq("id", next.id);

  await supabase.from("room_settings").upsert({
    room_id: room.room_id,
    owner_id: room.owner_id,
    dj_mode: true,
    spotify_connected: true,
    last_queued_request_id: next.id,
    last_queued_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "room_id" });
}

async function tick() {
  const { data: rooms } = await supabase
    .from("room_settings")
    .select("room_id, owner_id, dj_mode, spotify_connected, last_queued_request_id, last_queued_at")
    .eq("dj_mode", true)
    .eq("spotify_connected", true);

  if (!rooms || rooms.length === 0) return;
  for (const room of rooms) {
    try {
      await processRoom(room);
    } catch (err) {
      console.error("Room error", room.room_id, err?.message || err);
    }
  }
}

console.log("Tapster Spotify worker started");
setInterval(() => {
  tick().catch((err) => console.error("Tick error", err?.message || err));
}, POLL_MS);
