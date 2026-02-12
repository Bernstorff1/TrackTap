const SUPABASE_URL = "https://xwafqfjhbiuogfjnlzln.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWZxZmpoYml1b2dmam5semxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODA3ODAsImV4cCI6MjA4NDc1Njc4MH0.H9a-BR3KdmlYbVAPHaDlNvpIsyzeKHAZzdZkGsKAqtU";

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { detectSessionInUrl: true, persistSession: true, flowType: "pkce" },
    })
  : null;

const profileName = document.getElementById("profileName");
const profilePlaylists = document.getElementById("profilePlaylists");
const creditsTotal = document.getElementById("creditsTotal");
const receivedTotalsAllOrganic = document.getElementById("receivedTotalsAllOrganic");
const receivedTotalsAllBoost = document.getElementById("receivedTotalsAllBoost");
const receivedTotalsWeekOrganic = document.getElementById("receivedTotalsWeekOrganic");
const receivedTotalsWeekBoost = document.getElementById("receivedTotalsWeekBoost");
const menuBtnProfile = document.getElementById("menuBtnProfile");
const userAvatarBtnProfile = document.getElementById("userAvatarBtnProfile");
const userDropdownProfile = document.getElementById("userDropdownProfile");
const PREV_KEY = "tapster_prev";

function toggleUserMenu() {
  if (!userDropdownProfile) return;
  userDropdownProfile.classList.toggle("is-hidden");
}

function closeUserMenu() {
  if (!userDropdownProfile) return;
  userDropdownProfile.classList.add("is-hidden");
}

function updateUserMenu(user) {
  if (!menuBtnProfile || !userAvatarBtnProfile) return;
  if (user) {
    const name = user.user_metadata?.full_name || user.email || "User";
    userAvatarBtnProfile.textContent = (name.trim()[0] || "B").toUpperCase();
    userAvatarBtnProfile.classList.remove("is-hidden");
    menuBtnProfile.classList.add("is-hidden");
  } else {
    userAvatarBtnProfile.classList.add("is-hidden");
    menuBtnProfile.classList.add("is-hidden");
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

async function loadProfile() {
  if (!supabaseClient) return;
  const { data } = await supabaseClient.auth.getSession();
  const user = data?.session?.user;
  updateUserMenu(user || null);
  if (!user) {
    window.location.assign("index.html?login=1");
    return;
  }
  const name = user.user_metadata?.full_name || user.email || "User";
  profileName.textContent = name;
  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .maybeSingle();
  creditsTotal.textContent = String(Number(profile?.credits ?? 0));

  if (
    receivedTotalsAllOrganic ||
    receivedTotalsAllBoost ||
    receivedTotalsWeekOrganic ||
    receivedTotalsWeekBoost
  ) {
    const { data: allVotes } = await supabaseClient
      .from("requests")
      .select("upvotes, paid_boosts_up, paid_boosts, created_at")
      .eq("requester_id", user.id);

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const totalsAll = { organic: 0, boost: 0 };
    const totalsWeek = { organic: 0, boost: 0 };

    (allVotes || []).forEach((row) => {
      const boosted = Number(row.paid_boosts_up ?? row.paid_boosts ?? 0);
      const upvotes = Number(row.upvotes ?? 0);
      const organic = Math.max(0, upvotes - boosted);
      totalsAll.organic += organic;
      totalsAll.boost += boosted;

      if (row.created_at && row.created_at >= since) {
        totalsWeek.organic += organic;
        totalsWeek.boost += boosted;
      }
    });

    if (receivedTotalsAllOrganic) receivedTotalsAllOrganic.textContent = `${totalsAll.organic}`;
    if (receivedTotalsAllBoost) receivedTotalsAllBoost.textContent = `${totalsAll.boost}`;
    if (receivedTotalsWeekOrganic) receivedTotalsWeekOrganic.textContent = `${totalsWeek.organic}`;
    if (receivedTotalsWeekBoost) receivedTotalsWeekBoost.textContent = `${totalsWeek.boost}`;

    const allTotal = totalsAll.organic + totalsAll.boost || 1;
    const weekTotal = totalsWeek.organic + totalsWeek.boost || 1;
    const allOrganicBar = document.getElementById("receivedTotalsAllOrganicBar");
    const allBoostBar = document.getElementById("receivedTotalsAllBoostBar");
    const weekOrganicBar = document.getElementById("receivedTotalsWeekOrganicBar");
    const weekBoostBar = document.getElementById("receivedTotalsWeekBoostBar");
    if (allOrganicBar) allOrganicBar.style.width = `${Math.round((totalsAll.organic / allTotal) * 100)}%`;
    if (allBoostBar) allBoostBar.style.width = `${Math.round((totalsAll.boost / allTotal) * 100)}%`;
    if (weekOrganicBar) weekOrganicBar.style.width = `${Math.round((totalsWeek.organic / weekTotal) * 100)}%`;
    if (weekBoostBar) weekBoostBar.style.width = `${Math.round((totalsWeek.boost / weekTotal) * 100)}%`;
  }

  const { data: rows } = await supabaseClient
    .from("playlists")
    .select("code, bar_name, playlist_name, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (!rows || !rows.length) {
    profilePlaylists.innerHTML = "<div class=\"playlist-meta\">No playlists yet.</div>";
    return;
  }

  const codes = rows.map((row) => row.code);
  const { data: interactions } = await supabaseClient
    .from("requests")
    .select("upvotes, room_id")
    .in("room_id", codes);
  const byRoom = (interactions || []).reduce((acc, row) => {
    const key = row.room_id;
    if (!key) return acc;
    if (!acc[key]) acc[key] = { upvotes: 0, songs: 0 };
    acc[key].upvotes += Number(row.upvotes ?? 0);
    acc[key].songs += 1;
    return acc;
  }, {});

  profilePlaylists.innerHTML = rows
    .map((row) => {
      const title = row.playlist_name || "Untitled";
      const stats = byRoom[row.code] || { upvotes: 0, songs: 0 };
      return `
        <a class="playlist-item clickable" href="playlist.html?code=${encodeURIComponent(row.code)}">
          <div class="playlist-name">${title}</div>
          <div class="playlist-meta">${row.code}</div>
          <div class="playlist-meta">Upvotes: ${stats.upvotes} · Added tracks: ${stats.songs}</div>
        </a>
      `;
    })
    .join("");
}

loadProfile();

if (menuBtnProfile) menuBtnProfile.addEventListener("click", toggleUserMenu);
if (userAvatarBtnProfile) userAvatarBtnProfile.addEventListener("click", toggleUserMenu);
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (
    (menuBtnProfile && menuBtnProfile.contains(target)) ||
    (userAvatarBtnProfile && userAvatarBtnProfile.contains(target)) ||
    (userDropdownProfile && userDropdownProfile.contains(target))
  )
    return;
  closeUserMenu();
});

if (userDropdownProfile) {
  userDropdownProfile.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.getAttribute("data-action");
    if (!action) return;
    if (action === "scoreboard") {
      sessionStorage.setItem(PREV_KEY, window.location.href);
      window.location.assign("scoreboard.html");
      return;
    }
    if (action === "create-playlist") {
      sessionStorage.setItem("tapster_open_host", "true");
      window.location.assign("index.html");
      return;
    }
    if (action === "profile") {
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
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateUserMenu(session?.user || null);
    if (!session?.user) {
      window.location.assign("index.html?login=1");
    }
  });
}
