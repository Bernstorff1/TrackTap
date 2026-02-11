const SUPABASE_URL = "https://xwafqfjhbiuogfjnlzln.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWZxZmpoYml1b2dmam5semxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODA3ODAsImV4cCI6MjA4NDc1Njc4MH0.H9a-BR3KdmlYbVAPHaDlNvpIsyzeKHAZzdZkGsKAqtU";

const scoreboardList = document.getElementById("scoreboardList");
const scoreboardPlaylists = document.getElementById("scoreboardPlaylists");
const menuBtnScore = document.getElementById("menuBtnScore");
const userAvatarBtnScore = document.getElementById("userAvatarBtnScore");
const userDropdownScore = document.getElementById("userDropdownScore");
const PREV_KEY = "tapster_prev";

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
    const name = user.user_metadata?.full_name || user.email || "Bruger";
    userAvatarBtnScore.textContent = (name.trim()[0] || "B").toUpperCase();
    userAvatarBtnScore.classList.remove("is-hidden");
    menuBtnScore.classList.add("is-hidden");
  } else {
    userAvatarBtnScore.classList.add("is-hidden");
    menuBtnScore.classList.add("is-hidden");
  }
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

async function loadScoreboard() {
  if (!supabaseClient) return;
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const user = sessionData?.session?.user || null;
  updateUserMenu(user);
  if (!user) {
    window.location.assign("index.html?login=1");
    return;
  }
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabaseClient
    .from("requests")
    .select("requester_id, room_id, upvotes, paid_boosts_up, paid_boosts, created_at")
    .gte("created_at", since)
    .not("requester_id", "is", null);
  if (error) {
    renderEmpty("Kunne ikke hente scoreboard.");
    renderEmptyPlaylists("Kunne ikke hente scoreboard.");
    return;
  }
  if (!rows || rows.length === 0) {
    renderEmpty("Ingen data endnu.");
    renderEmptyPlaylists("Ingen data endnu.");
    return;
  }

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
  (profiles || []).forEach((row) => nameMap.set(row.id, row.display_name || "Bruger"));

  const sorted = ids
    .map((id) => ({ id, ...totals.get(id) }))
    .sort((a, b) => b.total - a.total || b.organic - a.organic);

  scoreboardList.innerHTML = sorted
    .slice(0, 5)
    .map(
      (item, index) => `
        <div class="playlist-item clickable">
          <div class="playlist-name">${index + 1}. ${nameMap.get(item.id) || "Bruger"}</div>
          <div class="playlist-meta">
            Upvotes: ${item.total} · Organiske: ${item.organic} · Boosts: ${item.boosted}
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
    .sort((a, b) => b.total - a.total || b.organic - a.organic);

  if (!playlistSorted.length) {
    renderEmptyPlaylists("Ingen data endnu.");
    return;
  }

  scoreboardPlaylists.innerHTML = playlistSorted
    .slice(0, 5)
    .map(
      (item, index) => `
        <div class="playlist-item clickable" data-code="${item.id}">
          <div class="playlist-name">${index + 1}. ${playlistNameMap.get(item.id) || item.id}</div>
          <div class="playlist-meta">
            Upvotes: ${item.total} · Organiske: ${item.organic} · Boosts: ${item.boosted} · Sange: ${item.songs}
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
