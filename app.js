const screens = Array.from(document.querySelectorAll(".screen"));
const tabs = Array.from(document.querySelectorAll(".tab"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

const guestForm = document.getElementById("guestForm");
const guestInput = document.getElementById("guestCode");
const guestHelper = document.getElementById("guestHelper");
const guestCodeText = document.getElementById("guestCodeText");
const guestInline = document.getElementById("guestInline");
const guestInlineClose = document.getElementById("guestInlineClose");
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

const HOST_PASSWORD_KEY = "tapster_host_password";

function normalizeCode(value) {
  return value.toUpperCase().replace(/\s+/g, "");
}

function isValidCode(value) {
  return value.length >= 6 && value.length <= 8;
}

function toggleHelper(helperEl, show) {
  helperEl.classList.toggle("visible", show);
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

function joinAsGuest(code) {
  return Promise.resolve(code);
}

function loginAsHost(code, password) {
  return Promise.resolve({ code, password });
}

function createBar({ barName, playlistName, hostPassword }) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const sharedCode = generateCode(6);
      resolve({
        barName,
        playlistName,
        guestCode: sharedCode,
        hostCode: sharedCode,
        hostPassword,
      });
    }, 500);
  });
}

guestInput.addEventListener("input", () => {
  const normalized = normalizeCode(guestInput.value).slice(0, 8);
  guestInput.value = normalized;
  toggleHelper(guestHelper, normalized.length > 0 && !isValidCode(normalized));
});

hostInput.addEventListener("input", () => {
  const normalized = normalizeCode(hostInput.value).slice(0, 8);
  hostInput.value = normalized;
  toggleHelper(hostHelper, normalized.length > 0 && !isValidCode(normalized));
});

guestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = normalizeCode(guestInput.value).slice(0, 8);
  const invalid = !isValidCode(code);
  toggleHelper(guestHelper, invalid);
  if (invalid) return;
  await joinAsGuest(code);
  navigateTo(`/guest?code=${encodeURIComponent(code)}`);
});

hostLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = normalizeCode(hostInput.value).slice(0, 8);
  const password = hostPasswordInput.value.trim();
  const invalid = !isValidCode(code);
  toggleHelper(hostHelper, invalid);
  if (invalid) return;
  if (password) {
    localStorage.setItem(HOST_PASSWORD_KEY, password);
  }
  await loginAsHost(code, password);
  navigateTo(`/host?code=${encodeURIComponent(code)}`);
});

barNameInput.addEventListener("input", () => {
  toggleHelper(createHelper, !barNameInput.value.trim());
});

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const barName = barNameInput.value.trim();
  const playlistName = playlistInput.value.trim();
  const password = hostPasswordCreate.value.trim();
  const invalid = !barName || !password;
  toggleHelper(createHelper, invalid);
  if (invalid) return;

  if (!createBtn.dataset.label) {
    createBtn.dataset.label = createBtn.textContent;
  }
  setLoading(createBtn, true, "Opretter...");

  const result = await createBar({ barName, playlistName, hostPassword: password });
  guestResultCode.textContent = result.guestCode;
  hostResultPassword.textContent = result.hostPassword;
  createSuccess.classList.remove("hidden");
  localStorage.setItem(HOST_PASSWORD_KEY, result.hostPassword);

  setLoading(createBtn, false, "Opretter...");
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

window.addEventListener("popstate", handleRoute);

handleRoute();
