const SUPABASE_URL = "https://xwafqfjhbiuogfjnlzln.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWZxZmpoYml1b2dmam5semxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODA3ODAsImV4cCI6MjA4NDc1Njc4MH0.H9a-BR3KdmlYbVAPHaDlNvpIsyzeKHAZzdZkGsKAqtU";

const NEXT_KEY = "tapster_next";
const POST_USERNAME_NEXT_KEY = "tapster_post_username_next";

const usernameForm = document.getElementById("usernameForm");
const usernameInput = document.getElementById("usernameInput");
const usernameHelper = document.getElementById("usernameHelper");
const usernameSave = document.getElementById("usernameSave");
const usernameLogout = document.getElementById("usernameLogout");

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { detectSessionInUrl: true, persistSession: true, flowType: "pkce" },
    })
  : null;

let currentUser = null;
let profileExists = false;

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

function setHelper(text, isError = false) {
  if (!usernameHelper) return;
  usernameHelper.textContent = text;
  usernameHelper.classList.add("visible");
  usernameHelper.classList.toggle("is-error", isError);
}

function consumeNextDestination() {
  const params = new URLSearchParams(window.location.search);
  const queryNext = params.get("next");
  const fromStorage = sessionStorage.getItem(POST_USERNAME_NEXT_KEY) || sessionStorage.getItem(NEXT_KEY) || queryNext;
  sessionStorage.removeItem(POST_USERNAME_NEXT_KEY);
  sessionStorage.removeItem(NEXT_KEY);
  const next = fromStorage || "index.html";
  if (String(next).includes("username.html")) return "index.html";
  return next;
}

const nextDestination = consumeNextDestination();

function validateUsername(value) {
  const trimmed = String(value || "").trim();
  if (trimmed.length < 2 || trimmed.length > 24) {
    return "Username must be 2-24 characters.";
  }
  if (/@/.test(trimmed)) {
    return "Username cannot be an email.";
  }
  return "";
}

function isUsernameTakenError(error) {
  if (!error) return false;
  const code = String(error.code || "").trim();
  const message = String(error.message || "").toLowerCase();
  const details = String(error.details || "").toLowerCase();
  if (code === "23505") return true;
  if (message.includes("duplicate key") || message.includes("unique")) return true;
  if (details.includes("profiles_display_name_unique_idx")) return true;
  return false;
}

async function loadUsernameState() {
  if (!supabaseClient) {
    setHelper("Auth not available.", true);
    if (usernameSave) usernameSave.disabled = true;
    return;
  }
  const { data } = await supabaseClient.auth.getSession();
  const user = data?.session?.user;
  if (!user) {
    window.location.assign("index.html?login=1");
    return;
  }
  currentUser = user;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  profileExists = !!profile;
  const existing = String(profile?.display_name || "").trim();
  if (!requiresUsernameChoice(user, existing)) {
    window.location.assign(nextDestination);
    return;
  }
  setHelper("Choose a username to continue.");
}

if (usernameForm) {
  usernameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseClient || !currentUser) {
      setHelper("Auth not available.", true);
      return;
    }

    const username = String(usernameInput?.value || "").trim();
    const validationError = validateUsername(username);
    if (validationError) {
      setHelper(validationError, true);
      usernameInput?.focus();
      return;
    }

    if (usernameSave && !usernameSave.dataset.label) usernameSave.dataset.label = usernameSave.textContent || "Save";
    if (usernameSave) {
      usernameSave.disabled = true;
      usernameSave.textContent = "Saving...";
    }
    setHelper("Saving username...");

    const payload = {
      display_name: username,
      updated_at: new Date().toISOString(),
    };

    let error = null;
    if (profileExists) {
      const result = await supabaseClient.from("profiles").update(payload).eq("id", currentUser.id);
      error = result.error || null;
    } else {
      const result = await supabaseClient.from("profiles").insert({
        id: currentUser.id,
        ...payload,
        credits: 10,
      });
      error = result.error || null;
    }

    if (!error) {
      // Keep auth metadata aligned with the chosen username for avatar initials.
      await supabaseClient.auth.updateUser({
        data: {
          ...(currentUser.user_metadata || {}),
          username_set: true,
          full_name: username,
        },
      });
      window.location.assign(nextDestination);
      return;
    }

    if (isUsernameTakenError(error)) {
      setHelper("Username is already taken. Choose another.", true);
    } else {
      setHelper(error.message || "Could not save username.", true);
    }
    if (usernameSave) {
      usernameSave.disabled = false;
      usernameSave.textContent = usernameSave.dataset.label || "Save username";
    }
  });
}

if (usernameLogout) {
  usernameLogout.addEventListener("click", async () => {
    if (!supabaseClient) return;
    try {
      await supabaseClient.auth.signOut({ scope: "global" });
      await supabaseClient.auth.signOut({ scope: "local" });
    } finally {
      window.location.assign("index.html");
    }
  });
}

loadUsernameState();
