const STORAGE_KEY = "ytPlaylists";

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

function showToast(message) {
  try {
    let toast = document.querySelector(".yt-pl-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "yt-pl-toast";
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 1800);
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

async function getPlaylistButtons() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (data) => resolve(normalizeItems(data[STORAGE_KEY])));
  });
}

/** ===== Add-to-playlist buttons above titles (home/subs/search/watch etc.) ===== **/
const TITLE_SELECTORS = [
  "a#video-title",
  "a.yt-lockup-metadata-view-model__title",
  "div#title"
];

function findVideoIdForTitle(el) {
  if (el.tagName && el.tagName.toLowerCase() === "a") {
    const fromSelf = getVideoIdFromAnchor(el);
    if (fromSelf) return fromSelf;
  }

  const anchor =
    el.closest("a#video-title, a#video-title-link") ||
    el.querySelector?.("a#video-title, a#video-title-link");

  if (anchor) {
    const fromAnchor = getVideoIdFromAnchor(anchor);
    if (fromAnchor) return fromAnchor;
  }

  if (location.pathname.startsWith("/watch")) return getCurrentWatchVideoId();
  return null;
}

async function addButtonsAboveTitle(titleElement) {
  // NOTE: YouTube is a SPA and reuses DOM nodes on search/navigation.
  // Do NOT capture videoId at injection time; compute it at click time.
  if (titleElement.dataset.ytPlaylistButtonInjected === "true") return;

  titleElement.dataset.ytPlaylistButtonInjected = "true";

  const items = await getPlaylistButtons();
  if (!items.length) return;

  const bar = document.createElement("div");
  bar.className = "yt-playlist-button-bar";

  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "yt-playlist-button";
    btn.textContent = item.text || "★";
    btn.style.background = item.color || "#ffffff";

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();

      // Re-resolve the videoId right now (fixes stale ids after search results change)
      const videoId = findVideoIdForTitle(titleElement);
      if (!videoId) {
        alert("Could not determine video ID for this item.");
        return;
      }

      chrome.runtime.sendMessage(
        { type: "ADD_TO_PLAYLIST", videoId, playlistId: item.playlistId },
        (response) => {
          if (!response) {
            alert("Add to playlist failed: no response from background script.");
            return;
          }
          if (!response.success) {
            alert("Add to playlist failed:\n" + response.error);
          } else {
            showToast(`Video added to '${item.text}'`);
          }
        }
      );
    });

    bar.appendChild(btn);
  });

  const parent = titleElement.parentNode;
  if (!parent) return;
  parent.insertBefore(bar, titleElement);
}

function processTitles() {
  const seen = new Set();
  TITLE_SELECTORS.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      addButtonsAboveTitle(el);
    });
  });
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

function findRemoveMenuItem() {
  // Search in currently opened popup menu
  const items = Array.from(document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item'));
  const normalize = (s) => (s || "").toString().trim().toLowerCase();

  for (const it of items) {
    const txt = normalize(it.textContent);
    // English + Portuguese friendly matching
    const looksLikeRemove =
      (txt.includes("remove") && txt.includes("playlist")) ||
      (txt.includes("remove") && txt.includes("play list")) ||
      (txt.includes("remover") && (txt.includes("playlist") || txt.includes("da playlist") || txt.includes("da lista")));

    if (looksLikeRemove) return it;
  }
  return null;
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
    const removeItem = [...document.querySelectorAll('span')].find(s => s.textContent.includes('Remove from '));
    
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


const observer = new MutationObserver(() => {
  processTitles();
  processPlaylistRows();
  processPlaylistRows();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

processTitles();
