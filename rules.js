const SUPABASE_URL = "https://xwafqfjhbiuogfjnlzln.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWZxZmpoYml1b2dmam5semxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODA3ODAsImV4cCI6MjA4NDc1Njc4MH0.H9a-BR3KdmlYbVAPHaDlNvpIsyzeKHAZzdZkGsKAqtU";

const menuBtnRules = document.getElementById("menuBtnRules");
const userAvatarBtnRules = document.getElementById("userAvatarBtnRules");
const userDropdownRules = document.getElementById("userDropdownRules");
const PREV_KEY = "tapster_prev";

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { detectSessionInUrl: true, persistSession: true, flowType: "pkce" },
    })
  : null;

function toggleUserMenu() {
  if (!userDropdownRules) return;
  userDropdownRules.classList.toggle("is-hidden");
}

function closeUserMenu() {
  if (!userDropdownRules) return;
  userDropdownRules.classList.add("is-hidden");
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

async function getSessionUserWithRefresh() {
  if (!supabaseClient) return null;
  try {
    const { data } = await supabaseClient.auth.getSession();
    const user = data?.session?.user || null;
    if (user) return user;
  } catch {
    // ignore and attempt refresh fallback
  }
  try {
    const refreshed = await supabaseClient.auth.refreshSession();
    const user = refreshed?.data?.session?.user || null;
    if (user) return user;
  } catch {
    // ignore and wait for delayed auth hydration
  }
  try {
    const fetchedUser = await supabaseClient.auth.getUser();
    if (fetchedUser?.data?.user) return fetchedUser.data.user;
  } catch {
    // ignore and continue fallback chain
  }
  const storedUser = readStoredAuthUser();
  if (storedUser) return storedUser;
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
      try {
        const { data } = await supabaseClient.auth.getSession();
        if (data?.session?.user) {
          finish(data.session.user);
          return;
        }
      } catch {
        // ignore
      }
      try {
        const lateUser = await supabaseClient.auth.getUser();
        if (lateUser?.data?.user) {
          finish(lateUser.data.user);
          return;
        }
      } catch {
        // ignore
      }
      finish(readStoredAuthUser());
    }, 4500);
  });
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
  if (!menuBtnRules || !userAvatarBtnRules) return;
  if (user) {
    userAvatarBtnRules.textContent = "☰";
    userAvatarBtnRules.setAttribute("aria-label", "Menu");
    userAvatarBtnRules.classList.remove("is-hidden");
    menuBtnRules.classList.add("is-hidden");
  } else {
    userAvatarBtnRules.classList.add("is-hidden");
    menuBtnRules.classList.add("is-hidden");
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

async function initAuth() {
  if (!supabaseClient) return;
  const user = await getSessionUserWithRefresh();
  if (user) {
    await syncProfileNameFromAuth(user);
    updateUserMenu(user);
  } else {
    updateUserMenu(null);
  }
  if (!user) {
    window.location.assign("index.html?login=1");
  }
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    const sessionUser = session?.user || null;
    if (!sessionUser) {
      updateUserMenu(null);
      window.location.assign("index.html?login=1");
      return;
    }
    await syncProfileNameFromAuth(sessionUser);
    updateUserMenu(sessionUser);
  });
}

if (menuBtnRules) menuBtnRules.addEventListener("click", toggleUserMenu);
if (userAvatarBtnRules) userAvatarBtnRules.addEventListener("click", toggleUserMenu);
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (
    (menuBtnRules && menuBtnRules.contains(target)) ||
    (userAvatarBtnRules && userAvatarBtnRules.contains(target)) ||
    (userDropdownRules && userDropdownRules.contains(target))
  )
    return;
  closeUserMenu();
});

if (userDropdownRules) {
  userDropdownRules.addEventListener("click", (event) => {
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
    if (action === "scoreboard") {
      sessionStorage.setItem(PREV_KEY, window.location.href);
      window.location.assign("scoreboard.html");
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

initAuth();
