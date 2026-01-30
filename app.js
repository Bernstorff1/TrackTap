const screens = Array.from(document.querySelectorAll(".screen"));
const tabs = Array.from(document.querySelectorAll(".tab"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

const guestForm = document.getElementById("guestForm");
const guestInput = document.getElementById("guestCode");
const guestHelper = document.getElementById("guestHelper");
const guestCodeText = document.getElementById("guestCodeText");
const guestInline = document.getElementById("guestInline");
const guestInlineClose = document.getElementById("guestInlineClose");
const guestLoginBtn = document.getElementById("guestLoginBtn");
const guestSignupBtn = document.getElementById("guestSignupBtn");
const hostInline = document.getElementById("hostInline");
const hostInlineClose = document.getElementById("hostInlineClose");

const hostHelper = document.getElementById("hostHelper");
const hostPlaylists = document.getElementById("hostPlaylists");
const refreshPlaylists = document.getElementById("refreshPlaylists");
const hostCodeText = document.getElementById("hostCodeText");

const createForm = document.getElementById("createForm");
const playlistInput = document.getElementById("playlistName");
const hostPasswordCreate = document.getElementById("hostPasswordCreate");
const createHelper = document.getElementById("createHelper");
const createBtn = document.getElementById("createBtn");
const createSuccess = document.getElementById("createSuccess");
const guestResultCode = document.getElementById("guestResultCode");
const hostResultPassword = document.getElementById("hostResultPassword");
const copyButtons = Array.from(document.querySelectorAll(".copy-btn"));

const guestSuccessBack = document.getElementById("guestSuccessBack");
const hostSuccessBack = document.getElementById("hostSuccessBack");

const SUPABASE_URL = "https://xwafqfjhbiuogfjnlzln.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWZxZmpoYml1b2dmam5semxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODA3ODAsImV4cCI6MjA4NDc1Njc4MH0.H9a-BR3KdmlYbVAPHaDlNvpIsyzeKHAZzdZkGsKAqtU";
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { detectSessionInUrl: true, persistSession: true, flowType: "pkce" },
    })
  : null;
const GUEST_HELPER_DEFAULT = "Koden skal være 6–8 tegn.";
const HOST_HELPER_DEFAULT = "Log ind for at se dine playlister.";
const CREATE_HELPER_DEFAULT = "Udfyld password for at fortsætte.";

const authModal = document.getElementById("authModal");
const authTitle = document.getElementById("authTitle");
const authPrimary = document.getElementById("authPrimary");
const closeAuth = document.getElementById("closeAuth");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authHelper = document.getElementById("authHelper");
const authProviderButtons = Array.from(document.querySelectorAll(".auth-provider"));
const loginBtn = document.getElementById("loginBtn");
const userMenu = document.getElementById("userMenu");
const userAvatarBtn = document.getElementById("userAvatarBtn");
const userDropdown = document.getElementById("userDropdown");

function hostPasswordKey(code) {
  return `tapster_${code}_host_password`;
}

function normalizeCode(value) {
  return value.toUpperCase().replace(/\s+/g, "");
}

function isValidCode(value) {
  return value.length >= 6 && value.length <= 8;
}

function toggleHelper(helperEl, show) {
  helperEl.classList.toggle("visible", show);
}

function setHelperMessage(helperEl, message, show) {
  if (!helperEl) return;
  helperEl.textContent = message;
  toggleHelper(helperEl, show);
}

function authRedirectUrl() {
  const { origin, pathname } = window.location;
  if (pathname.includes("/TrackTap/")) {
    return `${origin}/TrackTap/`;
  }
  return `${origin}/`;
}

async function completeOAuthRedirect() {
  if (!supabaseClient) return;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (code) {
    const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
    if (error) {
      updateUserStatus(null);
      return;
    }
    window.history.replaceState({}, "", window.location.pathname);
    return;
  }
  if (accessToken && refreshToken) {
    const { error } = await supabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }
}

function showScreen(id) {
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === id);
  });
}

function setGuestInlineVisible(isVisible) {
  if (!guestInline) return;
  guestInline.classList.toggle("active", isVisible);
}

function setHostInlineVisible(isVisible) {
  if (!hostInline) return;
  hostInline.classList.toggle("active", isVisible);
  document.body.classList.toggle("host-open", isVisible);
}

function openAuthModal(mode) {
  if (!authModal || !authTitle || !authPrimary) return;
  const isSignup = mode === "signup";
  authTitle.textContent = isSignup ? "Opret bruger" : "Log ind";
  authPrimary.textContent = isSignup ? "Opret bruger" : "Log ind";
  authPrimary.dataset.mode = isSignup ? "signup" : "login";
  setHelperMessage(authHelper, "", false);
  authModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function updateUserStatus(user) {
  if (!loginBtn || !userMenu || !userAvatarBtn) return;
  if (!user) {
    loginBtn.classList.remove("is-hidden");
    userMenu.classList.add("is-hidden");
    return;
  }
  const name = user.user_metadata?.full_name || user.email || "Bruger";
  const initial = (name.trim()[0] || "B").toUpperCase();
  userAvatarBtn.textContent = initial;
  loginBtn.classList.add("is-hidden");
  userMenu.classList.remove("is-hidden");
}

function parseRoute() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  let code = params.get("code");

  if (!code && path.startsWith("/guest/")) {
    code = path.split("/")[2] || "";
  }

  if (!code && path.startsWith("/host/")) {
    code = path.split("/")[2] || "";
  }

  return { path, code: normalizeCode(code || "") };
}

function handleRoute() {
  const { path, code } = parseRoute();
  const params = new URLSearchParams(window.location.search);
  const loginParam = params.get("login");

  if (path.startsWith("/guest")) {
    if (code) {
      setGuestInlineVisible(false);
      setHostInlineVisible(false);
      guestCodeText.textContent = code;
      showScreen("screen-guest-success");
    } else {
      showScreen("screen-home");
      setGuestInlineVisible(true);
      setHostInlineVisible(false);
    }
    return;
  }

  if (path.startsWith("/host")) {
    if (code) {
      setGuestInlineVisible(false);
      setHostInlineVisible(false);
      hostCodeText.textContent = code;
      showScreen("screen-host-success");
    } else {
      showScreen("screen-home");
      setGuestInlineVisible(true);
      setHostInlineVisible(true);
    }
    return;
  }

  showScreen("screen-home");
  setGuestInlineVisible(true);
  setHostInlineVisible(false);

  if (loginParam === "1") {
    openAuthModal("login");
    params.delete("login");
    const next = params.toString();
    const nextUrl = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
  }
}

function navigateTo(path) {
  try {
    window.history.pushState({}, "", path);
    handleRoute();
  } catch (error) {
    window.location.assign(path);
  }
}

function setLoading(button, isLoading, label) {
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? label : button.dataset.label;
}

function generateCode(length) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function fetchBarByCode(code) {
  if (!supabaseClient) return { data: null, error: new Error("Supabase not configured") };
  return supabaseClient.from("playlists").select("*").eq("code", code).maybeSingle();
}

async function fetchMyPlaylists() {
  if (!supabaseClient) return [];
  const { data } = await supabaseClient.auth.getSession();
  const user = data?.session?.user;
  if (!user) return null;
  const { data: rows } = await supabaseClient
    .from("playlists")
    .select("code, bar_name, playlist_name, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  return rows || [];
}

async function joinAsGuest(code) {
  const { data, error } = await fetchBarByCode(code);
  if (error) throw error;
  if (!data) throw new Error("not_found");
  return data;
}

async function seedInitialRequest(code) {
  if (!supabaseClient) return;
  const row = {
    id: `seed-${code}`,
    room_id: code,
    track_title: "Superstition",
    artist: "Stevie Wonder",
    comment: "",
    status: "queued",
    created_at: new Date().toISOString(),
    upvotes: 0,
    downvotes: 0,
    dj_pinned: false,
    paid_boosts: 0,
  };
  await supabaseClient.from("requests").upsert(row, { onConflict: "id" });
}

async function createBar({ playlistName, hostPassword }) {
  if (!supabaseClient) throw new Error("Supabase not configured");
  const { data } = await supabaseClient.auth.getSession();
  const user = data?.session?.user;
  if (!user) throw new Error("auth_required");
  const barName = user.user_metadata?.full_name || user.email || "Min bar";
  const trimmedPlaylist = playlistName || null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sharedCode = generateCode(6);
    const { error } = await supabaseClient.from("playlists").insert({
      code: sharedCode,
      bar_name: barName,
      playlist_name: trimmedPlaylist,
      host_password: hostPassword,
      owner_id: user.id,
    });
    if (!error) {
      await seedInitialRequest(sharedCode);
      return {
        guestCode: sharedCode,
        hostCode: sharedCode,
        hostPassword,
      };
    }
    if (error.code !== "23505") throw error;
  }
  throw new Error("code_collision");
}

guestInput.addEventListener("input", () => {
  const normalized = normalizeCode(guestInput.value).slice(0, 8);
  guestInput.value = normalized;
  setHelperMessage(guestHelper, GUEST_HELPER_DEFAULT, normalized.length > 0 && !isValidCode(normalized));
});

guestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = normalizeCode(guestInput.value).slice(0, 8);
  const invalid = !isValidCode(code);
  setHelperMessage(guestHelper, GUEST_HELPER_DEFAULT, invalid);
  if (invalid) return;
  try {
    await joinAsGuest(code);
    window.location.assign(`playlist.html?code=${encodeURIComponent(code)}`);
  } catch (error) {
    const message = error.message === "not_found" ? "Koden findes ikke." : "Kunne ikke finde baren.";
    setHelperMessage(guestHelper, message, true);
  }
});

hostPasswordCreate.addEventListener("input", () => {
  setHelperMessage(createHelper, CREATE_HELPER_DEFAULT, !hostPasswordCreate.value.trim());
});

async function renderMyPlaylists() {
  if (!hostPlaylists || !hostHelper) return;
  const rows = await fetchMyPlaylists();
  if (rows === null) {
    setHelperMessage(hostHelper, HOST_HELPER_DEFAULT, true);
    hostPlaylists.innerHTML = "";
    return;
  }
  setHelperMessage(hostHelper, "", false);
  if (!rows.length) {
    hostPlaylists.innerHTML = "<div class=\"playlist-meta\">Ingen playlister endnu.</div>";
    return;
  }
  hostPlaylists.innerHTML = rows
    .map(
      (row) => `
        <div class="playlist-item">
          <div class="playlist-name">${row.bar_name}</div>
          <div class="playlist-meta">${row.playlist_name || "Ingen playlist-navn"} · ${row.code}</div>
          <button class="btn ghost small" type="button" data-open="${row.code}">Åbn</button>
        </div>
      `
    )
    .join("");
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const playlistName = playlistInput.value.trim();
  const password = hostPasswordCreate.value.trim();
  const invalid = !password;
  setHelperMessage(createHelper, CREATE_HELPER_DEFAULT, invalid);
  if (invalid) return;

  if (!createBtn.dataset.label) {
    createBtn.dataset.label = createBtn.textContent;
  }
  setLoading(createBtn, true, "Opretter...");

  try {
    const result = await createBar({ playlistName, hostPassword: password });
    guestResultCode.textContent = result.guestCode;
    hostResultPassword.textContent = result.hostPassword;
    createSuccess.classList.remove("hidden");
    localStorage.setItem(hostPasswordKey(result.guestCode), result.hostPassword);
    renderMyPlaylists();
  } catch (error) {
    const message =
      error.message === "auth_required"
        ? "Du skal være logget ind for at oprette en playliste."
        : `Kunne ikke oprette playliste. ${error?.message || "Prøv igen."}`;
    setHelperMessage(createHelper, message.trim(), true);
  } finally {
    setLoading(createBtn, false, "Opretter...");
  }
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    tabs.forEach((t) => t.classList.toggle("active", t === tab));
    tabPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === target));
  });
});

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const target = button.dataset.copy;
    const value =
      target === "guest"
        ? guestResultCode.textContent
        : target === "host-password"
          ? hostResultPassword.textContent
          : "";
    if (!value || value === "-") return;
    try {
      await navigator.clipboard.writeText(value);
      button.dataset.label = button.dataset.label || button.textContent;
      button.textContent = "Kopieret!";
      setTimeout(() => {
        button.textContent = button.dataset.label;
      }, 1200);
    } catch {
      window.prompt("Kopiér koden:", value);
    }
  });
});

guestSuccessBack.addEventListener("click", () => navigateTo("/"));
hostSuccessBack.addEventListener("click", () => navigateTo("/"));
if (guestInlineClose) {
  guestInlineClose.addEventListener("click", () => {
    setGuestInlineVisible(false);
  });
}
if (hostInlineClose) {
  hostInlineClose.addEventListener("click", () => {
    setHostInlineVisible(false);
    setGuestInlineVisible(true);
  });
}

if (guestLoginBtn) {
  guestLoginBtn.addEventListener("click", () => openAuthModal("login"));
}
if (guestSignupBtn) {
  guestSignupBtn.addEventListener("click", () => openAuthModal("signup"));
}
if (closeAuth) {
  closeAuth.addEventListener("click", closeAuthModal);
}
if (authModal) {
  authModal.addEventListener("click", (event) => {
    if (event.target === authModal) closeAuthModal();
  });
}

async function signOut() {
  try {
    if (supabaseClient) {
      await supabaseClient.auth.signOut({ scope: "global" });
      await supabaseClient.auth.signOut({ scope: "local" });
    }
  } finally {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith("sb-"))
        .forEach((key) => localStorage.removeItem(key));
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith("sb-"))
        .forEach((key) => sessionStorage.removeItem(key));
    } catch {
      // ignore storage errors
    }
    updateUserStatus(null);
    const next = `${window.location.pathname}?logout=1`;
    window.location.assign(next);
  }
}

if (loginBtn) {
  loginBtn.addEventListener("click", () => openAuthModal("login"));
}

if (userAvatarBtn && userDropdown) {
  userAvatarBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    userDropdown.classList.toggle("is-hidden");
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (userAvatarBtn.contains(target) || userDropdown.contains(target)) return;
    userDropdown.classList.add("is-hidden");
  });
}

if (userDropdown) {
  userDropdown.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.getAttribute("data-action");
    if (!action) return;
    event.stopPropagation();
    event.preventDefault();
    if (action === "back-home") {
      window.location.assign("index.html");
      return;
    }
    if (action === "switch-bar") {
      const next = window.prompt("Indtast ny kode:");
      if (next) window.location.assign(`playlist.html?code=${encodeURIComponent(next.trim())}`);
      return;
    }
    if (action === "create-playlist") {
      showScreen("screen-home");
      setGuestInlineVisible(false);
      setHostInlineVisible(true);
      userDropdown.classList.add("is-hidden");
      renderMyPlaylists();
      return;
    }
    if (action === "profile") {
      window.location.assign("profile.html");
      return;
    }
    if (action === "rules") {
      window.alert("Regler kommer snart.");
      return;
    }
    if (action === "rename-bar") {
      if (!supabaseClient) return;
      supabaseClient.auth.getSession().then(({ data }) => {
        const user = data?.session?.user;
        if (!user) {
          window.alert("Log ind for at ændre bar-navn.");
          return;
        }
        const next = window.prompt("Nyt bar-navn:");
        if (!next) return;
        supabaseClient
          .from("playlists")
          .update({ bar_name: next })
          .eq("owner_id", user.id);
      });
      return;
    }
    if (action === "logout") {
      signOut();
    }
  });
}

if (supabaseClient) {
  completeOAuthRedirect().finally(() => {
    supabaseClient.auth.getSession().then(({ data }) => {
      updateUserStatus(data?.session?.user || null);
      renderMyPlaylists();
    });
  });
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateUserStatus(session?.user || null);
    renderMyPlaylists();
    if (session?.user) closeAuthModal();
  });
}

if (refreshPlaylists) {
  refreshPlaylists.addEventListener("click", () => {
    renderMyPlaylists();
  });
}

if (hostPlaylists) {
  hostPlaylists.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const code = target.getAttribute("data-open");
    if (code) window.location.assign(`playlist.html?code=${encodeURIComponent(code)}`);
  });
}

if (authPrimary) {
  authPrimary.addEventListener("click", async () => {
    if (!supabaseClient) {
      setHelperMessage(authHelper, "Auth ikke tilgængelig.", true);
      return;
    }
    const email = authEmail?.value.trim() || "";
    const password = authPassword?.value.trim() || "";
    if (!email || !password) {
      setHelperMessage(authHelper, "Udfyld email og password.", true);
      return;
    }
    setHelperMessage(authHelper, "", false);
    const mode = authPrimary.dataset.mode || "login";
    try {
      if (mode === "signup") {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        setHelperMessage(authHelper, "Tjek din mail for bekræftelse.", true);
        return;
      }
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeAuthModal();
    } catch (error) {
      setHelperMessage(authHelper, error.message || "Kunne ikke logge ind.", true);
    }
  });
}

authProviderButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (!supabaseClient) {
      setHelperMessage(authHelper, "Auth ikke tilgængelig.", true);
      return;
    }
    const provider = btn.getAttribute("data-provider");
    if (!provider) return;
    if (provider === "email") {
      const email = authEmail?.value.trim() || "";
      if (!email) {
        setHelperMessage(authHelper, "Indtast din email først.", true);
        return;
      }
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: authRedirectUrl() },
      });
      if (error) {
        setHelperMessage(authHelper, error.message || "Kunne ikke sende mail.", true);
        return;
      }
      setHelperMessage(authHelper, "Magic link sendt til din email.", true);
      return;
    }
    await supabaseClient.auth.signInWithOAuth({
      provider,
      options: { redirectTo: authRedirectUrl() },
    });
  });
});

window.addEventListener("popstate", handleRoute);

handleRoute();
