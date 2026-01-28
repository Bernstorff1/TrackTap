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

const hostLoginForm = document.getElementById("hostLoginForm");
const hostInput = document.getElementById("hostCode");
const hostPasswordInput = document.getElementById("hostPassword");
const hostHelper = document.getElementById("hostHelper");
const hostCodeText = document.getElementById("hostCodeText");

const createForm = document.getElementById("createForm");
const barNameInput = document.getElementById("barName");
const playlistInput = document.getElementById("playlistName");
const hostPasswordCreate = document.getElementById("hostPasswordCreate");
const createHelper = document.getElementById("createHelper");
const createBtn = document.getElementById("createBtn");
const createSuccess = document.getElementById("createSuccess");
const guestResultCode = document.getElementById("guestResultCode");
const hostResultPassword = document.getElementById("hostResultPassword");
const copyButtons = Array.from(document.querySelectorAll(".copy-btn"));

const goGuest = document.getElementById("goGuest");
const goHost = document.getElementById("goHost");
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
const HOST_HELPER_DEFAULT = "Koden skal være 6–8 tegn.";
const CREATE_HELPER_DEFAULT = "Udfyld bar-navn og password for at fortsætte.";

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
const signOutBtn = document.getElementById("signOutBtn");

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
      setGuestInlineVisible(false);
      setHostInlineVisible(true);
    }
    return;
  }

  showScreen("screen-home");
  setGuestInlineVisible(false);
  setHostInlineVisible(false);
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
  return supabaseClient.from("bars").select("*").eq("code", code).maybeSingle();
}

async function joinAsGuest(code) {
  const { data, error } = await fetchBarByCode(code);
  if (error) throw error;
  if (!data) throw new Error("not_found");
  return data;
}

async function loginAsHost(code, password) {
  const { data, error } = await fetchBarByCode(code);
  if (error) throw error;
  if (!data) throw new Error("not_found");
  if (password !== data.host_password) throw new Error("wrong_password");
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

async function createBar({ barName, playlistName, hostPassword }) {
  if (!supabaseClient) throw new Error("Supabase not configured");
  const trimmedPlaylist = playlistName || null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sharedCode = generateCode(6);
    const { error } = await supabaseClient.from("bars").insert({
      code: sharedCode,
      bar_name: barName,
      playlist_name: trimmedPlaylist,
      host_password: hostPassword,
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

hostInput.addEventListener("input", () => {
  const normalized = normalizeCode(hostInput.value).slice(0, 8);
  hostInput.value = normalized;
  setHelperMessage(hostHelper, HOST_HELPER_DEFAULT, normalized.length > 0 && !isValidCode(normalized));
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

hostLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = normalizeCode(hostInput.value).slice(0, 8);
  const password = hostPasswordInput.value.trim();
  const invalid = !isValidCode(code);
  setHelperMessage(hostHelper, HOST_HELPER_DEFAULT, invalid);
  if (invalid) return;
  try {
    if (password) {
      localStorage.setItem(hostPasswordKey(code), password);
    }
    await loginAsHost(code, password);
    window.location.assign(`playlist.html?code=${encodeURIComponent(code)}`);
  } catch (error) {
    let message = "Kunne ikke logge ind.";
    if (error.message === "not_found") message = "Koden findes ikke.";
    if (error.message === "wrong_password") message = "Forkert password.";
    setHelperMessage(hostHelper, message, true);
  }
});

barNameInput.addEventListener("input", () => {
  setHelperMessage(createHelper, CREATE_HELPER_DEFAULT, !barNameInput.value.trim());
});

hostPasswordCreate.addEventListener("input", () => {
  setHelperMessage(
    createHelper,
    CREATE_HELPER_DEFAULT,
    !barNameInput.value.trim() || !hostPasswordCreate.value.trim()
  );
});

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const barName = barNameInput.value.trim();
  const playlistName = playlistInput.value.trim();
  const password = hostPasswordCreate.value.trim();
  const invalid = !barName || !password;
  setHelperMessage(createHelper, CREATE_HELPER_DEFAULT, invalid);
  if (invalid) return;

  if (!createBtn.dataset.label) {
    createBtn.dataset.label = createBtn.textContent;
  }
  setLoading(createBtn, true, "Opretter...");

  try {
    const result = await createBar({ barName, playlistName, hostPassword: password });
    guestResultCode.textContent = result.guestCode;
    hostResultPassword.textContent = result.hostPassword;
    createSuccess.classList.remove("hidden");
    localStorage.setItem(hostPasswordKey(result.guestCode), result.hostPassword);
  } catch (error) {
    setHelperMessage(createHelper, "Kunne ikke oprette baren. Prøv igen.", true);
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

goGuest.addEventListener("click", () => {
  showScreen("screen-home");
  setGuestInlineVisible(true);
  setHostInlineVisible(false);
});
goHost.addEventListener("click", () => {
  showScreen("screen-home");
  setGuestInlineVisible(false);
  setHostInlineVisible(true);
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

if (signOutBtn) {
  signOutBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!supabaseClient) return;
    try {
      await supabaseClient.auth.signOut();
    } finally {
      updateUserStatus(null);
      if (userDropdown) userDropdown.classList.add("is-hidden");
    }
  });
}

if (loginBtn) {
  loginBtn.addEventListener("click", () => openAuthModal("login"));
}

if (userAvatarBtn && userDropdown) {
  userAvatarBtn.addEventListener("click", () => {
    userDropdown.classList.toggle("is-hidden");
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (userAvatarBtn.contains(target) || userDropdown.contains(target)) return;
    userDropdown.classList.add("is-hidden");
  });
}

if (supabaseClient) {
  completeOAuthRedirect().finally(() => {
    supabaseClient.auth.getSession().then(({ data }) => {
      updateUserStatus(data?.session?.user || null);
    });
  });
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateUserStatus(session?.user || null);
    if (session?.user) closeAuthModal();
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
