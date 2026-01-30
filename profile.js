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

function sumCreditsFromStorage() {
  let total = 0;
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("tapster_") && key.endsWith("_credits")) {
        total += Number(localStorage.getItem(key) || 0);
      }
    });
  } catch {
    return 0;
  }
  return total;
}

async function loadProfile() {
  if (!supabaseClient) return;
  const { data } = await supabaseClient.auth.getSession();
  const user = data?.session?.user;
  if (!user) {
    profileName.textContent = "Log ind for at se din profil.";
    profilePlaylists.innerHTML = "<div class=\"playlist-meta\">Ingen data.</div>";
    creditsTotal.textContent = "0";
    return;
  }
  const name = user.user_metadata?.full_name || user.email || "Bruger";
  profileName.textContent = name;
  creditsTotal.textContent = String(sumCreditsFromStorage());

  const { data: rows } = await supabaseClient
    .from("playlists")
    .select("code, bar_name, playlist_name, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (!rows || !rows.length) {
    profilePlaylists.innerHTML = "<div class=\"playlist-meta\">Ingen playlister endnu.</div>";
    return;
  }

  profilePlaylists.innerHTML = rows
    .map((row) => {
      const title = row.playlist_name || "Uden navn";
      return `
        <a class="playlist-item clickable" href="playlist.html?code=${encodeURIComponent(row.code)}">
          <div class="playlist-name">${title}</div>
          <div class="playlist-meta">${row.code}</div>
        </a>
      `;
    })
    .join("");
}

loadProfile();
