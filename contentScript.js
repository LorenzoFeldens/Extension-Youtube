const STORAGE_KEY = "ytPlaylists";
const ENABLED_KEY = "ytButtonsEnabled"; // global on/off switch from the popup (default: on)

function applyButtonsEnabled(enabled) {
  document.documentElement.classList.toggle("yt-pl-buttons-off", enabled === false);
}
chrome.storage.sync.get([ENABLED_KEY], (data) => applyButtonsEnabled(data[ENABLED_KEY]));

/** ===== Shared helpers ===== **/
function getVideoIdFromAnchor(anchor) {
  try {
    if (!anchor || !anchor.href) return null;
    const url = new URL(anchor.href, window.location.origin);
    const v = url.searchParams.get("v");
    if (v) return v;
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] || null;
    return null;
  } catch {
    return null;
  }
}

function getCurrentWatchVideoId() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

function showToast(message, { error = false } = {}) {
  try {
    let toast = document.querySelector(".yt-pl-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "yt-pl-toast";
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), error ? 5000 : 1800);
  } catch {}
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((x) => ({
      text: (x?.text || "★").toString(),
      color: (x?.color || "#ffffff").toString(),
      playlistId: (x?.playlistId || "").toString().trim()
    }))
    .filter((x) => x.playlistId.length > 0);
}

// Cached button config: one storage read instead of one per title element.
let cachedButtonsPromise = null;
function getPlaylistButtons() {
  if (!cachedButtonsPromise) {
    cachedButtonsPromise = new Promise((resolve) => {
      chrome.storage.sync.get([STORAGE_KEY], (data) => resolve(normalizeItems(data[STORAGE_KEY])));
    });
  }
  return cachedButtonsPromise;
}

// When the popup saves, drop the cache and rebuild every injected bar.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes[ENABLED_KEY]) applyButtonsEnabled(changes[ENABLED_KEY].newValue);
  if (!changes[STORAGE_KEY]) return;
  cachedButtonsPromise = Promise.resolve(normalizeItems(changes[STORAGE_KEY].newValue));
  document.querySelectorAll(".yt-playlist-button-bar").forEach((bar) => bar.remove());
  document.querySelectorAll("[data-yt-playlist-button-injected]").forEach((el) => {
    delete el.dataset.ytPlaylistButtonInjected;
  });
  processVideos();
});

/** ===== Add-to-playlist buttons ===== **/
// Overlaid on every video thumbnail (home, subscriptions, search, channel, watch sidebar,
// playlists, shorts shelves...). Two thumbnail generations exist on YouTube today:
//   - ytd-thumbnail           (classic renderers; contains a#thumbnail)
//   - yt-thumbnail-view-model (new "lockup" and shorts renderers)
const THUMBNAIL_SELECTOR = "ytd-thumbnail, yt-thumbnail-view-model";

// The video being watched has no thumbnail, so it keeps a bar above its title.
const WATCH_TITLE_SELECTOR = "ytd-watch-metadata #title";

function findVideoIdForThumbnail(host) {
  const anchor = host.closest("a[href]") || host.querySelector("a[href]");
  const fromAnchor = getVideoIdFromAnchor(anchor);
  if (fromAnchor) return fromAnchor;

  // New lockups expose the id as a class (their link may be an ad redirect)
  const withId = host.closest('[class*="content-id-"]');
  const m = withId && withId.className.match(/content-id-([\w-]{11})/);
  return m ? m[1] : null;
}

// Black or white label, whichever reads better on the button's colour.
function readableTextColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#0f0f0f";
  const n = parseInt(m[1], 16);
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#0f0f0f" : "#ffffff";
}

function flashState(btn, state) {
  btn.classList.remove("is-busy", "is-done", "is-error");
  if (!state) return;
  btn.classList.add(state);
  clearTimeout(btn._stateTimer);
  if (state !== "is-busy") btn._stateTimer = setTimeout(() => btn.classList.remove(state), 1600);
}

function buildButtonBar(items, resolveVideoId, extraClass) {
  const bar = document.createElement("div");
  bar.className = "yt-playlist-button-bar" + (extraClass ? " " + extraClass : "");

  // Thumbnails are links / hover-preview triggers: keep our clicks to ourselves.
  for (const type of ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart"]) {
    bar.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type === "click") e.preventDefault();
    });
  }

  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "yt-playlist-button";
    btn.textContent = item.text || "★";
    btn.title = `Add to '${item.text}'`;
    btn.style.background = item.color || "#ffffff";
    btn.style.setProperty("--yt-pl-fg", readableTextColor(item.color));

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (btn.classList.contains("is-busy")) return; // ignore double clicks

      // Re-resolve the videoId right now: YouTube recycles DOM nodes on navigation.
      const videoId = resolveVideoId();
      if (!videoId) {
        showToast("Could not determine the video ID for this item.", { error: true });
        return;
      }

      flashState(btn, "is-busy");
      chrome.runtime.sendMessage(
        { type: "ADD_TO_PLAYLIST", videoId, playlistId: item.playlistId },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            flashState(btn, "is-error");
            showToast("Add to playlist failed: no response from the extension.", { error: true });
          } else if (!response.success) {
            flashState(btn, "is-error");
            console.error("Add to playlist failed:", response.error);
            showToast("Add to playlist failed: " + response.error, { error: true });
          } else if (response.alreadyInPlaylist) {
            flashState(btn, "is-done");
            showToast(`Already in '${item.text}'`);
          } else {
            flashState(btn, "is-done");
            showToast(`Video added to '${item.text}'`);
          }
        }
      );
    });

    bar.appendChild(btn);
  });

  return bar;
}

async function addButtonsToThumbnail(host) {
  if (host.dataset.ytPlaylistButtonInjected === "true") return;
  host.dataset.ytPlaylistButtonInjected = "true";

  const items = await getPlaylistButtons();
  if (!items.length) return;
  host.appendChild(buildButtonBar(items, () => findVideoIdForThumbnail(host), "yt-pl-thumb-bar"));
}

async function addButtonsAboveWatchTitle(titleElement) {
  if (titleElement.dataset.ytPlaylistButtonInjected === "true") return;
  titleElement.dataset.ytPlaylistButtonInjected = "true";

  const items = await getPlaylistButtons();
  if (!items.length || !titleElement.parentNode) return;
  titleElement.parentNode.insertBefore(buildButtonBar(items, getCurrentWatchVideoId), titleElement);
}

function processVideos() {
  document.querySelectorAll(THUMBNAIL_SELECTOR).forEach(addButtonsToThumbnail);
  document.querySelectorAll(WATCH_TITLE_SELECTOR).forEach(addButtonsAboveWatchTitle);
}

/** ===== Playlist page shortcut: click 3-dots + Remove from playlist ===== **/
function isPlaylistPage() {
  try {
    const u = new URL(location.href);
    return location.pathname === "/playlist" && !!u.searchParams.get("list");
  } catch {
    return false;
  }
}

function trashSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" 
      style="pointer-events: none; display: inherit; width: 100%; height: 100%;">
      <path d="M19 3h-4V2a1 1 0 00-1-1h-4a1 1 0 00-1 1v1H5a2 2 0 00-2 2h18a2 2 0 00-2-2ZM6 19V7H4v12a4 4 0 004 4h8a4 4 0 004-4V7h-2v12a2 
          2 0 01-2 2H8a2 2 0 01-2-2Zm4-11a1 1 0 00-1 1v8a1 1 0 102 0V9a1 1 0 00-1-1Zm4 0a1 1 0 00-1 1v8a1 1 0 002 0V9a1 1 0 00-1-1Z">
      </path>
    </svg>
  `;
}

function findMenuButtonInPlaylistRow(rowEl) {
  // YouTube changes internals often; try several likely selectors
  return (
    rowEl.querySelector('#menu button[aria-label]') ||
    rowEl.querySelector('#menu yt-icon-button button') ||
    rowEl.querySelector('#menu tp-yt-paper-icon-button') ||
    rowEl.querySelector('#menu button') ||
    null
  );
}

function looksLikeRemove(text) {
  const txt = (text || "").toString().trim().toLowerCase();
  // English + Portuguese friendly matching
  return (
    (txt.includes("remove") && (txt.includes("playlist") || txt.includes("play list") || txt.startsWith("remove from"))) ||
    (txt.includes("remover") && (txt.includes("playlist") || txt.includes("lista")))
  );
}

function findRemoveMenuItem() {
  // Only search inside the currently opened popup menu, not the whole page
  const candidates = document.querySelectorAll(
    "ytd-popup-container ytd-menu-service-item-renderer, ytd-popup-container tp-yt-paper-item, ytd-popup-container span"
  );
  for (const el of candidates) {
    if (el.offsetParent !== null && looksLikeRemove(el.textContent)) return el;
  }
  // Fallback: previous behaviour (English only, any span on the page)
  return [...document.querySelectorAll("span")].find((s) => s.textContent.includes("Remove from ")) || null;
}

function clickRemoveFromPlaylistViaMenu(rowEl) {
  const menuBtn = findMenuButtonInPlaylistRow(rowEl);
  if (!menuBtn) return;

  // Open the 3-dots menu
  menuBtn.click();

  // Poll briefly for the menu items to render
  let tries = 0;
  const maxTries = 30; // ~1.5s at 50ms
  const timer = setInterval(() => {
    const removeItem = findRemoveMenuItem();
    tries++;
    if (removeItem) {
      clearInterval(timer);
      removeItem.click();
      return;
    }
    if (tries >= maxTries) {
      clearInterval(timer);
    }
  }, 50);
}

function addRemoveShortcutButtonToPlaylistRow(rowEl) {
  if (rowEl.dataset.ytPlRemoveShortcutInjected === "true") return;

  const menuBtn = findMenuButtonInPlaylistRow(rowEl);
  if (!menuBtn || !menuBtn.parentElement) return;

  menuBtn.parentElement.parentElement.style.display = "flex";

  rowEl.dataset.ytPlRemoveShortcutInjected = "true";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "yt-pl-remove-shortcut-btn";
  btn.title = "Remove from playlist";
  btn.innerHTML = trashSvg();

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    clickRemoveFromPlaylistViaMenu(rowEl);
  });

  // Insert to the LEFT of the 3-dots menu button
  menuBtn.parentElement.insertAdjacentElement("beforebegin", btn);
}

function processPlaylistRows() {
  if (!isPlaylistPage()) return;
  document.querySelectorAll("ytd-playlist-video-renderer").forEach((row) => {
    addRemoveShortcutButtonToPlaylistRow(row);
  });
}


// YouTube mutates the DOM constantly; coalesce bursts into one pass per animation frame.
let scanScheduled = false;
const observer = new MutationObserver(() => {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    processVideos();
    processPlaylistRows();
  });
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

processVideos();
processPlaylistRows();
