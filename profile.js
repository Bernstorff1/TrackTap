const SUPABASE_URL = "https://xwafqfjhbiuogfjnlzln.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWZxZmpoYml1b2dmam5semxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODA3ODAsImV4cCI6MjA4NDc1Njc4MH0.H9a-BR3KdmlYbVAPHaDlNvpIsyzeKHAZzdZkGsKAqtU";

let supabaseClient = window.supabase
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
const profileBrandLogo = document.querySelector(".brand-logo");

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
    userAvatarBtnProfile.textContent = "☰";
    userAvatarBtnProfile.setAttribute("aria-label", "Menu");
    userAvatarBtnProfile.classList.remove("is-hidden");
    menuBtnProfile.classList.add("is-hidden");
  } else {
    userAvatarBtnProfile.classList.add("is-hidden");
    menuBtnProfile.classList.add("is-hidden");
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

async function loadProfile() {
  const client = await ensureSupabaseClient();
  if (!client) {
    profileName.textContent = "Could not load profile";
    profilePlaylists.innerHTML = "<div class=\"playlist-meta\">Could not load playlists.</div>";
    return;
  }
  const user = await getSessionUserWithRefresh();
  updateUserMenu(user || null);
  if (!user) {
    if (profileName) profileName.textContent = "Session expired. Please log in again.";
    if (profilePlaylists) {
      profilePlaylists.innerHTML = "<div class=\"playlist-meta\">Please log in to load playlists.</div>";
    }
    return;
  }

  const name = deriveAccountName(user);
  profileName.textContent = name;
  updateUserMenu(user);

  // Non-blocking sync so header/name UI never waits on DB.
  syncProfileNameFromAuth(user);

  const cachedCreditsKey = `tapster_profile_credits_${user.id}`;
  const cachedCredits = Number(localStorage.getItem(cachedCreditsKey) || "0");
  if (Number.isFinite(cachedCredits)) {
    creditsTotal.textContent = String(cachedCredits);
  }

  try {
    const { data: profileRow } = await supabaseClient
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .maybeSingle();
    const remoteCredits = Number(profileRow?.credits ?? NaN);
    if (Number.isFinite(remoteCredits)) {
      creditsTotal.textContent = String(remoteCredits);
      try {
        localStorage.setItem(cachedCreditsKey, String(remoteCredits));
      } catch {
        // ignore storage errors
      }
    }
  } catch {
    // keep cached credits when remote profile fetch fails
  }

  if (
    receivedTotalsAllOrganic ||
    receivedTotalsAllBoost ||
    receivedTotalsWeekOrganic ||
    receivedTotalsWeekBoost
  ) {
    let allVotes = [];
    try {
      const { data } = await supabaseClient
        .from("requests")
        .select("upvotes, paid_boosts_up, paid_boosts, created_at")
        .eq("requester_id", user.id);
      allVotes = data || [];
    } catch {
      allVotes = [];
    }

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

  let rows = [];
  try {
    const { data } = await supabaseClient
      .from("playlists")
      .select("code, bar_name, playlist_name, created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    rows = data || [];
  } catch {
    profilePlaylists.innerHTML = "<div class=\"playlist-meta\">Could not load playlists.</div>";
    return;
  }

  if (!rows || !rows.length) {
    profilePlaylists.innerHTML = "<div class=\"playlist-meta\">No playlists yet.</div>";
    return;
  }

  const codes = rows.map((row) => row.code);
  let interactions = [];
  try {
    const { data } = await supabaseClient
      .from("requests")
      .select("upvotes, room_id")
      .in("room_id", codes);
    interactions = data || [];
  } catch {
    interactions = [];
  }
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

loadProfile().catch(() => {
  if (profileName) profileName.textContent = "Could not load profile";
  if (profilePlaylists) {
    profilePlaylists.innerHTML = "<div class=\"playlist-meta\">Could not load playlists.</div>";
  }
});
installLogoFallback();

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

(async () => {
  const client = await ensureSupabaseClient();
  if (!client) return;
  client.auth.onAuthStateChange(async (_event, session) => {
    const user = session?.user || null;
    if (!user) {
      const recoveredUser = await getSessionUserWithRefresh();
      if (recoveredUser) {
        updateUserMenu(recoveredUser);
        return;
      }
      updateUserMenu(null);
      if (profileName) profileName.textContent = "Session expired. Please log in again.";
      if (profilePlaylists) {
        profilePlaylists.innerHTML = "<div class=\"playlist-meta\">Please log in to load playlists.</div>";
      }
      return;
    }
    await syncProfileNameFromAuth(user);
    updateUserMenu(user);
  });
})();
