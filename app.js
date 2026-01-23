const queuedList = document.getElementById("queuedList");
const playedList = document.getElementById("playedList");
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
const ROOM_ID = "baren-fredag";
let supabaseClient;
let useRemote = true;
let remotePoll;
const requestForm = document.getElementById("requestForm");
const searchResults = document.getElementById("searchResults");
const brandNameText = document.getElementById("brandNameText");
const brandNameInput = document.getElementById("brandNameInput");
const brandEditToggle = document.getElementById("brandEditToggle");
const brandMark = document.getElementById("brandMark");
const creditCount = document.getElementById("creditCount");
const payButtons = document.querySelectorAll(".pay-btn");
const paymentPanel = document.getElementById("paymentPanel");
const paymentToggle = document.getElementById("paymentToggle");
const djModal = document.getElementById("djModal");
const djForm = document.getElementById("djForm");
const djPinInput = document.getElementById("djPin");
const djError = document.getElementById("djError");
const closeDjModal = document.getElementById("closeDjModal");
const cancelDj = document.getElementById("cancelDj");

const userVotes = new Map();
let isDj = false;
let searchTimer;
let selectedTrack = null;
let searchNonce = 0;
let voteCredits = 0;

const defaultRequests = [
  {
    id: "r1",
    title: "Superstition",
    artist: "Stevie Wonder",
    comment: "Klar til dansegulvet",
    upvotes: 18,
    downvotes: 3,
    createdAt: Date.now() - 1000 * 60 * 18,
    status: "queued",
  },
  {
    id: "r2",
    title: "Murder on the Dancefloor",
    artist: "Sophie Ellis-Bextor",
    comment: "90'er energi!",
    upvotes: 14,
    downvotes: 2,
    createdAt: Date.now() - 1000 * 60 * 12,
    status: "queued",
  },
  {
    id: "r3",
    title: "Señorita",
    artist: "Shawn Mendes",
    comment: "",
    upvotes: 5,
    downvotes: 7,
    createdAt: Date.now() - 1000 * 60 * 7,
    status: "queued",
  },
  {
    id: "r4",
    title: "Take On Me",
    artist: "a-ha",
    comment: "All time classic",
    upvotes: 22,
    downvotes: 1,
    createdAt: Date.now() - 1000 * 60 * 42,
    status: "played",
    playedAt: Date.now() - 1000 * 60 * 6,
  },
];

let requests = [];




function loadCredits() {
  try {
    const raw = localStorage.getItem("aller_credits");
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

function persistCredits() {
  try {
    localStorage.setItem("aller_credits", String(voteCredits));
  } catch {
    // ignore storage errors
  }
}

function updateCreditsDisplay() {
  if (creditCount) creditCount.textContent = String(voteCredits);
}

function loadVotes() {
  try {
    const raw = localStorage.getItem("aller_votes");
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
    localStorage.setItem("aller_votes", JSON.stringify(obj));
  } catch {
    // ignore storage errors
  }
}

function loadRequests() {
  try {
    const raw = localStorage.getItem("aller_requests");
    if (!raw) return [...defaultRequests];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...defaultRequests];
  } catch {
    return [...defaultRequests];
  }
}

function persistRequests() {
  try {
    localStorage.setItem("aller_requests", JSON.stringify(requests));
  } catch {
    // ignore storage errors
  }
}


function mapRowToRequest(row) {
  return {
    id: row.id,
    title: row.track_title || "",
    artist: row.artist || "",
    comment: row.comment || "",
    status: row.status || "queued",
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    playedAt: row.played_at ? new Date(row.played_at).getTime() : null,
    upvotes: row.upvotes ?? 0,
    downvotes: row.downvotes ?? 0,
    djPinned: !!row.dj_pinned,
    paidBoosts: row.paid_boosts ?? 0,
    cover: row.cover || "",
    spotifyWebUrl: row.spotify_web_url || "",
    spotifyAppUrl: row.spotify_app_url || "",
  };
}

function mapRequestToRow(item) {
  return {
    id: item.id,
    room_id: ROOM_ID,
    track_title: item.title,
    artist: item.artist,
    comment: item.comment,
    status: item.status,
    created_at: new Date(item.createdAt).toISOString(),
    played_at: item.playedAt ? new Date(item.playedAt).toISOString() : null,
    upvotes: Number.isFinite(item.upvotes) ? item.upvotes : 0,
    downvotes: item.downvotes,
    dj_pinned: !!item.djPinned,
    paid_boosts: item.paidBoosts || 0,
    cover: item.cover || "",
    spotify_web_url: item.spotifyWebUrl || "",
    spotify_app_url: item.spotifyAppUrl || "",
  };
}

async function fetchRequestsRemote() {
  if (!useRemote || !supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("requests")
    .select("*")
    .eq("room_id", ROOM_ID);
  if (error) throw error;
  requests = (data || []).map(mapRowToRequest);
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
    await fetchRequestsRemote();
    await subscribeRequests();
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


const DJ_PIN = "1122";

function openDjModal() {
  djError.classList.add("is-hidden");
  djPinInput.value = "";
  djModal.classList.remove("hidden");
  djPinInput.focus();
}

function closeDjModalPanel() {
  djModal.classList.add("hidden");
}

function setDjMode(enabled) {
  isDj = enabled;
  djToggle.checked = enabled;
  brandEditToggle.classList.toggle("is-hidden", !enabled);
  if (!enabled) {
    disableBrandEdit(true);
  }
  renderLists();
}
function setBrandName(name) {
  const clean = name.trim() || "Aller";
  brandNameText.textContent = clean;
  brandNameInput.value = clean;
  const logo = brandMark.querySelector("img");
  if (logo) {
    logo.alt = clean;
    logo.title = clean;
  } else {
    brandMark.textContent = clean[0].toUpperCase();
  }
  localStorage.setItem("aller_brand_name", clean);
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
  if (item.djPinned) return Number.POSITIVE_INFINITY;
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
  return b.createdAt - a.createdAt;
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

function deezerSearch(query) {
  return new Promise((resolve, reject) => {
    const callback = `deezer_cb_${searchNonce++}`;
    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, 4000);

    function cleanup() {
      clearTimeout(timeout);
      if (script.parentNode) script.parentNode.removeChild(script);
      if (window[callback]) delete window[callback];
    }

    window[callback] = (data) => {
      cleanup();
      resolve(data.data || []);
    };

    script.src = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&output=jsonp&callback=${callback}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("network"));
    };

    document.body.appendChild(script);
  });
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
          <img src="${item.album?.cover_small || ""}" alt="${item.title}" />
          <div>
            <div class="search-title">${item.title}</div>
            <div class="search-artist">${item.artist?.name || ""}</div>
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
        artist: picked.artist?.name || "",
        isrc: picked.isrc || "",
        cover: picked.album?.cover_small || "",
      };
      document.getElementById("trackTitle").value = selectedTrack.title;
      document.getElementById("trackArtist").value = selectedTrack.artist;
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

  attachCardHandlers();
}

function renderCard(item) {
  const vote = userVotes.get(item.id) || 0;
  const disabled = item.status === "played" || item.djPinned || isDj;
  const scoreLabel = item.djPinned ? "∞" : scoreOf(item);
  const upLabel = item.djPinned ? "∞" : item.upvotes;
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
          ${item.djPinned ? `<span class="badge dj">DJ</span>` : ""}
          ${
            item.spotifyWebUrl
              ? `<button class="spotify-link" type="button" data-action="spotify" data-app="${item.spotifyAppUrl}" data-web="${item.spotifyWebUrl}">Afspil i Spotify</button>`
              : ""
          }
        </div>
        <div class="dj-actions" ${isDj ? "" : "style=\"display:none\""}>
          ${
            item.status === "queued"
              ? `<button class="primary" data-action="play">Afspillet</button>`
              : `<button class="ghost" data-action="unplay">Fortryd</button>`
          }
          ${
            isDj && (item.paidBoosts || 0) === 0
              ? `<button class="ghost" data-action="delete">Slet nummer</button>`
              : ``
          }
        </div>
      </div>
      <div class="vote-panel" ${isDj ? "data-dj=\"true\"" : ""}>
        <div class="vote-row">
          <button class="vote-btn up ${vote === 1 ? "active up" : ""}" data-action="up" ${
            disabled ? "disabled" : ""
          }>▲</button>
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
        </div>
        <div class="vote-row">
          <button class="vote-btn down ${vote === -1 ? "active down" : ""}" data-action="down" ${
            disabled ? "disabled" : ""
          }>▼</button>
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
    if (item.status === "played" || item.djPinned || isDj) return;
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
    if ((item.paidBoosts || 0) > 0) return;
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
      } else {
        item.downvotes += amount;
      }
      item.paidBoosts = (item.paidBoosts || 0) + amount;
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
}

function addRequest(event) {
  event.preventDefault();
  const title = document.getElementById("trackTitle").value.trim();
  const artist = document.getElementById("trackArtist").value.trim();
  const comment = document.getElementById("trackComment").value.trim();
  if (!title) return;

  const track = selectedTrack || { title, artist };
  const spotifyLinks = spotifySearchLinks(track);

  const djPinned = isDj;
  requests.push({
    id: `r${Date.now()}`,
    title: track.title,
    artist: track.artist,
    comment,
    upvotes: 0,
    downvotes: 0,
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
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

addBtn.addEventListener("click", openModal);
closeModal.addEventListener("click", closeModalPanel);
cancelBtn.addEventListener("click", closeModalPanel);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModalPanel();
});


const trackTitleInput = document.getElementById("trackTitle");
const trackArtistInput = document.getElementById("trackArtist");


payButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    voteCredits += 1;
    persistCredits();
    updateCreditsDisplay();
    renderLists();
  });
});


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
      const results = await deezerSearch(query);
      renderSearchResults(results);
    } catch {
      searchResults.innerHTML = "";
    }
  }, 250);
});

trackArtistInput.addEventListener("input", () => {
  if (selectedTrack) selectedTrack = null;
});

brandEditToggle.addEventListener("click", () => {
  if (!isDj) return;
  enableBrandEdit();
});

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
  if (value === DJ_PIN) {
    sessionStorage.setItem("aller_dj_auth", "true");
    closeDjModalPanel();
    setDjMode(true);
  } else {
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

djToggle.addEventListener("change", (event) => {
  if (event.target.checked) {
    const authed = sessionStorage.getItem("aller_dj_auth") === "true";
    if (authed) {
      setDjMode(true);
      return;
    }
    event.target.checked = false;
    openDjModal();
    return;
  }
  sessionStorage.removeItem("aller_dj_auth");
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

const storedBrand = localStorage.getItem("aller_brand_name");
setBrandName(storedBrand || "Aller");
// defer to initSupabase for remote load
const storedVotes = loadVotes();
Object.entries(storedVotes).forEach(([key, value]) => {
  userVotes.set(key, Number(value));
});
voteCredits = loadCredits();
updateCreditsDisplay();

initSupabase();

const djAuthed = sessionStorage.getItem("aller_dj_auth") === "true";
if (djAuthed) {
  setDjMode(true);
}

renderLists();
