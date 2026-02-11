import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID") ?? "";
  const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET") ?? "";
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: "missing_env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const query = (url.searchParams.get("q") || "").trim();
  if (!query) {
    return new Response(JSON.stringify({ items: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const basic = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!tokenRes.ok) {
    return new Response(JSON.stringify({ items: [] }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = await tokenRes.json();
  const searchUrl = new URL("https://api.spotify.com/v1/search");
  searchUrl.searchParams.set("type", "track");
  searchUrl.searchParams.set("limit", "8");
  searchUrl.searchParams.set("q", query);

  const searchRes = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!searchRes.ok) {
    return new Response(JSON.stringify({ items: [] }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const data = await searchRes.json();
  const items = (data?.tracks?.items || []).map((item: any) => ({
    id: item.id,
    title: item.name,
    artist: item.artists?.[0]?.name || "",
    cover: item.album?.images?.[item.album.images.length - 1]?.url || "",
    isrc: item.external_ids?.isrc || "",
    uri: item.uri,
    webUrl: item.external_urls?.spotify || "",
  }));

  return new Response(JSON.stringify({ items }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
