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

let supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { detectSessionInUrl: true, persistSession: true, flowType: "pkce" },
    })
  : null;

function loadScript(src, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`script[data-codex-src="${src}"]`);
    if (existing) {
      if (window.supabase) {
        resolve(true);
        return;
      }
      existing.addEventListener("load", () => resolve(!!window.supabase), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.codexSrc = src;
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    script.onload = () => done(!!window.supabase);
    script.onerror = () => done(false);
    const timer = setTimeout(() => done(false), timeoutMs);
    document.head.appendChild(script);
  });
}

async function ensureSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const urls = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "https://unpkg.com/@supabase/supabase-js@2",
  ];
  for (const url of urls) {
    if (window.supabase) break;
    await loadScript(url, 4500);
  }
  if (!window.supabase) return null;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { detectSessionInUrl: true, persistSession: true, flowType: "pkce" },
  });
  return supabaseClient;
}

function toggleUserMenu() {
  if (!userDropdownScore) return;
  userDropdownScore.classList.toggle("is-hidden");
}

function closeUserMenu() {
  if (!userDropdownScore) return;
  userDropdownScore.classList.add("is-hidden");
}

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

function readStoredAuthUser() {
  const extractUser = (value) => {
    if (!value) return null;
    if (value?.user?.id) return value.user;
    if (value?.id && value?.aud) return value;
    return null;
  };
  const parseRaw = (raw) => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const nested =
            extractUser(item) ||
            extractUser(item?.currentSession) ||
            extractUser(item?.session) ||
            extractUser(item?.data?.session);
          if (nested) return nested;
        }
      }
      return (
        extractUser(parsed) ||
        extractUser(parsed?.currentSession) ||
        extractUser(parsed?.session) ||
        extractUser(parsed?.data?.session)
      );
    } catch {
      return null;
    }
  };
  const readFromStorage = (store) => {
    if (!store) return null;
    try {
      const keys = Object.keys(store).filter(
        (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
      );
      for (const key of keys) {
        const user = parseRaw(store.getItem(key));
        if (user?.id) return user;
      }
    } catch {
      // ignore storage read errors
    }
    return null;
  };
  return readFromStorage(localStorage) || readFromStorage(sessionStorage);
}

function readStoredAuthSession() {
  const extractSession = (value) => {
    if (!value) return null;
    if (value?.access_token && value?.refresh_token) return value;
    if (value?.currentSession?.access_token && value?.currentSession?.refresh_token) return value.currentSession;
    if (value?.session?.access_token && value?.session?.refresh_token) return value.session;
    if (value?.data?.session?.access_token && value?.data?.session?.refresh_token) return value.data.session;
    return null;
  };
  const parseRaw = (raw) => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const session = extractSession(item);
          if (session) return session;
        }
      }
      return extractSession(parsed);
    } catch {
      return null;
    }
  };
  const readFromStorage = (store) => {
    if (!store) return null;
    try {
      const keys = Object.keys(store).filter(
        (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
      );
      for (const key of keys) {
        const session = parseRaw(store.getItem(key));
        if (session?.access_token && session?.refresh_token) return session;
      }
    } catch {
      // ignore storage read errors
    }
    return null;
  };
  return readFromStorage(localStorage) || readFromStorage(sessionStorage);
}

async function callAuthWithTimeout(run, timeoutMs = 2200) {
  try {
    return await Promise.race([
      run(),
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

async function getSessionUserWithRefresh() {
  try {
    if (!supabaseClient) return null;
    const sessionResult = await callAuthWithTimeout(() => supabaseClient.auth.getSession());
    const sessionUser = sessionResult?.data?.session?.user || null;
    if (sessionUser) return sessionUser;

    const refreshed = await callAuthWithTimeout(() => supabaseClient.auth.refreshSession());
    const refreshedUser = refreshed?.data?.session?.user || null;
    if (refreshedUser) return refreshedUser;

    const fetchedUser = await callAuthWithTimeout(() => supabaseClient.auth.getUser());
    if (fetchedUser?.data?.user) return fetchedUser.data.user;
    const storedSession = readStoredAuthSession();
    if (storedSession?.access_token && storedSession?.refresh_token) {
      const restored = await callAuthWithTimeout(
        () =>
          supabaseClient.auth.setSession({
            access_token: storedSession.access_token,
            refresh_token: storedSession.refresh_token,
          }),
        2500
      );
      const restoredUser = restored?.data?.session?.user || null;
      if (restoredUser) return restoredUser;
    }
    return await new Promise((resolve) => {
      let resolved = false;
      let timer = null;
      let subscription = null;
      const finish = (user) => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        subscription?.unsubscribe();
        resolve(user || null);
      };
      const { data: authData } = supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) return;
        finish(session.user);
      });
      subscription = authData?.subscription || null;
      timer = setTimeout(async () => {
        const lateSession = await callAuthWithTimeout(() => supabaseClient.auth.getSession(), 1800);
        if (lateSession?.data?.session?.user) {
          finish(lateSession.data.session.user);
          return;
        }
        const lateUser = await callAuthWithTimeout(() => supabaseClient.auth.getUser(), 1800);
        if (lateUser?.data?.user) {
          finish(lateUser.data.user);
          return;
        }
        const lateStoredSession = readStoredAuthSession();
        if (lateStoredSession?.access_token && lateStoredSession?.refresh_token) {
          const restored = await callAuthWithTimeout(
            () =>
              supabaseClient.auth.setSession({
                access_token: lateStoredSession.access_token,
                refresh_token: lateStoredSession.refresh_token,
              }),
            2500
          );
          if (restored?.data?.session?.user) {
            finish(restored.data.session.user);
            return;
          }
        }
        finish(null);
      }, 4500);
    });
  } catch {
    return readStoredAuthUser();
  }
}

async function syncProfileNameFromAuth(user) {
  if (!supabaseClient || !user) return;
  const accountName = deriveAccountName(user);
  if (!accountName) return;
  const now = new Date().toISOString();
  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (error) return;
    const currentName = String(data?.display_name || "").trim();
    if (!data) {
      await supabaseClient.from("profiles").insert({
        id: user.id,
        display_name: accountName,
        credits: 10,
        updated_at: now,
      });
      return;
    }
    if (currentName !== accountName) {
      await supabaseClient
        .from("profiles")
        .update({ display_name: accountName, updated_at: now })
        .eq("id", user.id);
    }
  } catch {
    // ignore profile sync errors
  }
}

function updateUserMenu(user) {
  if (!menuBtnScore || !userAvatarBtnScore) return;
  if (user) {
    userAvatarBtnScore.textContent = "☰";
    userAvatarBtnScore.setAttribute("aria-label", "Menu");
    userAvatarBtnScore.classList.remove("is-hidden");
    menuBtnScore.classList.add("is-hidden");
  } else {
    userAvatarBtnScore.classList.add("is-hidden");
    menuBtnScore.classList.add("is-hidden");
  }
}

async function signOut() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  if (!supabaseClient) return;
  try {
    await Promise.race([
      (async () => {
        try {
          await supabaseClient.auth.signOut({ scope: "global" });
        } catch {
          // ignore
        }
        try {
          await supabaseClient.auth.signOut({ scope: "local" });
        } catch {
          // ignore
        }
      })(),
      wait(2500),
    ]);
  } finally {
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
}

function renderEmpty(message) {
  if (!scoreboardList) return;
  scoreboardList.innerHTML = `<div class="playlist-meta">${message}</div>`;
}

function renderEmptyPlaylists(message) {
  if (!scoreboardPlaylists) return;
  scoreboardPlaylists.innerHTML = `<div class="playlist-meta">${message}</div>`;
}

function renderEmptySongs(message) {
  if (!scoreboardSongs) return;
  scoreboardSongs.innerHTML = `<div class="playlist-meta">${message}</div>`;
}

async function loadScoreboard() {
  const client = await ensureSupabaseClient();
  if (!client) {
    renderEmpty("Could not load scoreboard.");
    renderEmptyPlaylists("Could not load scoreboard.");
    renderEmptySongs("Could not load scoreboard.");
    return;
  }
  const user = await getSessionUserWithRefresh();
  updateUserMenu(user);
  if (!user) {
    window.location.assign("index.html?login=1");
    return;
  }
  await syncProfileNameFromAuth(user);
  updateUserMenu(user);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabaseClient
    .from("requests")
    .select("requester_id, room_id, upvotes, paid_boosts_up, paid_boosts, created_at")
    .gte("created_at", since)
    .not("requester_id", "is", null);

  const { data: songRows, error: songsError } = await supabaseClient
    .from("requests")
    .select("track_title, artist, room_id, upvotes");

  if (error) {
    renderEmpty("Could not fetch scoreboard.");
    renderEmptyPlaylists("Could not fetch scoreboard.");
  } else if (!rows || rows.length === 0) {
    renderEmpty("No data yet.");
    renderEmptyPlaylists("No data yet.");
  } else {
    const totals = new Map();
    rows.forEach((row) => {
      const id = row.requester_id;
      if (!id) return;
      const boosted = Number(row.paid_boosts_up ?? row.paid_boosts ?? 0);
      const upvotes = Number(row.upvotes ?? 0);
      const organic = Math.max(0, upvotes - boosted);
      const current = totals.get(id) || { total: 0, organic: 0, boosted: 0 };
      current.total += upvotes;
      current.organic += organic;
      current.boosted += boosted;
      totals.set(id, current);
    });

    const ids = Array.from(totals.keys());
    const { data: profiles } = await supabaseClient
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);
    const nameMap = new Map();
    (profiles || []).forEach((row) => nameMap.set(row.id, row.display_name || "User"));

    const sorted = ids
      .map((id) => ({ id, ...totals.get(id) }))
      .sort(
        (a, b) =>
          (b.organic + b.boosted) - (a.organic + a.boosted) ||
          b.organic - a.organic
      );

    scoreboardList.innerHTML = sorted
      .slice(0, 5)
      .map(
        (item, index) => `
          <div class="playlist-item clickable">
            <div class="playlist-name">${index + 1}. ${nameMap.get(item.id) || "User"}</div>
            <div class="playlist-meta">
              Upvotes: ${item.organic} · Boosts: ${item.boosted}
            </div>
          </div>
        `
      )
      .join("");

    const playlistTotals = new Map();
    rows.forEach((row) => {
      const roomId = row.room_id;
      if (!roomId) return;
      const boosted = Number(row.paid_boosts_up ?? row.paid_boosts ?? 0);
      const upvotes = Number(row.upvotes ?? 0);
      const organic = Math.max(0, upvotes - boosted);
      const current = playlistTotals.get(roomId) || { total: 0, organic: 0, boosted: 0, songs: 0 };
      current.total += upvotes;
      current.organic += organic;
      current.boosted += boosted;
      current.songs += 1;
      playlistTotals.set(roomId, current);
    });

    const playlistIds = Array.from(playlistTotals.keys());
    const { data: playlistRows } = await supabaseClient
      .from("playlists")
      .select("code, playlist_name")
      .in("code", playlistIds);
    const playlistNameMap = new Map();
    (playlistRows || []).forEach((row) =>
      playlistNameMap.set(row.code, row.playlist_name || row.code)
    );

    const validPlaylistIds = playlistIds.filter((id) => playlistNameMap.has(id));
    const playlistSorted = validPlaylistIds
      .map((id) => ({ id, ...playlistTotals.get(id) }))
      .sort(
        (a, b) =>
          (b.organic + b.boosted) - (a.organic + a.boosted) ||
          b.organic - a.organic
      );

    if (!playlistSorted.length) {
      renderEmptyPlaylists("No data yet.");
    } else {
      scoreboardPlaylists.innerHTML = playlistSorted
        .slice(0, 5)
        .map(
          (item, index) => `
            <div class="playlist-item clickable" data-code="${item.id}">
              <div class="playlist-name">${index + 1}. ${playlistNameMap.get(item.id) || item.id}</div>
              <div class="playlist-meta">
                Upvotes: ${item.organic} · Boosts: ${item.boosted} · Tracks: ${item.songs}
              </div>
            </div>
          `
        )
        .join("");

      scoreboardPlaylists.querySelectorAll(".playlist-item[data-code]").forEach((item) => {
        item.addEventListener("click", () => {
          const code = item.getAttribute("data-code");
          if (!code) return;
          window.location.assign(`playlist.html?code=${encodeURIComponent(code)}`);
        });
      });
    }
  }

  if (songsError) {
    renderEmptySongs("Could not fetch top songs.");
    return;
  }
  if (!songRows || !songRows.length) {
    renderEmptySongs("No song data yet.");
    return;
  }

  const songTotals = new Map();
  songRows.forEach((row) => {
    const title = String(row.track_title || "").trim();
    const artist = String(row.artist || "").trim();
    if (!title) return;
    const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
    const upvotes = Number(row.upvotes ?? 0);
    const roomId = String(row.room_id || "").trim();
    const current = songTotals.get(key) || {
      title,
      artist,
      upvotes: 0,
      requests: 0,
      playlistSet: new Set(),
    };
    current.upvotes += upvotes;
    current.requests += 1;
    if (roomId) current.playlistSet.add(roomId);
    songTotals.set(key, current);
  });

  const songsSorted = Array.from(songTotals.values()).sort(
    (a, b) =>
      b.upvotes - a.upvotes ||
      b.requests - a.requests ||
      a.title.localeCompare(b.title)
  );

  if (!songsSorted.length) {
    renderEmptySongs("No song data yet.");
    return;
  }

  if (!scoreboardSongs) return;
  scoreboardSongs.innerHTML = songsSorted
    .slice(0, 5)
    .map(
      (item, index) => `
        <div class="playlist-item clickable">
          <div>
            <div class="playlist-name">${index + 1}. ${item.title}</div>
            <div class="playlist-meta">${item.artist || "Unknown artist"}</div>
            <div class="playlist-meta">
              Upvotes: ${item.upvotes} · Requests: ${item.requests} · Playlists: ${item.playlistSet.size}
            </div>
          </div>
        </div>
      `
    )
    .join("");
}

loadScoreboard().catch(() => {
  renderEmpty("Could not fetch scoreboard.");
  renderEmptyPlaylists("Could not fetch scoreboard.");
  renderEmptySongs("Could not fetch scoreboard.");
});

if (menuBtnScore) menuBtnScore.addEventListener("click", toggleUserMenu);
if (userAvatarBtnScore) userAvatarBtnScore.addEventListener("click", toggleUserMenu);
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (
    (menuBtnScore && menuBtnScore.contains(target)) ||
    (userAvatarBtnScore && userAvatarBtnScore.contains(target)) ||
    (userDropdownScore && userDropdownScore.contains(target))
  )
    return;
  closeUserMenu();
});

  if (userDropdownScore) {
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

(async () => {
  const client = await ensureSupabaseClient();
  if (!client) {
    updateUserMenu(null);
    return;
  }
  getSessionUserWithRefresh().then((user) => {
    if (!user) {
      updateUserMenu(null);
      return;
    }
    updateUserMenu(user);
  });
  client.auth.onAuthStateChange(async (_event, session) => {
    const user = session?.user || null;
    if (!user) {
      const recoveredUser = await getSessionUserWithRefresh();
      if (recoveredUser) {
        updateUserMenu(recoveredUser);
        return;
      }
      updateUserMenu(null);
      renderEmpty("Session expired. Please log in again.");
      renderEmptyPlaylists("Session expired. Please log in again.");
      renderEmptySongs("Session expired. Please log in again.");
      return;
    }
    await syncProfileNameFromAuth(user);
    updateUserMenu(user);
  });
})();
