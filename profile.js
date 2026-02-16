const SUPABASE_URL = "https://xwafqfjhbiuogfjnlzln.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWZxZmpoYml1b2dmam5semxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODA3ODAsImV4cCI6MjA4NDc1Njc4MH0.H9a-BR3KdmlYbVAPHaDlNvpIsyzeKHAZzdZkGsKAqtU";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

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
const profileBrandLogo = document.querySelector(".brand-logo");

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

function installLogoFallback() {
  if (!profileBrandLogo) return;
  profileBrandLogo.addEventListener(
    "error",
    () => {
      const current = String(profileBrandLogo.getAttribute("src") || "");
      if (!current.includes("Tapsterlogo.png")) {
        profileBrandLogo.setAttribute("src", "assets/Tapsterlogo.png?v=2");
        return;
      }
      if (!current.includes("tracktap-logo.svg")) {
        profileBrandLogo.setAttribute("src", "assets/tracktap-logo.svg?v=2");
      }
    },
    { once: true }
  );
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

async function getAccessToken() {
  const client = ensureSupabase();
  if (!client) return "";
  const sessionResult = await authCall(() => client.auth.getSession());
  const token = String(sessionResult?.data?.session?.access_token || "").trim();
  if (token) return token;

  const refreshed = await authCall(() => client.auth.refreshSession());
  return String(refreshed?.data?.session?.access_token || "").trim();
}

function setAuthUiLoggedOut() {
  if (userAvatarBtnProfile) userAvatarBtnProfile.classList.add("is-hidden");
  if (menuBtnProfile) {
    menuBtnProfile.classList.remove("is-hidden");
    menuBtnProfile.textContent = "Log in";
  }
  if (profileName) profileName.textContent = "Session expired. Please log in again.";
  if (profilePlaylists) {
    profilePlaylists.innerHTML = '<div class="playlist-meta">Please log in to load playlists.</div>';
  }
}

function setAuthUiLoggedIn(user) {
  if (!userAvatarBtnProfile || !menuBtnProfile) return;
  const accountName = deriveAccountName(user);
  const initial = String(accountName || "U").trim().charAt(0).toUpperCase() || "U";
  userAvatarBtnProfile.textContent = initial;
  userAvatarBtnProfile.setAttribute("aria-label", `Menu for ${accountName || "user"}`);
  userAvatarBtnProfile.classList.remove("is-hidden");
  menuBtnProfile.classList.add("is-hidden");
}

function toggleUserMenu() {
  if (!userDropdownProfile) return;
  userDropdownProfile.classList.toggle("is-hidden");
}

function closeUserMenu() {
  if (!userDropdownProfile) return;
  userDropdownProfile.classList.add("is-hidden");
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

async function loadCredits(user) {
  const client = ensureSupabase();
  if (!client || !user || !creditsTotal) return;
  const cachedCreditsKey = `tapster_profile_credits_${user.id}`;
  const cachedCredits = Number(localStorage.getItem(cachedCreditsKey) || "0");
  if (Number.isFinite(cachedCredits)) creditsTotal.textContent = String(cachedCredits);

  try {
    const { data } = await client.from("profiles").select("credits").eq("id", user.id).maybeSingle();
    const remoteCredits = Number(data?.credits ?? NaN);
    if (!Number.isFinite(remoteCredits)) return;
    creditsTotal.textContent = String(remoteCredits);
    localStorage.setItem(cachedCreditsKey, String(remoteCredits));
  } catch {
    // keep cached credits
  }
}

function renderVoteBars(totalsAll, totalsWeek) {
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

async function loadReceivedStats(user) {
  const client = ensureSupabase();
  if (!client || !user) return;

  const totalsAll = { organic: 0, boost: 0 };
  const totalsWeek = { organic: 0, boost: 0 };
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data } = await client
      .from("requests")
      .select("upvotes, paid_boosts_up, paid_boosts, created_at")
      .eq("requester_id", user.id);

    (data || []).forEach((row) => {
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
  } catch {
    // leave zeroes
  }

  if (receivedTotalsAllOrganic) receivedTotalsAllOrganic.textContent = String(totalsAll.organic);
  if (receivedTotalsAllBoost) receivedTotalsAllBoost.textContent = String(totalsAll.boost);
  if (receivedTotalsWeekOrganic) receivedTotalsWeekOrganic.textContent = String(totalsWeek.organic);
  if (receivedTotalsWeekBoost) receivedTotalsWeekBoost.textContent = String(totalsWeek.boost);

  renderVoteBars(totalsAll, totalsWeek);
}

async function fetchMyPlaylistsFromEdge() {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(`${FUNCTIONS_URL}/my-playlists`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessToken: token }),
    });

    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload?.items) ? payload.items : [];
  } catch {
    return null;
  }
}

async function fetchMyPlaylistsDirect(user) {
  const client = ensureSupabase();
  if (!client || !user) return [];
  try {
    const { data } = await client
      .from("playlists")
      .select("code, playlist_name, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    return data || [];
  } catch {
    return [];
  }
}

async function fetchRoomStats(codes) {
  const client = ensureSupabase();
  if (!client || !codes.length) return {};
  try {
    const { data } = await client.from("requests").select("upvotes, room_id").in("room_id", codes);
    return (data || []).reduce((acc, row) => {
      const roomId = String(row.room_id || "");
      if (!roomId) return acc;
      if (!acc[roomId]) acc[roomId] = { upvotes: 0, songs: 0 };
      acc[roomId].upvotes += Number(row.upvotes ?? 0);
      acc[roomId].songs += 1;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

async function loadPlaylists(user) {
  if (!profilePlaylists) return;

  let rows = await fetchMyPlaylistsFromEdge();
  if (!Array.isArray(rows)) {
    rows = await fetchMyPlaylistsDirect(user);
  }

  if (!rows.length) {
    profilePlaylists.innerHTML = '<div class="playlist-meta">No playlists yet.</div>';
    return;
  }

  const codes = rows.map((row) => row.code).filter(Boolean);
  const roomStats = await fetchRoomStats(codes);

  profilePlaylists.innerHTML = rows
    .map((row) => {
      const title = row.playlist_name || "Untitled";
      const code = String(row.code || "").trim();
      const stats = roomStats[code] || { upvotes: 0, songs: 0 };
      return `
        <a class="playlist-item clickable" href="playlist.html?code=${encodeURIComponent(code)}">
          <div class="playlist-name">${title}</div>
          <div class="playlist-meta">${code}</div>
          <div class="playlist-meta">Upvotes: ${stats.upvotes} · Added tracks: ${stats.songs}</div>
        </a>
      `;
    })
    .join("");
}

async function initializeProfile() {
  const client = ensureSupabase();
  if (!client) {
    if (profileName) profileName.textContent = "Could not load profile";
    if (profilePlaylists) {
      profilePlaylists.innerHTML = '<div class="playlist-meta">Could not load playlists.</div>';
    }
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
  if (profileName) profileName.textContent = deriveAccountName(user);

  await ensureProfileRow(user);
  await Promise.allSettled([loadCredits(user), loadReceivedStats(user), loadPlaylists(user)]);
}

function bindMenuEvents() {
  if (menuBtnProfile) {
    menuBtnProfile.addEventListener("click", () => {
      if (menuBtnProfile.textContent === "Log in") {
        window.location.assign("index.html?login=1");
        return;
      }
      toggleUserMenu();
    });
  }

  if (userAvatarBtnProfile) userAvatarBtnProfile.addEventListener("click", toggleUserMenu);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      (menuBtnProfile && menuBtnProfile.contains(target)) ||
      (userAvatarBtnProfile && userAvatarBtnProfile.contains(target)) ||
      (userDropdownProfile && userDropdownProfile.contains(target))
    ) {
      return;
    }
    closeUserMenu();
  });

  if (!userDropdownProfile) return;
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

installLogoFallback();
bindMenuEvents();
initializeProfile().catch(() => {
  if (profileName) profileName.textContent = "Could not load profile";
  if (profilePlaylists) {
    profilePlaylists.innerHTML = '<div class="playlist-meta">Could not load playlists.</div>';
  }
});
