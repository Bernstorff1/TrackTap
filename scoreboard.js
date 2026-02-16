const SUPABASE_URL = "https://xwafqfjhbiuogfjnlzln.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWZxZmpoYml1b2dmam5semxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODA3ODAsImV4cCI6MjA4NDc1Njc4MH0.H9a-BR3KdmlYbVAPHaDlNvpIsyzeKHAZzdZkGsKAqtU";

const scoreboardList = document.getElementById("scoreboardList");
const scoreboardPlaylists = document.getElementById("scoreboardPlaylists");
const scoreboardSongs = document.getElementById("scoreboardSongs");
const menuBtnScore = document.getElementById("menuBtnScore");
const userAvatarBtnScore = document.getElementById("userAvatarBtnScore");
const userDropdownScore = document.getElementById("userDropdownScore");

const PREV_KEY = "tapster_prev";
const AUTH_STORAGE_SUFFIX = "-auth-token";
let supabaseClient = null;

function deriveAccountName(user) {
  const metadata = user?.user_metadata || {};
  const fullName = String(metadata.full_name || metadata.name || "").trim();
  if (fullName) return fullName;
  const given = String(metadata.given_name || "").trim();
  const family = String(metadata.family_name || "").trim();
  const combined = `${given} ${family}`.trim();
  if (combined) return combined;
  const emailLocal = String(user?.email || "").split("@")[0] || "";
  return String(emailLocal || "User").trim() || "User";
}

function readStoredAuthSession() {
  const parseRaw = (raw) => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const session =
            item?.access_token && item?.refresh_token
              ? item
              : item?.currentSession?.access_token && item?.currentSession?.refresh_token
                ? item.currentSession
                : item?.session?.access_token && item?.session?.refresh_token
                  ? item.session
                  : item?.data?.session?.access_token && item?.data?.session?.refresh_token
                    ? item.data.session
                    : null;
          if (session) return session;
        }
      }
      if (parsed?.access_token && parsed?.refresh_token) return parsed;
      if (parsed?.currentSession?.access_token && parsed?.currentSession?.refresh_token) {
        return parsed.currentSession;
      }
      if (parsed?.session?.access_token && parsed?.session?.refresh_token) return parsed.session;
      if (parsed?.data?.session?.access_token && parsed?.data?.session?.refresh_token) {
        return parsed.data.session;
      }
      return null;
    } catch {
      return null;
    }
  };

  const readFromStorage = (store) => {
    if (!store) return null;
    try {
      const keys = Object.keys(store).filter(
        (key) => key.startsWith("sb-") && key.endsWith(AUTH_STORAGE_SUFFIX)
      );
      for (const key of keys) {
        const session = parseRaw(store.getItem(key));
        if (session?.access_token && session?.refresh_token) return session;
      }
    } catch {
      // ignore
    }
    return null;
  };

  return readFromStorage(localStorage) || readFromStorage(sessionStorage);
}

async function authCall(run, timeoutMs = 6000) {
  try {
    return await Promise.race([
      run(),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

function ensureSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase) return null;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { detectSessionInUrl: true, persistSession: true, flowType: "pkce" },
  });
  return supabaseClient;
}

async function getStableSessionUser() {
  const client = ensureSupabase();
  if (!client) return null;

  const sessionResult = await authCall(() => client.auth.getSession());
  const sessionUser = sessionResult?.data?.session?.user || null;
  if (sessionUser) return sessionUser;

  const refreshed = await authCall(() => client.auth.refreshSession());
  const refreshedUser = refreshed?.data?.session?.user || null;
  if (refreshedUser) return refreshedUser;

  const fetchedUser = await authCall(() => client.auth.getUser());
  if (fetchedUser?.data?.user) return fetchedUser.data.user;

  const storedSession = readStoredAuthSession();
  if (storedSession?.access_token && storedSession?.refresh_token) {
    const restored = await authCall(
      () =>
        client.auth.setSession({
          access_token: storedSession.access_token,
          refresh_token: storedSession.refresh_token,
        }),
      7000
    );
    const restoredUser = restored?.data?.session?.user || null;
    if (restoredUser) return restoredUser;
  }

  return await new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let subscription = null;

    const finish = (user) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(user || null);
    };

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
      finish(session.user);
    });
    subscription = data?.subscription || null;

    timer = setTimeout(async () => {
      const lateSession = await authCall(() => client.auth.getSession(), 3000);
      if (lateSession?.data?.session?.user) {
        finish(lateSession.data.session.user);
        return;
      }
      const lateUser = await authCall(() => client.auth.getUser(), 3000);
      if (lateUser?.data?.user) {
        finish(lateUser.data.user);
        return;
      }
      finish(null);
    }, 10000);
  });
}

function renderList(element, itemsHtml, fallback) {
  if (!element) return;
  if (!itemsHtml) {
    element.innerHTML = `<div class="playlist-meta">${fallback}</div>`;
    return;
  }
  element.innerHTML = itemsHtml;
}

function setAuthUiLoggedOut() {
  if (userAvatarBtnScore) userAvatarBtnScore.classList.add("is-hidden");
  if (menuBtnScore) {
    menuBtnScore.classList.remove("is-hidden");
    menuBtnScore.textContent = "Log in";
  }
  renderList(scoreboardList, "", "Session expired. Please log in again.");
  renderList(scoreboardPlaylists, "", "Session expired. Please log in again.");
  renderList(scoreboardSongs, "", "Session expired. Please log in again.");
}

function setAuthUiLoggedIn(user) {
  if (!userAvatarBtnScore || !menuBtnScore) return;
  const accountName = deriveAccountName(user);
  const initial = String(accountName || "U").trim().charAt(0).toUpperCase() || "U";
  userAvatarBtnScore.textContent = initial;
  userAvatarBtnScore.setAttribute("aria-label", `Menu for ${accountName || "user"}`);
  userAvatarBtnScore.classList.remove("is-hidden");
  menuBtnScore.classList.add("is-hidden");
}

function toggleUserMenu() {
  if (!userDropdownScore) return;
  userDropdownScore.classList.toggle("is-hidden");
}

function closeUserMenu() {
  if (!userDropdownScore) return;
  userDropdownScore.classList.add("is-hidden");
}

async function signOut() {
  const client = ensureSupabase();
  if (!client) return;
  try {
    await client.auth.signOut({ scope: "global" });
  } catch {
    // ignore
  }
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // ignore
  }
  try {
    Object.keys(localStorage)
      .filter(
        (key) =>
          key.startsWith("sb-") ||
          key.includes("supabase.auth") ||
          key.includes("supabase-session")
      )
      .forEach((key) => localStorage.removeItem(key));
    Object.keys(sessionStorage)
      .filter(
        (key) =>
          key.startsWith("sb-") ||
          key.includes("supabase.auth") ||
          key.includes("supabase-session")
      )
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // ignore
  }
  window.location.replace("index.html?logout=1");
}

async function ensureProfileRow(user) {
  const client = ensureSupabase();
  if (!client || !user) return;
  const accountName = deriveAccountName(user);
  const now = new Date().toISOString();
  try {
    const { data, error } = await client
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (error) return;
    const currentName = String(data?.display_name || "").trim();
    if (!data) {
      await client.from("profiles").insert({
        id: user.id,
        display_name: accountName,
        credits: 10,
        updated_at: now,
      });
      return;
    }
    if (accountName && currentName !== accountName) {
      await client
        .from("profiles")
        .update({ display_name: accountName, updated_at: now })
        .eq("id", user.id);
    }
  } catch {
    // ignore
  }
}

async function loadTopUsers(rows) {
  const client = ensureSupabase();
  if (!rows.length) {
    renderList(scoreboardList, "", "No data yet.");
    return;
  }

  const totals = new Map();
  rows.forEach((row) => {
    const id = row.requester_id;
    if (!id) return;
    const boosted = Number(row.paid_boosts_up ?? row.paid_boosts ?? 0);
    const upvotes = Number(row.upvotes ?? 0);
    const organic = Math.max(0, upvotes - boosted);
    const current = totals.get(id) || { organic: 0, boosted: 0 };
    current.organic += organic;
    current.boosted += boosted;
    totals.set(id, current);
  });

  const ids = Array.from(totals.keys());
  let profiles = [];
  if (ids.length) {
    try {
      const { data } = await client.from("profiles").select("id, display_name").in("id", ids);
      profiles = data || [];
    } catch {
      profiles = [];
    }
  }

  const nameMap = new Map();
  profiles.forEach((row) => nameMap.set(row.id, row.display_name || "User"));

  const sorted = ids
    .map((id) => ({ id, ...totals.get(id) }))
    .sort((a, b) => (b.organic + b.boosted) - (a.organic + a.boosted) || b.organic - a.organic)
    .slice(0, 5);

  const html = sorted
    .map(
      (item, index) => `
        <div class="playlist-item clickable">
          <div class="playlist-name">${index + 1}. ${nameMap.get(item.id) || "User"}</div>
          <div class="playlist-meta">Upvotes: ${item.organic} · Boosts: ${item.boosted}</div>
        </div>
      `
    )
    .join("");

  renderList(scoreboardList, html, "No data yet.");
}

async function loadTopPlaylists(rows) {
  const client = ensureSupabase();
  if (!rows.length) {
    renderList(scoreboardPlaylists, "", "No data yet.");
    return;
  }

  const playlistTotals = new Map();
  rows.forEach((row) => {
    const roomId = String(row.room_id || "").trim();
    if (!roomId) return;
    const boosted = Number(row.paid_boosts_up ?? row.paid_boosts ?? 0);
    const upvotes = Number(row.upvotes ?? 0);
    const organic = Math.max(0, upvotes - boosted);
    const current = playlistTotals.get(roomId) || { organic: 0, boosted: 0, songs: 0 };
    current.organic += organic;
    current.boosted += boosted;
    current.songs += 1;
    playlistTotals.set(roomId, current);
  });

  const playlistIds = Array.from(playlistTotals.keys());
  let playlistRows = [];
  if (playlistIds.length) {
    try {
      const { data } = await client
        .from("playlists")
        .select("code, playlist_name")
        .in("code", playlistIds);
      playlistRows = data || [];
    } catch {
      playlistRows = [];
    }
  }

  const playlistNameMap = new Map();
  playlistRows.forEach((row) => playlistNameMap.set(row.code, row.playlist_name || row.code));

  const sorted = playlistIds
    .filter((id) => playlistNameMap.has(id))
    .map((id) => ({ id, ...playlistTotals.get(id) }))
    .sort((a, b) => (b.organic + b.boosted) - (a.organic + a.boosted) || b.organic - a.organic)
    .slice(0, 5);

  const html = sorted
    .map(
      (item, index) => `
        <div class="playlist-item clickable" data-code="${item.id}">
          <div class="playlist-name">${index + 1}. ${playlistNameMap.get(item.id) || item.id}</div>
          <div class="playlist-meta">Upvotes: ${item.organic} · Boosts: ${item.boosted} · Tracks: ${item.songs}</div>
        </div>
      `
    )
    .join("");

  renderList(scoreboardPlaylists, html, "No data yet.");

  if (scoreboardPlaylists) {
    scoreboardPlaylists.querySelectorAll(".playlist-item[data-code]").forEach((item) => {
      item.addEventListener("click", () => {
        const code = item.getAttribute("data-code");
        if (!code) return;
        window.location.assign(`playlist.html?code=${encodeURIComponent(code)}`);
      });
    });
  }
}

async function loadTopSongs() {
  const client = ensureSupabase();
  let rows = [];
  try {
    const { data } = await client
      .from("requests")
      .select("track_title, artist, room_id, upvotes");
    rows = data || [];
  } catch {
    renderList(scoreboardSongs, "", "Could not fetch top songs.");
    return;
  }

  if (!rows.length) {
    renderList(scoreboardSongs, "", "No song data yet.");
    return;
  }

  const totals = new Map();
  rows.forEach((row) => {
    const title = String(row.track_title || "").trim();
    const artist = String(row.artist || "").trim();
    if (!title) return;

    const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
    const current = totals.get(key) || {
      title,
      artist,
      upvotes: 0,
      requests: 0,
      playlists: new Set(),
    };

    current.upvotes += Number(row.upvotes ?? 0);
    current.requests += 1;

    const roomId = String(row.room_id || "").trim();
    if (roomId) current.playlists.add(roomId);

    totals.set(key, current);
  });

  const sorted = Array.from(totals.values())
    .sort((a, b) => b.upvotes - a.upvotes || b.requests - a.requests || a.title.localeCompare(b.title))
    .slice(0, 5);

  const html = sorted
    .map(
      (item, index) => `
        <div class="playlist-item clickable">
          <div class="playlist-name">${index + 1}. ${item.title}</div>
          <div class="playlist-meta">${item.artist || "Unknown artist"}</div>
          <div class="playlist-meta">Upvotes: ${item.upvotes} · Requests: ${item.requests} · Playlists: ${item.playlists.size}</div>
        </div>
      `
    )
    .join("");

  renderList(scoreboardSongs, html, "No song data yet.");
}

async function loadScoreboardData() {
  const client = ensureSupabase();
  if (!client) {
    renderList(scoreboardList, "", "Could not load scoreboard.");
    renderList(scoreboardPlaylists, "", "Could not load scoreboard.");
    renderList(scoreboardSongs, "", "Could not load scoreboard.");
    return;
  }

  let user = await getStableSessionUser();
  if (!user) {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    user = await getStableSessionUser();
  }

  if (!user) {
    setAuthUiLoggedOut();
    return;
  }

  setAuthUiLoggedIn(user);
  await ensureProfileRow(user);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let weeklyRows = [];
  try {
    const { data } = await client
      .from("requests")
      .select("requester_id, room_id, upvotes, paid_boosts_up, paid_boosts, created_at")
      .gte("created_at", since)
      .not("requester_id", "is", null);
    weeklyRows = data || [];
  } catch {
    weeklyRows = [];
  }

  await Promise.allSettled([loadTopUsers(weeklyRows), loadTopPlaylists(weeklyRows), loadTopSongs()]);
}

function bindMenuEvents() {
  if (menuBtnScore) {
    menuBtnScore.addEventListener("click", () => {
      if (menuBtnScore.textContent === "Log in") {
        window.location.assign("index.html?login=1");
        return;
      }
      toggleUserMenu();
    });
  }

  if (userAvatarBtnScore) userAvatarBtnScore.addEventListener("click", toggleUserMenu);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      (menuBtnScore && menuBtnScore.contains(target)) ||
      (userAvatarBtnScore && userAvatarBtnScore.contains(target)) ||
      (userDropdownScore && userDropdownScore.contains(target))
    ) {
      return;
    }
    closeUserMenu();
  });

  if (!userDropdownScore) return;
  userDropdownScore.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.getAttribute("data-action");
    if (!action) return;

    if (action === "create-playlist") {
      sessionStorage.setItem("tapster_open_host", "true");
      window.location.assign("index.html");
      return;
    }
    if (action === "profile") {
      sessionStorage.setItem(PREV_KEY, window.location.href);
      window.location.assign("profile.html");
      return;
    }
    if (action === "rules") {
      window.location.assign("rules.html");
      return;
    }
    if (action === "logout") {
      signOut();
    }
  });
}

bindMenuEvents();
loadScoreboardData().catch(() => {
  renderList(scoreboardList, "", "Could not load scoreboard.");
  renderList(scoreboardPlaylists, "", "Could not load scoreboard.");
  renderList(scoreboardSongs, "", "Could not load scoreboard.");
});
