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

function updateUserMenu(user) {
  if (!menuBtnRules || !userAvatarBtnRules) return;
  if (user) {
    const name = user.user_metadata?.full_name || user.email || "User";
    userAvatarBtnRules.textContent = (name.trim()[0] || "B").toUpperCase();
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
  const { data } = await supabaseClient.auth.getSession();
  const user = data?.session?.user || null;
  updateUserMenu(user);
  if (!user) {
    window.location.assign("index.html?login=1");
  }
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateUserMenu(session?.user || null);
    if (!session?.user) {
      window.location.assign("index.html?login=1");
    }
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
