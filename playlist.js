const queuedList = document.getElementById("queuedList");
const playedList = document.getElementById("playedList");
const playedActions = document.getElementById("playedActions");
const queuedCount = document.getElementById("queuedCount");
const playedCount = document.getElementById("playedCount");
const tabs = document.querySelectorAll(".tab");
const djToggle = document.getElementById("djMode");
const modal = document.getElementById("modal");
const addBtn = document.getElementById("addBtn");
const closeModal = document.getElementById("closeModal");
const cancelBtn = document.getElementById("cancelBtn");

const SUPABASE_URL = "https://xwafqfjhbiuogfjnlzln.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3YWZxZmpoYml1b2dmam5semxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODA3ODAsImV4cCI6MjA4NDc1Njc4MH0.H9a-BR3KdmlYbVAPHaDlNvpIsyzeKHAZzdZkGsKAqtU";
const FUNCTIONS_URL = "https://xwafqfjhbiuogfjnlzln.functions.supabase.co";
const params = new URLSearchParams(window.location.search);
const ROOM_ID = (params.get("code") || "").trim().toUpperCase();
let supabaseClient;
let useRemote = true;
let remotePoll;
const requestForm = document.getElementById("requestForm");
const requestHelper = document.getElementById("requestHelper");
const searchResults = document.getElementById("searchResults");
const brandNameText = document.getElementById("brandNameText");
const brandNameInput = document.getElementById("brandNameInput");
const roleToggle = document.querySelector(".role-toggle");
const brandMark = document.getElementById("brandMark");
const roomNameEl = document.getElementById("roomName");
const creditCount = document.getElementById("creditCount");
const payButtons = document.querySelectorAll(".pay-btn");
const amountRange = document.getElementById("amountRange");
const amountValue = document.getElementById("amountValue");
const paymentPanel = document.getElementById("paymentPanel");
const paymentToggle = document.getElementById("paymentToggle");
const easterEggBtn = document.getElementById("easterEggBtn");
const easterEgg = document.getElementById("easterEgg");
const djModal = document.getElementById("djModal");
const djForm = document.getElementById("djForm");
const djPinInput = document.getElementById("djPin");
const djError = document.getElementById("djError");
const closeDjModal = document.getElementById("closeDjModal");
const cancelDj = document.getElementById("cancelDj");
const menuBtn = document.getElementById("menuBtn");
const loginBtn = document.getElementById("loginBtn");
const profileBtn = document.getElementById("profileBtn");
const menuPanel = document.getElementById("menuPanel");
const djMenuBtn = document.getElementById("djMenuBtn");
const djMenuPanel = document.getElementById("djMenuPanel");
const qrBtnPublic = document.getElementById("qrBtnPublic");
const qrModal = document.getElementById("qrModal");
const closeQr = document.getElementById("closeQr");
const qrImage = document.getElementById("qrImage");
const qrLink = document.getElementById("qrLink");
const qrPlaylistName = document.getElementById("qrPlaylistName");
const infoModal = document.getElementById("infoModal");
const infoTitle = document.getElementById("infoTitle");
const infoMessage = document.getElementById("infoMessage");
const closeInfo = document.getElementById("closeInfo");
const infoOk = document.getElementById("infoOk");
const spotifyPlaylistBtn = document.querySelector(".spotify-btn");
const spotifyConnectBtn = document.getElementById("spotifyConnectBtn");
const boostersVisibility = document.getElementById("boostersVisibility");
const boostersToggle = document.getElementById("boostersToggle");

const userVotes = new Map();
let isDj = false;
let searchTimer;
let selectedTrack = null;
let searchNonce = 0;
let voteCredits = 0;
let selectedAmount = 10;
let barHostPassword = "";
let currentUser = null;
let isSpotifyConnected = false;
const DJ_BASE_SCORE = 10000;
const SEED_COVER_URL = "assets/seed-superstition.svg";
const requesterNames = new Map();

const defaultRequests = [
  {
    id: "seed-superstition",
    title: "Superstition",
    artist: "Stevie Wonder",
    comment: "",
    upvotes: 0,
    downvotes: 0,
    createdAt: Date.now(),
    status: "queued",
    cover: SEED_COVER_URL,
  },
];

const STORAGE_PREFIX = ROOM_ID ? `tapster_${ROOM_ID}_` : "tapster_";
const HOST_PASSWORD_KEY = `${STORAGE_PREFIX}host_password`;
const DJ_AUTH_KEY = `${STORAGE_PREFIX}dj_auth`;
const BOOSTERS_VIS_KEY = `${STORAGE_PREFIX}boosters_visible`;

if (!ROOM_ID) {
  window.location.assign("index.html");
}
if (roomNameEl && ROOM_ID) {
  roomNameEl.textContent = ROOM_ID;
}

let requests = [];




function loadCredits() {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}credits`);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

async function syncCreditsToProfile() {
  if (!supabaseClient || !currentUser) return;
  try {
    await supabaseClient.from("profiles").upsert({
      id: currentUser.id,
      credits: voteCredits,
      display_name: currentUser.user_metadata?.full_name || currentUser.email || "Bruger",
      updated_at: new Date().toISOString(),
    });
  } catch {
    // ignore profile sync errors
  }
}

function persistCredits() {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}credits`, String(voteCredits));
  } catch {
    // ignore storage errors
  }
  syncCreditsToProfile();
}

function updateCreditsDisplay() {
  if (creditCount) creditCount.textContent = String(voteCredits);
}

function loadVotes() {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}votes`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistVotes() {
  try {
    const obj = Object.fromEntries(userVotes.entries());
    localStorage.setItem(`${STORAGE_PREFIX}votes`, JSON.stringify(obj));
  } catch {
    // ignore storage errors
  }
}

function loadRequests() {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}requests`);
    if (!raw) return [...defaultRequests];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...defaultRequests];
  } catch {
    return [...defaultRequests];
  }
}

function persistRequests() {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}requests`, JSON.stringify(requests));
  } catch {
    // ignore storage errors
  }
}



function mapBarRow(row) {
  return {
    code: row.code,
    barName: row.bar_name || "Tapster",
    playlistName: row.playlist_name || "",
    displayName: row.playlist_name || row.bar_name || "Tapster",
    hostPassword: row.host_password || "",
  };
}

async function fetchBarRemote() {
  if (!useRemote || !supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from("playlists")
    .select("*")
    .eq("code", ROOM_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    window.location.assign("index.html");
    return null;
  }
  const bar = mapBarRow(data);
  setBrandName(bar.displayName);
  updateRoomChip(bar);
  barHostPassword = bar.hostPassword || "";
  if (barHostPassword) {
    localStorage.setItem(HOST_PASSWORD_KEY, barHostPassword);
  }
  return bar;
}

async function syncBrandName(name) {
  if (!useRemote || !supabaseClient) return;
  const { error } = await supabaseClient
    .from("playlists")
    .update({ playlist_name: name })
    .eq("code", ROOM_ID);
  if (error) {
    useRemote = false;
  }
}

function applyBarChange(payload) {
  if (!payload.new) return;
  if (payload.new.code !== ROOM_ID) return;
  const bar = mapBarRow(payload.new);
  setBrandName(bar.displayName);
  updateRoomChip(bar);
  barHostPassword = bar.hostPassword || barHostPassword;
}

async function subscribeBar() {
  const channel = supabaseClient
    .channel(`playlists-${ROOM_ID}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "playlists", filter: `code=eq.${ROOM_ID}` },
      applyBarChange
    );
  await channel.subscribe();
}

function mapRowToRequest(row) {
  const seedCover =
    !row.cover && row.track_title === "Superstition" && row.artist === "Stevie Wonder"
      ? SEED_COVER_URL
      : row.cover || "";
  return {
    id: row.id,
    requesterId: row.requester_id || "",
    title: row.track_title || "",
    artist: row.artist || "",
    comment: row.comment || "",
    status: row.status || "queued",
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    playedAt: row.played_at ? new Date(row.played_at).getTime() : null,
    upvotes: row.upvotes ?? 0,
    downvotes: row.downvotes ?? 0,
    djPinned: !!row.dj_pinned,
    paidBoostsUp: row.paid_boosts_up ?? row.paid_boosts ?? 0,
    paidBoostsDown: row.paid_boosts_down ?? 0,
    cover: seedCover,
    spotifyWebUrl: row.spotify_web_url || "",
    spotifyAppUrl: row.spotify_app_url || "",
  };
}

function mapRequestToRow(item) {
  return {
    id: item.id,
    room_id: ROOM_ID,
    requester_id: item.requesterId || null,
    track_title: item.title,
    artist: item.artist,
    comment: item.comment,
    status: item.status,
    created_at: new Date(item.createdAt).toISOString(),
    played_at: item.playedAt ? new Date(item.playedAt).toISOString() : null,
    upvotes: Number.isFinite(item.upvotes) ? item.upvotes : 0,
    downvotes: item.downvotes,
    dj_pinned: !!item.djPinned,
    paid_boosts: (item.paidBoostsUp || 0) + (item.paidBoostsDown || 0),
    paid_boosts_up: item.paidBoostsUp || 0,
    paid_boosts_down: item.paidBoostsDown || 0,
    cover: item.cover || "",
    spotify_web_url: item.spotifyWebUrl || "",
    spotify_app_url: item.spotifyAppUrl || "",
  };
}

async function seedInitialRequestRemote() {
  if (!useRemote || !supabaseClient) return;
  const seed = { ...defaultRequests[0], id: `seed-${ROOM_ID}` };
  const row = mapRequestToRow(seed);
  await supabaseClient.from("requests").upsert(row, { onConflict: "id" });
}

async function fetchRequestsRemote() {
  if (!useRemote || !supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("requests")
    .select("*")
    .eq("room_id", ROOM_ID);
  if (error) throw error;
  if (!data || data.length === 0) {
    await seedInitialRequestRemote();
    requests = defaultRequests.map((item) => ({ ...item, id: `seed-${ROOM_ID}` }));
  } else {
    requests = data.map(mapRowToRequest);
  }
  await hydrateRequesters();
  ensureSpotifyLinks();
  renderLists();
}

function applyRealtimeChange(payload) {
  if (payload.eventType === "DELETE") {
    const id = payload.old.id;
    requests = requests.filter((r) => r.id !== id);
    renderLists();
    return;
  }
  const row = payload.new;
  if (row.room_id !== ROOM_ID) return;
  const next = mapRowToRequest(row);
  const idx = requests.findIndex((r) => r.id === next.id);
  if (idx >= 0) {
    requests[idx] = next;
  } else {
    requests.push(next);
  }
  if (next.requesterId && !requesterNames.has(next.requesterId)) {
    hydrateRequesters([next.requesterId]);
  }
  ensureSpotifyLinks();
  renderLists();
}

async function subscribeRequests() {
  const channel = supabaseClient
    .channel(`requests-${ROOM_ID}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "requests", filter: `room_id=eq.${ROOM_ID}` },
      applyRealtimeChange
    );
  await channel.subscribe();
}

async function syncRequest(item) {
  if (!useRemote) return;
  const row = mapRequestToRow(item);
  const { error } = await supabaseClient.from("requests").upsert(row, { onConflict: "id" });
  if (error) {
    useRemote = false;
  }
}

async function deleteRequestRemote(id) {
  if (!useRemote) return;
  const { error } = await supabaseClient.from("requests").delete().eq("id", id);
  if (error) {
    useRemote = false;
  }
}

async function initSupabase() {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await supabaseClient.auth.getSession();
    const user = data?.session?.user || null;
    updateProfileIcon(user);
    if (!user) {
      const next = encodeURIComponent(window.location.href);
      window.location.assign(`index.html?login=1&next=${next}`);
      return;
    }
    loadCreditsForUser(user);
    loadSpotifyStatus(user);
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      updateProfileIcon(session?.user || null);
      if (!session?.user) {
        const next = encodeURIComponent(window.location.href);
        window.location.assign(`index.html?login=1&next=${next}`);
        return;
      }
      loadCreditsForUser(session.user);
      loadSpotifyStatus(session.user);
    });
    await fetchRequestsRemote();
    await fetchBarRemote();
    await subscribeRequests();
    await subscribeBar();
    if (!remotePoll) {
      remotePoll = setInterval(fetchRequestsRemote, 60000);
    }
  } catch {
    useRemote = false;
    requests = loadRequests();
    ensureSpotifyLinks();
    renderLists();
  }
}

function ensureSpotifyLinks() {
  requests = requests.map((item) => {
    if (item.spotifyWebUrl && item.spotifyAppUrl) return item;
    const links = spotifySearchLinks({
      title: item.title || "",
      artist: item.artist || "",
      isrc: item.isrc || "",
    });
    return {
      ...item,
      spotifyWebUrl: item.spotifyWebUrl || links.web,
      spotifyAppUrl: item.spotifyAppUrl || links.app,
    };
  });
}

async function hydrateRequesters(ids) {
  if (!supabaseClient) return;
  const uniqueIds = ids
    ? Array.from(new Set(ids)).filter((id) => id && !requesterNames.has(id))
    : Array.from(new Set(requests.map((r) => r.requesterId).filter(Boolean))).filter(
        (id) => !requesterNames.has(id)
      );
  if (!uniqueIds.length) return;
  const { data } = await supabaseClient
    .from("profiles")
    .select("id, display_name")
    .in("id", uniqueIds);
  (data || []).forEach((row) => {
    requesterNames.set(row.id, row.display_name || "Bruger");
  });
}

async function loadCreditsForUser(user) {
  if (!supabaseClient || !user) return;
  try {
    const { data } = await supabaseClient
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .maybeSingle();
    if (!data) {
      voteCredits = 10;
      await syncCreditsToProfile();
      persistCredits();
      updateCreditsDisplay();
      return;
    }
    const remoteCredits = Number(data?.credits ?? 0);
    const localCredits = loadCredits();
    if (localCredits > remoteCredits) {
      voteCredits = localCredits;
      await syncCreditsToProfile();
    } else {
      voteCredits = remoteCredits;
      persistCredits();
    }
    updateCreditsDisplay();
  } catch {
    voteCredits = loadCredits();
    updateCreditsDisplay();
  }
}



function updateProfileIcon(user) {
  currentUser = user || null;
  if (!menuBtn || !profileBtn || !loginBtn) return;
  if (!user) {
    profileBtn.classList.add("is-hidden");
    loginBtn.classList.remove("is-hidden");
    menuBtn.classList.add("is-hidden");
    return;
  }
  const name = user.user_metadata?.full_name || user.email || "Bruger";
  profileBtn.textContent = (name.trim()[0] || "B").toUpperCase();
  profileBtn.classList.remove("is-hidden");
  loginBtn.classList.add("is-hidden");
  menuBtn.classList.add("is-hidden");
}

function updateSpotifyConnectButton() {
  if (!spotifyConnectBtn) return;
  spotifyConnectBtn.textContent = isSpotifyConnected ? "Spotify Connected" : "Connect til Spotify";
}

async function syncRoomSettings(partial) {
  if (!supabaseClient || !currentUser || !ROOM_ID) return;
  const payload = {
    room_id: ROOM_ID,
    owner_id: currentUser.id,
    updated_at: new Date().toISOString(),
    ...partial,
  };
  try {
    await supabaseClient.from("room_settings").upsert(payload, { onConflict: "room_id" });
  } catch {
    // ignore
  }
}

async function loadSpotifyStatus(user) {
  if (!supabaseClient || !user) {
    isSpotifyConnected = false;
    updateSpotifyConnectButton();
    return;
  }
  try {
    const { data } = await supabaseClient
      .from("spotify_tokens")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    isSpotifyConnected = !!data;
  } catch {
    isSpotifyConnected = false;
  }
  updateSpotifyConnectButton();
  await syncRoomSettings({ spotify_connected: isSpotifyConnected });
}

async function disconnectSpotify() {
  if (!supabaseClient || !currentUser) return;
  const { error } = await supabaseClient.from("spotify_tokens").delete().eq("user_id", currentUser.id);
  if (error) {
    showInfo("Kunne ikke afbryde Spotify. Prøv igen.");
    return;
  }
  isSpotifyConnected = false;
  updateSpotifyConnectButton();
  await syncRoomSettings({ spotify_connected: false });
}

function openDjModal() {
  djError.textContent = "Forkert password. Prøv igen.";
  djError.classList.add("is-hidden");
  djPinInput.value = "";
  djModal.classList.remove("hidden");
  djPinInput.focus();
}

function closeDjModalPanel() {
  djModal.classList.add("hidden");
}

function buildPlaylistUrl() {
  const origin = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "https://tapsterbox.dk"
    : window.location.origin;
  const url = new URL(window.location.href);
  url.searchParams.set("code", ROOM_ID || "");
  url.hash = "";
  return `${origin}${url.pathname}${url.search}`;
}

function openQrModal() {
  if (!qrModal || !qrImage || !qrLink) return;
  const url = buildPlaylistUrl();
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}`;
  qrImage.src = qrUrl;
  qrLink.textContent = url;
  if (qrPlaylistName) {
    qrPlaylistName.textContent = brandNameText?.textContent?.trim() || ROOM_ID || "Playliste";
  }
  qrModal.classList.remove("hidden");
}

function closeQrModal() {
  if (!qrModal) return;
  qrModal.classList.add("hidden");
}

function setDjMode(enabled) {
  isDj = enabled;
  djToggle.checked = enabled;
  if (djMenuBtn) djMenuBtn.classList.toggle("is-hidden", !enabled);
  if (roleToggle) roleToggle.classList.toggle("is-hidden", enabled);
  if (paymentToggle && paymentPanel) {
    paymentToggle.disabled = enabled;
    if (enabled) {
      paymentPanel.classList.add("collapsed");
      paymentPanel.classList.add("dj-mode");
    } else {
      paymentPanel.classList.remove("dj-mode");
    }
  }
  if (boostersVisibility) {
    boostersVisibility.classList.toggle("is-hidden", !enabled);
  }
  applyBoostersVisibility();
  syncRoomSettings({ dj_mode: enabled, spotify_connected: isSpotifyConnected });
  if (!enabled) {
    disableBrandEdit(true);
    closeDjMenu();
  }
  renderLists();
}
function setBrandName(name) {
  const clean = name.trim() || "Tapster";
  brandNameText.textContent = clean;
  brandNameInput.value = clean;
  const logo = brandMark.querySelector("img");
  if (logo) {
    logo.alt = clean;
    logo.title = clean;
  } else {
    brandMark.textContent = clean[0].toUpperCase();
  }
  localStorage.setItem(`${STORAGE_PREFIX}brand_name`, clean);
}

function updateRoomChip(bar) {
  if (!roomNameEl || !bar) return;
  const label = bar.playlistName ? `${bar.barName} · ${bar.playlistName}` : bar.barName;
  roomNameEl.textContent = label;
}

function enableBrandEdit() {
  brandNameText.classList.add("is-hidden");
  brandNameInput.classList.remove("is-hidden");
  brandNameInput.focus();
  brandNameInput.select();
}

function disableBrandEdit(save = true) {
  if (save) {
    setBrandName(brandNameInput.value);
    syncBrandName(brandNameInput.value);
  }
  brandNameInput.classList.add("is-hidden");
  brandNameText.classList.remove("is-hidden");
}

function pruneLowScore(targetId) {
  const item = requests.find((r) => r.id === targetId);
  if (!item) return false;
  if (item.status !== "queued") return false;
  if (scoreOf(item) <= -3) {
    requests = requests.filter((r) => r.id !== targetId);
    persistRequests();
    deleteRequestRemote(targetId);
    return true;
  }
  return false;
}

function scoreOf(item) {
  if (item.djPinned) return DJ_BASE_SCORE + (item.upvotes - item.downvotes);
  return item.upvotes - item.downvotes;
}

function formatTimeSince(ts) {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "lige nu";
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} t siden`;
  const days = Math.floor(hours / 24);
  return `${days} d siden`;
}

function sortQueued(a, b) {
  if (!!a.djPinned !== !!b.djPinned) return b.djPinned ? 1 : -1;
  const scoreDiff = scoreOf(b) - scoreOf(a);
  if (scoreDiff !== 0) return scoreDiff;
  const upDiff = b.upvotes - a.upvotes;
  if (upDiff !== 0) return upDiff;
  return a.createdAt - b.createdAt;
}

function sortPlayed(a, b) {
  return (b.playedAt || 0) - (a.playedAt || 0);
}


function spotifySearchLinks(track) {
  const query = `${track.title} ${track.artist}`.trim();
  const web = track && track.isrc
    ? `https://open.spotify.com/search/isrc:${encodeURIComponent(track.isrc)}`
    : `https://open.spotify.com/search/${encodeURIComponent(query)}`;
  const app = track && track.isrc
    ? `spotify:search:isrc:${encodeURIComponent(track.isrc)}`
    : `spotify:search:${encodeURIComponent(query)}`;
  return { web, app };
}

function openSpotify(appUrl, webUrl) {
  const start = Date.now();
  const isAndroid = /android/i.test(navigator.userAgent);
  if (isAndroid) {
    const path = appUrl.replace(/^spotify:/, "");
    const intent = `intent://${path}#Intent;scheme=spotify;package=com.spotify.music;end`;
    window.location.href = intent;
  } else {
    window.location.href = appUrl;
  }
  setTimeout(() => {
    if (Date.now() - start < 1200) {
      window.open(webUrl, "_blank", "noopener");
    }
  }, 800);
}

async function spotifySearch(query) {
  const fnUrl = `${FUNCTIONS_URL}/spotify-search?q=${encodeURIComponent(query)}`;
  const res = await fetch(fnUrl, {
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) throw new Error("search_failed");
  const payload = await res.json();
  return payload?.items || [];
}

function renderSearchResults(items) {
  if (!items.length) {
    searchResults.innerHTML = "";
    return;
  }
  searchResults.innerHTML = items
    .slice(0, 5)
    .map(
      (item) => `
        <li class="search-item" data-id="${item.id}">
          <img src="${item.cover || ""}" alt="${item.title}" />
          <div>
            <div class="search-title">${item.title}</div>
            <div class="search-artist">${item.artist || ""}</div>
          </div>
          <span class="search-tag">Vælg</span>
        </li>
      `
    )
    .join("");

  searchResults.querySelectorAll(".search-item").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.id;
      const picked = items.find((it) => String(it.id) === String(id));
      if (!picked) return;
      selectedTrack = {
        title: picked.title,
        artist: picked.artist || "",
        isrc: picked.isrc || "",
        cover: picked.cover || "",
        spotifyWebUrl: picked.webUrl || "",
        spotifyAppUrl: picked.uri || "",
      };
      document.getElementById("trackTitle").value = selectedTrack.title;
      if (trackArtistInput) {
        trackArtistInput.value = selectedTrack.artist;
      }
      searchResults.innerHTML = "";
    });
  });
}
function renderLists() {
  const queued = requests.filter((r) => r.status === "queued").sort(sortQueued);
  const played = requests.filter((r) => r.status === "played").sort(sortPlayed);

  queuedList.innerHTML = queued.map((item) => renderCard(item)).join("");
  playedList.innerHTML = played.map((item) => renderCard(item)).join("");

  queuedCount.textContent = queued.length;
  playedCount.textContent = played.length;

  document.querySelectorAll(".card").forEach((card) => {
    card.classList.add("card-animate");
  });
  requestAnimationFrame(() => {
    document.querySelectorAll(".card").forEach((card) => {
      card.classList.add("card-animate-in");
    });
  });

  attachCardHandlers();
}

function renderCard(item) {
  const vote = userVotes.get(item.id) || 0;
  const disabled = item.status === "played" || isDj;
  const scoreLabel = item.djPinned
    ? `∞${item.upvotes - item.downvotes === 0 ? "" : item.upvotes - item.downvotes > 0 ? ` +${item.upvotes - item.downvotes}` : ` ${item.upvotes - item.downvotes}`}`
    : scoreOf(item);
  const upLabel = item.upvotes;
  const requesterLabel = item.requesterId ? requesterNames.get(item.requesterId) : "";
  return `
    <article class="card" data-id="${item.id}">
      <div class="card-main">
        <div class="badge">${item.status === "queued" ? "I kø" : "Afspillet"}</div>
        <div class="track-header">
          ${
            item.cover
              ? `<img class="cover" src="${item.cover}" alt="Cover: ${item.title}" />`
              : `<div class="cover-placeholder">${(item.title || "?")[0].toUpperCase()}</div>`
          }
          <div>
            <h3>${item.title}</h3>
            <div class="artist">${item.artist || "Ukendt kunstner"}</div>
          </div>
        </div>
        ${item.comment ? `<div class="comment">${item.comment}</div>` : ""}
        <div class="meta">
          <span class="score">${scoreLabel}</span>
          <span>${formatTimeSince(item.createdAt)}</span>
          <span>Up: ${upLabel} · Down: ${item.downvotes}</span>
          ${requesterLabel ? `<span class="requester">Ønsket af ${requesterLabel}</span>` : ""}
          ${item.djPinned ? `<span class="badge dj">DJ</span>` : ""}
        </div>
        ${
          item.spotifyWebUrl
            ? `<div class="spotify-row">
                <button class="spotify-link" type="button" data-action="spotify" data-app="${item.spotifyAppUrl}" data-web="${item.spotifyWebUrl}">Afspil i Spotify</button>
              </div>`
            : ""
        }
        <div class="dj-actions" ${isDj ? "" : "style=\"display:none\""}>
          ${
            item.status === "queued"
              ? `<button class="primary" data-action="play">Afspillet</button>`
              : `<button class="ghost" data-action="unplay">Fortryd</button>`
          }
          ${
            isDj && ((item.paidBoostsUp || 0) + (item.paidBoostsDown || 0)) === 0
              ? `<button class="ghost" data-action="delete">Slet nummer</button>`
              : ``
          }
        </div>
      </div>
      <div class="vote-panel" ${isDj ? "data-dj=\"true\"" : ""}>
        <div class="vote-row">
          ${
            item.status === "queued" && voteCredits > 0 && !item.djPinned
              ? `<div class="boost-wrap">
                  <button class="boost-mini up" type="button" data-action="boost-up-menu">Boost</button>
                  <div class="boost-menu is-hidden" data-menu="up">
                    <button class="boost-option" type="button" data-action="boostUp1">+1</button>
                    <button class="boost-option" type="button" data-action="boostUp10" ${voteCredits < 10 ? "disabled" : ""}>+10</button>
                    <button class="boost-option" type="button" data-action="boostUpAll">+alle</button>
                  </div>
                </div>`
              : ""
          }
          <button class="vote-btn up ${vote === 1 ? "active up" : ""}" data-action="up" ${
            disabled ? "disabled" : ""
          }>▲</button>
        </div>
        <div class="vote-row">
          ${
            item.status === "queued" && voteCredits > 0 && !item.djPinned
              ? `<div class="boost-wrap">
                  <button class="boost-mini down" type="button" data-action="boost-down-menu">Boost</button>
                  <div class="boost-menu is-hidden" data-menu="down">
                    <button class="boost-option" type="button" data-action="boostDown1">+1</button>
                    <button class="boost-option" type="button" data-action="boostDown10" ${voteCredits < 10 ? "disabled" : ""}>+10</button>
                    <button class="boost-option" type="button" data-action="boostDownAll">+alle</button>
                  </div>
                </div>`
              : ""
          }
          <button class="vote-btn down ${vote === -1 ? "active down" : ""}" data-action="down" ${
            disabled ? "disabled" : ""
          }>▼</button>
        </div>
        <div class="counts">
          <span>▲ ${upLabel}</span>
          <span>▼ ${item.downvotes}</span>
        </div>
      </div>
    </article>
  `;
}

function attachCardHandlers() {
  document.querySelectorAll(".card").forEach((card) => {
    card.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(card.dataset.id, btn.dataset.action));
    });
  });
}

function handleAction(id, action) {
  const item = requests.find((r) => r.id === id);
  if (!item) return;

  if (action === "up" || action === "down") {
    if (item.status === "played" || isDj) return;
    const nextVote = action === "up" ? 1 : -1;
    const currentVote = userVotes.get(id) || 0;
    if (currentVote === nextVote) {
      userVotes.set(id, 0);
      if (nextVote === 1) item.upvotes -= 1;
      if (nextVote === -1) item.downvotes -= 1;
    } else {
      if (currentVote === 1) item.upvotes -= 1;
      if (currentVote === -1) item.downvotes -= 1;
      userVotes.set(id, nextVote);
      if (nextVote === 1) item.upvotes += 1;
      if (nextVote === -1) item.downvotes += 1;
    }
    persistVotes();
    if (pruneLowScore(id)) {
      renderLists();
      return;
    }
    syncRequest(item);
  }

  if (action === "play" && isDj) {
    item.status = "played";
    item.playedAt = Date.now();
    syncRequest(item);
  }

  if (action === "unplay" && isDj) {
    item.status = "queued";
    item.playedAt = null;
    syncRequest(item);
  }

  if (action === "delete" && isDj) {
    if ((item.paidBoostsUp || 0) + (item.paidBoostsDown || 0) > 0) return;
    requests = requests.filter((r) => r.id !== id);
    persistRequests();
    deleteRequestRemote(id);
    renderLists();
    return;
  }

  if (action === "spotify") {
    const appUrl = item.spotifyAppUrl || "";
    const webUrl = item.spotifyWebUrl || "";
    if (appUrl && webUrl) {
      openSpotify(appUrl, webUrl);
      return;
    }
  }

  if (action === "boost-up-menu" || action === "boost-down-menu") {
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (!card) return;
    const target = action === "boost-up-menu" ? "up" : "down";
    document.querySelectorAll('.boost-menu').forEach((menu) => menu.classList.add('is-hidden'));
    const menu = card.querySelector(`.boost-menu[data-menu="${target}"]`);
    if (menu) menu.classList.toggle('is-hidden');
    return;
  }

  if (action.startsWith("boostUp") || action.startsWith("boostDown")) {
    if (item.status === "queued" && voteCredits > 0 && !item.djPinned) {
      let amount = 1;
      if (action.endsWith("10")) amount = 10;
      if (action.endsWith("All")) amount = voteCredits;
      if (voteCredits < amount) return;
      voteCredits -= amount;
      if (action.startsWith("boostUp")) {
        item.upvotes += amount;
        item.paidBoostsUp = (item.paidBoostsUp || 0) + amount;
      } else {
        item.downvotes += amount;
        item.paidBoostsDown = (item.paidBoostsDown || 0) + amount;
      }
      persistCredits();
      persistRequests();
      syncRequest(item);
      updateCreditsDisplay();
      if (action.startsWith("boostDown") && pruneLowScore(id)) {
        renderLists();
        return;
      }
      renderLists();
      return;
    }
  }

  persistRequests();
  renderLists();
}

function openModal() {
  modal.classList.remove("hidden");
  document.getElementById("trackTitle").focus();
}

function closeModalPanel() {
  modal.classList.add("hidden");
  requestForm.reset();
  selectedTrack = null;
  searchResults.innerHTML = "";
  if (requestHelper) requestHelper.classList.add("is-hidden");
}

function showInfo(message, title = "Besked") {
  if (!infoModal || !infoMessage || !infoTitle) return;
  infoTitle.textContent = title;
  infoMessage.textContent = message;
  infoModal.classList.remove("hidden");
}

function closeInfoModal() {
  if (!infoModal) return;
  infoModal.classList.add("hidden");
}

function addRequest(event) {
  event.preventDefault();
  const title = document.getElementById("trackTitle").value.trim();
  const artist = trackArtistInput ? trackArtistInput.value.trim() : "";
  const comment = document.getElementById("trackComment").value.trim();
  if (!title) {
    if (requestHelper) {
      requestHelper.textContent = "Skriv et tracknavn først.";
      requestHelper.classList.remove("is-hidden");
    }
    return;
  }

  const track = selectedTrack || { title, artist };
  const spotifyLinks = {
    web: track.spotifyWebUrl || "",
    app: track.spotifyAppUrl || "",
  };
  const fallbackLinks = spotifySearchLinks(track);
  if (!spotifyLinks.web) spotifyLinks.web = fallbackLinks.web;
  if (!spotifyLinks.app) spotifyLinks.app = fallbackLinks.app;
  const key = `${track.title}::${track.artist || ""}`.toLowerCase();
  const alreadyQueued = requests.some(
    (item) =>
      item.status === "queued" &&
      `${item.title}::${item.artist || ""}`.toLowerCase() === key
  );
  if (alreadyQueued) {
    showInfo("Sangen ligger allerede i kø.");
    return;
  }
  if (requestHelper) requestHelper.classList.add("is-hidden");

  const djPinned = isDj;
  requests.push({
    id: `r${Date.now()}`,
    requesterId: currentUser?.id || "",
    title: track.title,
    artist: track.artist,
    comment,
    upvotes: 0,
    downvotes: 0,
    paidBoostsUp: 0,
    paidBoostsDown: 0,
    createdAt: Date.now(),
    status: "queued",
    spotifyWebUrl: spotifyLinks.web,
    spotifyAppUrl: spotifyLinks.app,
    cover: selectedTrack ? selectedTrack.cover : "",
    djPinned,
  });

  selectedTrack = null;
  closeModalPanel();
  persistRequests();
  syncRequest(requests[requests.length - 1]);
  renderLists();
}

function switchTab(tab) {
  tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".list").forEach((list) => {
    list.classList.toggle("active", list.dataset.list === tab);
  });
  if (playedActions) {
    playedActions.classList.toggle("hidden", tab !== "played");
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

if (playedActions) {
  playedActions.classList.toggle("hidden", !document.querySelector('.tab[data-tab="played"]')?.classList.contains("active"));
}

addBtn.addEventListener("click", openModal);
closeModal.addEventListener("click", closeModalPanel);
cancelBtn.addEventListener("click", closeModalPanel);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModalPanel();
});


const trackTitleInput = document.getElementById("trackTitle");
const trackArtistInput = document.getElementById("trackArtist");


function updatePayPrices() {
  document.querySelectorAll(".pay-price").forEach((priceEl) => {
    priceEl.textContent = `${selectedAmount} kr`;
  });
}

function updateAmountLabel() {
  if (amountValue) amountValue.textContent = `${selectedAmount} kr`;
}

payButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    voteCredits += selectedAmount;
    persistCredits();
    updateCreditsDisplay();
    renderLists();
  });
});

if (amountRange) {
  amountRange.addEventListener("input", () => {
    const amount = Number(amountRange.value || "0");
    selectedAmount = Number.isFinite(amount) ? amount : 0;
    updateAmountLabel();
    updatePayPrices();
  });
  const initialAmount = Number(amountRange.value || "10");
  selectedAmount = Number.isFinite(initialAmount) ? initialAmount : 10;
  updateAmountLabel();
  updatePayPrices();
}


document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(".boost-wrap")) {
    document.querySelectorAll(".boost-menu").forEach((menu) => menu.classList.add("is-hidden"));
  }
});


paymentToggle.addEventListener("click", () => {
  paymentPanel.classList.toggle("collapsed");
});

if (menuPanel) {
  const toggleMenu = () => menuPanel.classList.toggle("is-hidden");
  if (menuBtn) menuBtn.addEventListener("click", toggleMenu);
  if (profileBtn) profileBtn.addEventListener("click", toggleMenu);
  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      window.location.assign("index.html?login=1");
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      (menuBtn && menuBtn.contains(target)) ||
      (profileBtn && profileBtn.contains(target)) ||
      menuPanel.contains(target)
    )
      return;
    menuPanel.classList.add("is-hidden");
  });

  menuPanel.addEventListener("click", (event) => {
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
      try {
        if (supabaseClient) {
          supabaseClient.auth.signOut({ scope: "global" });
          supabaseClient.auth.signOut({ scope: "local" });
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
        window.location.assign("index.html?logout=1");
      }
    }
  });
}

if (djMenuPanel) {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if ((djMenuBtn && djMenuBtn.contains(target)) || djMenuPanel.contains(target)) return;
    closeDjMenu();
  });

  djMenuPanel.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.getAttribute("data-action");
    if (!action) return;
    if (action === "qr") {
      openQrModal();
    } else if (action === "edit-name") {
      enableBrandEdit();
    } else if (action === "spotify-connect") {
      if (isSpotifyConnected) {
        disconnectSpotify();
      } else {
        startSpotifyConnect();
      }
    } else if (action === "dj-off") {
      sessionStorage.removeItem(DJ_AUTH_KEY);
      setDjMode(false);
    }
    closeDjMenu();
  });
}


easterEggBtn.addEventListener("click", () => {
  easterEgg.classList.toggle("is-hidden");
  easterEggBtn.textContent = easterEgg.classList.contains("is-hidden")
    ? "Find easter egg"
    : "Skjul easter egg";
});

trackTitleInput.addEventListener("input", () => {
  const query = trackTitleInput.value.trim();
  if (selectedTrack && query !== selectedTrack.title) {
    selectedTrack = null;
  }
  if (query.length < 2) {
    searchResults.innerHTML = "";
    return;
  }
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    try {
      const results = await spotifySearch(query);
      renderSearchResults(results);
    } catch {
      searchResults.innerHTML = "";
    }
  }, 250);
});

if (trackArtistInput) {
  trackArtistInput.addEventListener("input", () => {
    if (selectedTrack) selectedTrack = null;
  });
}

function toggleDjMenu() {
  if (!djMenuPanel) return;
  djMenuPanel.classList.toggle("is-hidden");
}

function closeDjMenu() {
  if (!djMenuPanel) return;
  djMenuPanel.classList.add("is-hidden");
}

brandNameText.addEventListener("dblclick", () => {
  if (!isDj) return;
  enableBrandEdit();
});

brandNameInput.addEventListener("blur", () => {
  if (!isDj) return;
  disableBrandEdit(true);
});

brandNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    disableBrandEdit(true);
  }
  if (event.key === "Escape") {
    event.preventDefault();
    disableBrandEdit(false);
  }
});

djForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = djPinInput.value.trim();
  const storedPassword = barHostPassword || localStorage.getItem(HOST_PASSWORD_KEY) || "";
  if (!storedPassword) {
    djError.textContent = "Ingen værts-password fundet. Opret bar først.";
    djError.classList.remove("is-hidden");
    djPinInput.select();
    return;
  }
  if (value === storedPassword) {
    sessionStorage.setItem(DJ_AUTH_KEY, "true");
    closeDjModalPanel();
    setDjMode(true);
  } else {
    djError.textContent = "Forkert password. Prøv igen.";
    djError.classList.remove("is-hidden");
    djPinInput.select();
  }
});

closeDjModal.addEventListener("click", closeDjModalPanel);
cancelDj.addEventListener("click", closeDjModalPanel);
djModal.addEventListener("click", (event) => {
  if (event.target === djModal) closeDjModalPanel();
});
requestForm.addEventListener("submit", addRequest);

if (djMenuBtn) djMenuBtn.addEventListener("click", toggleDjMenu);
if (qrBtnPublic) qrBtnPublic.addEventListener("click", openQrModal);
if (closeQr) closeQr.addEventListener("click", closeQrModal);
if (qrModal) {
  qrModal.addEventListener("click", (event) => {
    if (event.target === qrModal) closeQrModal();
  });
}

if (infoOk) infoOk.addEventListener("click", closeInfoModal);
if (closeInfo) closeInfo.addEventListener("click", closeInfoModal);
if (infoModal) {
  infoModal.addEventListener("click", (event) => {
    if (event.target === infoModal) closeInfoModal();
  });
}

async function startSpotifyConnect() {
  if (!supabaseClient) return;
  const { data } = await supabaseClient.auth.getSession();
  const session = data?.session;
  if (!session) {
    const next = encodeURIComponent(window.location.href);
    window.location.assign(`index.html?login=1&next=${next}`);
    return;
  }
  try {
    const fnUrl = `${FUNCTIONS_URL}/spotify-login?returnTo=${encodeURIComponent(
      window.location.href
    )}`;
    const res = await fetch(fnUrl, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    const payload = await res.json();
    if (!res.ok || !payload?.url) throw new Error("spotify_login_failed");
    window.location.assign(payload.url);
  } catch {
    showInfo("Kunne ikke forbinde til Spotify lige nu.");
  }
}

if (spotifyPlaylistBtn) {
  spotifyPlaylistBtn.addEventListener("click", startSpotifyConnect);
}

function applyBoostersVisibility() {
  if (!paymentPanel) return;
  const isVisible = sessionStorage.getItem(BOOSTERS_VIS_KEY) !== "false";
  paymentPanel.classList.toggle("is-hidden", !isVisible && !isDj);
  if (boostersToggle) boostersToggle.checked = isVisible;
}

if (boostersToggle) {
  boostersToggle.addEventListener("change", () => {
    sessionStorage.setItem(BOOSTERS_VIS_KEY, boostersToggle.checked ? "true" : "false");
    applyBoostersVisibility();
  });
}

djToggle.addEventListener("change", (event) => {
  if (event.target.checked) {
    const authed = sessionStorage.getItem(DJ_AUTH_KEY) === "true";
    if (authed) {
      setDjMode(true);
      return;
    }
    event.target.checked = false;
    openDjModal();
    return;
  }
  sessionStorage.removeItem(DJ_AUTH_KEY);
  setDjMode(false);
});

setInterval(() => {
  document.querySelectorAll(".card").forEach((card) => {
    const id = card.dataset.id;
    const item = requests.find((r) => r.id === id);
    if (!item) return;
    const timeEl = card.querySelector(".meta span:nth-child(2)");
    if (timeEl) timeEl.textContent = formatTimeSince(item.createdAt);
  });
}, 60000);

const storedBrand = localStorage.getItem(`${STORAGE_PREFIX}brand_name`);
setBrandName(storedBrand || "Tapster");
barHostPassword = localStorage.getItem(HOST_PASSWORD_KEY) || "";
// defer to initSupabase for remote load
const storedVotes = loadVotes();
Object.entries(storedVotes).forEach(([key, value]) => {
  userVotes.set(key, Number(value));
});
voteCredits = loadCredits();
updateCreditsDisplay();
updatePayPrices();

initSupabase();
sessionStorage.removeItem(DJ_AUTH_KEY);

applyBoostersVisibility();

renderLists();
