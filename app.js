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
const guestAuth = document.getElementById("guestAuth");
const guestFormHost = document.getElementById("guestFormHost");
const guestInputHost = document.getElementById("guestCodeHost");
const guestHelperHost = document.getElementById("guestHelperHost");
const guestSuggestions = document.getElementById("guestSuggestions");
const guestSuggestionsHost = document.getElementById("guestSuggestionsHost");
const hostInline = document.getElementById("hostInline");

const hostHelper = document.getElementById("hostHelper");
const hostPlaylists = document.getElementById("hostPlaylists");
const refreshPlaylists = document.getElementById("refreshPlaylists");
const hostCodeText = document.getElementById("hostCodeText");

const createForm = document.getElementById("createForm");
const playlistInput = document.getElementById("playlistName");
const playlistCodeInput = document.getElementById("playlistCode");
const hostPasswordCreate = document.getElementById("hostPasswordCreate");
const hostPasswordConfirm = document.getElementById("hostPasswordConfirm");
const createHelper = document.getElementById("createHelper");
const createBtn = document.getElementById("createBtn");
const createSuccess = document.getElementById("createSuccess");
const guestResultCode = document.getElementById("guestResultCode");
const hostResultPassword = document.getElementById("hostResultPassword");
const copyButtons = Array.from(document.querySelectorAll(".copy-btn"));

const guestSuccessBack = document.getElementById("guestSuccessBack");
const hostSuccessBack = document.getElementById("hostSuccessBack");
const OPEN_HOST_KEY = "tapster_open_host";
const NEXT_KEY = "tapster_next";
const POST_USERNAME_NEXT_KEY = "tapster_post_username_next";
const USERNAME_SETUP_PATH = "username.html";

const SUPABASE_URL = "https://xwafqfjhbiuogfjnlzln.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWZxZmpoYml1b2dmam5semxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODA3ODAsImV4cCI6MjA4NDc1Njc4MH0.H9a-BR3KdmlYbVAPHaDlNvpIsyzeKHAZzdZkGsKAqtU";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { detectSessionInUrl: true, persistSession: true, flowType: "pkce" },
    })
  : null;
const GUEST_HELPER_DEFAULT = "Code must be 6-8 characters.";
const HOST_HELPER_DEFAULT = "Log in to see your playlists.";
const CREATE_HELPER_DEFAULT = "Enter password to continue.";

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
const confirmModal = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmOk = document.getElementById("confirmOk");
const confirmCancel = document.getElementById("confirmCancel");
const closeConfirm = document.getElementById("closeConfirm");
let confirmResolver = null;
const infoModal = document.getElementById("infoModal");
const infoTitle = document.getElementById("infoTitle");
const infoMessage = document.getElementById("infoMessage");
const infoOk = document.getElementById("infoOk");
const closeInfo = document.getElementById("closeInfo");

function hostPasswordKey(code) {
  return `tapster_${code}_host_password`;
}

function normalizeCode(value) {
  return value.toUpperCase().replace(/\s+/g, "");
}

function isValidCode(value) {
  return value.length >= 6 && value.length <= 8;
}

const DJ_PASSWORD_HASH_PREFIX = "sha256$";

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashDjPassword(password) {
  const normalized = String(password || "").trim();
  if (!normalized) return "";
  if (!window.crypto?.subtle) throw new Error("crypto_unavailable");
  const encoded = new TextEncoder().encode(normalized);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return `${DJ_PASSWORD_HASH_PREFIX}${bytesToHex(new Uint8Array(digest))}`;
}

function toggleHelper(helperEl, show) {
  helperEl.classList.toggle("visible", show);
}

function setHelperMessage(helperEl, message, show) {
  if (!helperEl) return;
  helperEl.textContent = message;
  toggleHelper(helperEl, show);
}

async function fetchCodeSuggestions(prefix) {
  const query = normalizeCode(prefix);
  if (!query) return [];
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient
        .from("playlists")
        .select("code, playlist_name")
        .ilike("code", `${query}%`)
        .limit(5);
      if (Array.isArray(data) && data.length) return data;
    } catch {
      // Fall back to edge function when direct query is blocked by policies.
    }
  }
  try {
    const res = await fetch(`${FUNCTIONS_URL}/playlist-suggestions`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: query }),
    });
    if (!res.ok) return [];
    const payload = await res.json().catch(() => ({}));
    return Array.isArray(payload?.items) ? payload.items : [];
  } catch {
    return [];
  }
}

function renderSuggestions(listEl, items, onPick) {
  if (!listEl) return;
  if (!items.length) {
    listEl.innerHTML = "";
    return;
  }
  listEl.innerHTML = items
    .map(
      (item) => `
        <li data-code="${item.code}">
          <span class="code">${item.code}</span>
          <span class="name">${item.playlist_name || "Playlist"}</span>
        </li>
      `
    )
    .join("");
  listEl.querySelectorAll("li").forEach((row) => {
    row.addEventListener("click", () => {
      const code = row.dataset.code || "";
      onPick(code);
      listEl.innerHTML = "";
    });
  });
}

function attachCodeSuggestions(inputEl, listEl) {
  if (!inputEl || !listEl) return;
  let timer = null;
  inputEl.addEventListener("input", () => {
    const value = normalizeCode(inputEl.value);
    inputEl.value = value;
    clearTimeout(timer);
    if (!value) {
      listEl.innerHTML = "";
      return;
    }
    timer = setTimeout(async () => {
      const items = await fetchCodeSuggestions(value);
      renderSuggestions(listEl, items, (code) => {
        inputEl.value = code;
        window.location.assign(`playlist.html?code=${encodeURIComponent(code)}`);
      });
    }, 200);
  });
  inputEl.addEventListener("blur", () => {
    setTimeout(() => {
      listEl.innerHTML = "";
    }, 150);
  });
}

function authRedirectUrl() {
  const { origin, pathname } = window.location;
  if (pathname.includes("/TrackTap/")) {
    return `${origin}/TrackTap/`;
  }
  return `${origin}/`;
}

async function ensureProfile(user) {
  if (!supabaseClient || !user) return;
  try {
    const { data } = await supabaseClient
      .from("profiles")
      .select("display_name, credits")
      .eq("id", user.id)
      .maybeSingle();
    if (data) return data;
    await supabaseClient.from("profiles").insert({
      id: user.id,
      display_name: null,
      credits: 10,
      updated_at: new Date().toISOString(),
    });
    return { display_name: null, credits: 10 };
  } catch {
    // ignore profile init errors
    return null;
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

function redirectToUsernameSetup() {
  const pendingNext = sessionStorage.getItem(NEXT_KEY);
  const fallbackNext = pendingNext || `${window.location.pathname}${window.location.search}` || "index.html";
  sessionStorage.setItem(POST_USERNAME_NEXT_KEY, fallbackNext);
  if (pendingNext) sessionStorage.removeItem(NEXT_KEY);
  window.location.assign(USERNAME_SETUP_PATH);
}

async function syncSessionState(user, closeModalWhenLoggedIn) {
  updateUserStatus(user || null);
  if (!user) {
    renderMyPlaylists();
    return;
  }
  const profile = await ensureProfile(user);
  if (profile && requiresUsernameChoice(user, profile?.display_name)) {
    redirectToUsernameSetup();
    return;
  }
  renderMyPlaylists();
  if (closeModalWhenLoggedIn) closeAuthModal();
  const next = sessionStorage.getItem(NEXT_KEY);
  if (next) {
    sessionStorage.removeItem(NEXT_KEY);
    window.location.assign(next);
  }
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
  if (!isVisible) hostInline.classList.remove("expanded");
  document.body.classList.toggle("host-open", isVisible);
}

function openAuthModal(mode) {
  if (!authModal || !authTitle || !authPrimary) return;
  const isSignup = mode === "signup";
  authTitle.textContent = isSignup ? "Create account" : "Log in";
  authPrimary.textContent = isSignup ? "Create account" : "Log in";
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

function openConfirm(message, title = "Confirm") {
  if (!confirmModal || !confirmMessage || !confirmTitle) return Promise.resolve(false);
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function closeConfirmModal(result) {
  if (!confirmModal) return;
  confirmModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
}

function openInfo(message, title = "Message") {
  if (!infoModal || !infoMessage || !infoTitle) return;
  infoTitle.textContent = title;
  infoMessage.textContent = message;
  infoModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeInfoModal() {
  if (!infoModal) return;
  infoModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function updateUserStatus(user) {
  if (!loginBtn || !userMenu || !userAvatarBtn) return;
  if (!user) {
    loginBtn.classList.remove("is-hidden");
    userMenu.classList.add("is-hidden");
    if (guestInlineClose) guestInlineClose.classList.remove("is-hidden");
    if (guestAuth) guestAuth.classList.remove("is-hidden");
    return;
  }
  const name = user.user_metadata?.full_name || user.email || "User";
  const initial = (name.trim()[0] || "B").toUpperCase();
  userAvatarBtn.textContent = initial;
  loginBtn.classList.add("is-hidden");
  userMenu.classList.remove("is-hidden");
  if (guestInlineClose) guestInlineClose.classList.add("is-hidden");
  if (guestAuth) guestAuth.classList.add("is-hidden");
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
  const nextParam = params.get("next");

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

  if (sessionStorage.getItem(OPEN_HOST_KEY) === "true") {
    sessionStorage.removeItem(OPEN_HOST_KEY);
    setGuestInlineVisible(false);
    setHostInlineVisible(true);
  }

  if (loginParam === "1") {
    openAuthModal("login");
    params.delete("login");
    if (nextParam) {
      sessionStorage.setItem(NEXT_KEY, nextParam);
      params.delete("next");
    }
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

const SEED_COVER_URL = "assets/seed-superstition.svg";

async function fetchBarByCode(code) {
  if (!supabaseClient) return { data: null, error: new Error("Supabase not configured") };
  return supabaseClient.from("playlists").select("code").eq("code", code).maybeSingle();
}

async function fetchMyPlaylists() {
  if (!supabaseClient) return [];
  let { data } = await supabaseClient.auth.getSession();
  let user = data?.session?.user;
  if (!user) {
    try {
      const refreshed = await supabaseClient.auth.refreshSession();
      user = refreshed?.data?.session?.user || null;
      data = refreshed?.data || data;
    } catch {
      user = null;
    }
  }
  if (!user) return null;
  const { data: ownerRows } = await supabaseClient
    .from("playlists")
    .select("code, bar_name, playlist_name, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  return ownerRows || [];
}

async function joinAsGuest(code) {
  const { data, error } = await fetchBarByCode(code);
  if (error) throw error;
  if (!data) throw new Error("not_found");
  return data;
}

function goToPlaylist(code) {
  window.location.assign(`playlist.html?code=${encodeURIComponent(code)}`);
}

async function seedInitialRequest(code) {
  if (!supabaseClient) return;
  const row = {
    id: `seed-${code}`,
    room_id: code,
    track_title: "Green Onions",
    artist: "Booker T. & the M.G.'s",
    comment: "",
    status: "queued",
    created_at: new Date().toISOString(),
    upvotes: 0,
    downvotes: 0,
    dj_pinned: false,
    paid_boosts: 0,
    cover: SEED_COVER_URL,
  };
  await supabaseClient.from("requests").upsert(row, { onConflict: "id" });
}

async function createBar({ playlistName, hostPassword, desiredCode }) {
  if (!supabaseClient) throw new Error("Supabase not configured");
  const { data } = await supabaseClient.auth.getSession();
  const user = data?.session?.user;
  if (!user) throw new Error("auth_required");
  const hostPasswordHash = await hashDjPassword(hostPassword);
  const barName = user.user_metadata?.full_name || user.email || "Min bar";
  const trimmedPlaylist = playlistName || null;
  if (desiredCode) {
    const { error } = await supabaseClient.from("playlists").insert({
      code: desiredCode,
      bar_name: barName,
      playlist_name: trimmedPlaylist,
      host_password: hostPasswordHash,
      owner_id: user.id,
    });
    if (!error) {
      await seedInitialRequest(desiredCode);
      return { guestCode: desiredCode, hostCode: desiredCode, hostPassword, hostPasswordHash };
    }
    if (error.code === "23505") throw new Error("code_exists");
    throw error;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sharedCode = generateCode(6);
    const { error } = await supabaseClient.from("playlists").insert({
      code: sharedCode,
      bar_name: barName,
      playlist_name: trimmedPlaylist,
      host_password: hostPasswordHash,
      owner_id: user.id,
    });
    if (!error) {
      await seedInitialRequest(sharedCode);
      return {
        guestCode: sharedCode,
        hostCode: sharedCode,
        hostPassword,
        hostPasswordHash,
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
  goToPlaylist(code);
});

if (guestInputHost) {
  guestInputHost.addEventListener("input", () => {
    const normalized = normalizeCode(guestInputHost.value).slice(0, 8);
    guestInputHost.value = normalized;
    setHelperMessage(
      guestHelperHost,
      GUEST_HELPER_DEFAULT,
      normalized.length > 0 && !isValidCode(normalized)
    );
  });
}

if (guestFormHost) {
  guestFormHost.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = normalizeCode(guestInputHost.value).slice(0, 8);
    const invalid = !isValidCode(code);
    setHelperMessage(guestHelperHost, GUEST_HELPER_DEFAULT, invalid);
    if (invalid) return;
    goToPlaylist(code);
  });
}

function validateHostPasswords() {
  const password = hostPasswordCreate.value.trim();
  const confirm = hostPasswordConfirm ? hostPasswordConfirm.value.trim() : "";
  const mismatch = !!confirm && password !== confirm;
  setHelperMessage(createHelper, mismatch ? "DJ passwords do not match." : CREATE_HELPER_DEFAULT, mismatch);
}

hostPasswordCreate.addEventListener("input", () => {
  setHelperMessage(createHelper, CREATE_HELPER_DEFAULT, !hostPasswordCreate.value.trim());
  validateHostPasswords();
});

if (hostPasswordConfirm) {
  hostPasswordConfirm.addEventListener("input", () => {
    validateHostPasswords();
  });
}

if (playlistCodeInput) {
  playlistCodeInput.addEventListener("input", () => {
    const normalized = normalizeCode(playlistCodeInput.value).slice(0, 8);
    playlistCodeInput.value = normalized;
  });
}

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
    hostPlaylists.innerHTML = "<div class=\"playlist-meta\">No playlists yet.</div>";
    return;
  }
  hostPlaylists.innerHTML = rows
    .map(
      (row) => `
        <div class="playlist-item clickable" data-code="${row.code}" data-name="${row.playlist_name || "Untitled"}">
          <a class="playlist-link" href="playlist.html?code=${encodeURIComponent(row.code)}">
            <div class="playlist-name">${row.playlist_name || "Untitled"}</div>
            <div class="playlist-meta">${row.code}</div>
          </a>
          <button class="btn ghost small playlist-delete" type="button">Delete</button>
        </div>
      `
    )
    .join("");
}

async function deletePlaylist(code, name) {
  if (!supabaseClient) return;
  const confirmed = await openConfirm(`Are you sure you want to delete ${name}?`);
  if (!confirmed) return;
  const { error } = await supabaseClient.from("playlists").delete().eq("code", code);
  if (error) {
    openInfo("Could not delete playlist. Try again.");
    return;
  }
  renderMyPlaylists();
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const playlistName = playlistInput.value.trim();
  const desiredCodeRaw = playlistCodeInput ? playlistCodeInput.value.trim() : "";
  const desiredCode = desiredCodeRaw ? normalizeCode(desiredCodeRaw).slice(0, 8) : "";
  const password = hostPasswordCreate.value.trim();
  const confirm = hostPasswordConfirm ? hostPasswordConfirm.value.trim() : "";
  const codeInvalid =
    desiredCode &&
    (desiredCode.length < 6 || desiredCode.length > 8 || !/^[A-Z0-9]+$/.test(desiredCode));
  if (!password || !confirm) {
    setHelperMessage(createHelper, "Enter and repeat DJ password.", true);
    return;
  }
  if (password !== confirm) {
    setHelperMessage(createHelper, "DJ passwords do not match.", true);
    if (hostPasswordConfirm) hostPasswordConfirm.focus();
    return;
  }
  if (codeInvalid) {
    setHelperMessage(createHelper, "Code must be 6-8 uppercase letters or numbers.", true);
    if (playlistCodeInput) playlistCodeInput.focus();
    return;
  }
  setHelperMessage(createHelper, CREATE_HELPER_DEFAULT, false);

  if (!createBtn.dataset.label) {
    createBtn.dataset.label = createBtn.textContent;
  }
  setLoading(createBtn, true, "Creating...");

  try {
    const result = await createBar({ playlistName, hostPassword: password, desiredCode });
    guestResultCode.textContent = result.guestCode;
    hostResultPassword.textContent = result.hostPassword;
    createForm.reset();
    if (result.hostPasswordHash) {
      localStorage.setItem(hostPasswordKey(result.guestCode), result.hostPasswordHash);
    }
    renderMyPlaylists();
    window.location.assign(`playlist.html?code=${encodeURIComponent(result.guestCode)}`);
  } catch (error) {
    const message =
      error.message === "auth_required"
        ? "You must be logged in to create a playlist."
        : error.message === "code_exists"
          ? "Code already exists. Choose another."
          : error.message === "crypto_unavailable"
            ? "This device cannot create secure DJ passwords. Try a newer browser."
          : `Could not create playlist. ${error?.message || "Try again."}`;
    setHelperMessage(createHelper, message.trim(), true);
    openInfo(message.trim());
  } finally {
    setLoading(createBtn, false, "Creating...");
  }
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    tabs.forEach((t) => t.classList.toggle("active", t === tab));
    tabPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === target));
    if (target === "host-create") {
      createForm.reset();
      setHelperMessage(createHelper, CREATE_HELPER_DEFAULT, false);
      if (createSuccess) createSuccess.classList.add("hidden");
      if (hostInline) hostInline.classList.remove("expanded");
    }
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
      button.textContent = "Copied!";
      setTimeout(() => {
        button.textContent = button.dataset.label;
      }, 1200);
    } catch {
      window.prompt("Copy code:", value);
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

if (hostPlaylists) {
  hostPlaylists.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const deleteBtn = target.closest(".playlist-delete");
    if (!deleteBtn) return;
    const item = target.closest(".playlist-item");
    if (!item) return;
    const code = item.getAttribute("data-code");
    const name = item.getAttribute("data-name") || "playlist";
    if (!code) return;
    event.preventDefault();
    deletePlaylist(code, name);
  });
}

attachCodeSuggestions(guestInput, guestSuggestions);
attachCodeSuggestions(guestInputHost, guestSuggestionsHost);

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

if (confirmOk) confirmOk.addEventListener("click", () => closeConfirmModal(true));
if (confirmCancel) confirmCancel.addEventListener("click", () => closeConfirmModal(false));
if (closeConfirm) closeConfirm.addEventListener("click", () => closeConfirmModal(false));
if (confirmModal) {
  confirmModal.addEventListener("click", (event) => {
    if (event.target === confirmModal) closeConfirmModal(false);
  });
}

if (infoOk) infoOk.addEventListener("click", closeInfoModal);
if (closeInfo) closeInfo.addEventListener("click", closeInfoModal);
if (infoModal) {
  infoModal.addEventListener("click", (event) => {
    if (event.target === infoModal) closeInfoModal();
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
    if (action === "create-playlist") {
      showScreen("screen-home");
      setGuestInlineVisible(false);
      setHostInlineVisible(true);
      userDropdown.classList.add("is-hidden");
      renderMyPlaylists();
      return;
    }
    if (action === "profile") {
      sessionStorage.setItem("tapster_prev", window.location.href);
      window.location.assign("profile.html");
      return;
    }
    if (action === "scoreboard") {
      sessionStorage.setItem("tapster_prev", window.location.href);
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

if (supabaseClient) {
  completeOAuthRedirect().finally(async () => {
    const { data } = await supabaseClient.auth.getSession();
    await syncSessionState(data?.session?.user || null, false);
  });
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    await syncSessionState(session?.user || null, true);
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
      setHelperMessage(authHelper, "Auth not available.", true);
      return;
    }
    const email = authEmail?.value.trim() || "";
    const password = authPassword?.value.trim() || "";
    if (!email || !password) {
      setHelperMessage(authHelper, "Fill in email and password.", true);
      return;
    }
    setHelperMessage(authHelper, "", false);
    const mode = authPrimary.dataset.mode || "login";
    try {
      if (mode === "signup") {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        setHelperMessage(authHelper, "Check your email for confirmation.", true);
        return;
      }
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeAuthModal();
    } catch (error) {
      setHelperMessage(authHelper, error.message || "Could not log in.", true);
    }
  });
}

authProviderButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (!supabaseClient) {
      setHelperMessage(authHelper, "Auth not available.", true);
      return;
    }
    const provider = btn.getAttribute("data-provider");
    if (!provider) return;
    setHelperMessage(authHelper, "", false);
    try {
      if (provider === "email") {
        const email = authEmail?.value.trim() || "";
        if (!email) {
          setHelperMessage(authHelper, "Enter your email first.", true);
          return;
        }
        const { error } = await supabaseClient.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: authRedirectUrl() },
        });
        if (error) {
          setHelperMessage(authHelper, error.message || "Could not send email.", true);
          return;
        }
        setHelperMessage(authHelper, "Magic link sent to your email.", true);
        return;
      }

      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: { redirectTo: authRedirectUrl() },
      });
      if (error) {
        const msg = error.message || "Could not start OAuth login.";
        const help = /provider|supported|enabled|configured/i.test(msg)
          ? `${msg} Enable this provider in Supabase Authentication settings.`
          : msg;
        setHelperMessage(authHelper, help, true);
      }
    } catch (error) {
      setHelperMessage(authHelper, error?.message || "Could not start OAuth login.", true);
    }
  });
});

window.addEventListener("popstate", handleRoute);

handleRoute();
