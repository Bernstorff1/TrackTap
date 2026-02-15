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
const POST_USERNAME_NEXT_KEY = "tapster_post_username_next";

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { detectSessionInUrl: true, persistSession: true, flowType: "pkce" },
    })
  : null;

function toggleUserMenu() {
  if (!userDropdownScore) return;
  userDropdownScore.classList.toggle("is-hidden");
}

function closeUserMenu() {
  if (!userDropdownScore) return;
  userDropdownScore.classList.add("is-hidden");
}

function updateUserMenu(user) {
  if (!menuBtnScore || !userAvatarBtnScore) return;
  if (user) {
    const name = user.user_metadata?.full_name || user.email || "User";
    userAvatarBtnScore.textContent = (name.trim()[0] || "B").toUpperCase();
    userAvatarBtnScore.classList.remove("is-hidden");
    menuBtnScore.classList.add("is-hidden");
  } else {
    userAvatarBtnScore.classList.add("is-hidden");
    menuBtnScore.classList.add("is-hidden");
  }
}

function normalizeLabel(value) {
  return String(value || "").trim().toLowerCase();
}

function requiresUsernameChoice(user, displayName) {
  if (user?.user_metadata?.username_set === true) return false;
  const name = normalizeLabel(displayName);
  if (!name || name === "user") return true;
  const email = normalizeLabel(user?.email);
  const fullName = normalizeLabel(user?.user_metadata?.full_name);
  if (email && name === email) return true;
  if (fullName && name === fullName) return true;
  return false;
}

async function signOut() {
  if (!supabaseClient) return;
  try {
    await supabaseClient.auth.signOut({ scope: "global" });
    await supabaseClient.auth.signOut({ scope: "local" });
  } finally {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith("sb-"))
        .forEach((key) => localStorage.removeItem(key));
    } catch {
      // ignore
    }
    window.location.assign("index.html");
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
  if (!supabaseClient) return;
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const user = sessionData?.session?.user || null;
  updateUserMenu(user);
  if (!user) {
    window.location.assign("index.html?login=1");
    return;
  }
  const { data: ownProfile, error: ownProfileError } = await supabaseClient
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!ownProfileError && requiresUsernameChoice(user, ownProfile?.display_name)) {
    sessionStorage.setItem(
      POST_USERNAME_NEXT_KEY,
      `${window.location.pathname}${window.location.search}` || "scoreboard.html"
    );
    window.location.assign("username.html");
    return;
  }
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

loadScoreboard();

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

if (supabaseClient) {
  supabaseClient.auth.getSession().then(({ data }) => {
    updateUserMenu(data?.session?.user || null);
  });
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateUserMenu(session?.user || null);
    if (!session?.user) {
      window.location.assign("index.html?login=1");
    }
  });
}
