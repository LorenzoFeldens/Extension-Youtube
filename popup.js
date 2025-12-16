const STORAGE_KEY = "ytPlaylists";
const LEGACY_KEY = "ytPlaylistId";

function defaultItem() {
  return { text: "", color: "#ffffff", playlistId: "" };
}

function clampString(s, max = 40) {
  s = (s || "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderList(items) {
  const listEl = document.getElementById("list");
  listEl.innerHTML = "";

  items.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.index = String(idx);

    row.innerHTML = `
      <div>
        <input type="color" class="colorInput" value="${item.color || "#282828"}" />
      </div>

      <div>
        <input type="text" class="textInput" value="${escapeHtml(item.text || "")}" placeholder="Text" oninput="this.title=this.value" onmouseenter="this.title=this.value" />
      </div>
      
      <div>
        <input type="text" class="playlistInput" value="${escapeHtml(item.playlistId || "")}" placeholder="PL..." oninput="this.title=this.value" onmouseenter="this.title=this.value" />
      </div>

      <div>
        <button type="button" class="removeBtn">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9zM7 9h2v10H7V9z"/>
          </svg>
        </button>
      </div>
    `;

    row.querySelector(".removeBtn").addEventListener("click", () => {
      items.splice(idx, 1);
      if (items.length === 0) items.push(defaultItem());
      renderList(items);
    });

    const text = row.querySelector('input[type="text"].textInput');
    const syncTitleText = () => text.title = text.value;

    text.addEventListener("input", syncTitleText);
    text.addEventListener("mouseenter", syncTitleText);
    syncTitleText();

    const playlist = row.querySelector('input[type="text"].playlistInput');
    const syncTitleplaylist = () => playlist.title = playlist.value;

    playlist.addEventListener("input", syncTitleplaylist);
    playlist.addEventListener("mouseenter", syncTitleplaylist);
    syncTitleplaylist();

    listEl.appendChild(row);
  });
}

function readListFromDOM() {
  const listEl = document.getElementById("list");
  const rows = [...listEl.querySelectorAll(".row")];

  const items = rows.map((row) => {
    const text = clampString(row.querySelector(".textInput")?.value ?? "");
    const color = row.querySelector(".colorInput")?.value ?? "#282828";
    const playlistId = (row.querySelector(".playlistInput")?.value ?? "").trim();
    return { text: text, color, playlistId };
  });

  return items.length ? items : [defaultItem()];
}

function save(items) {
  return new Promise((resolve) => chrome.storage.sync.set({ [STORAGE_KEY]: items }, resolve));
}

function load() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY, LEGACY_KEY], (data) => {
      if (Array.isArray(data[STORAGE_KEY]) && data[STORAGE_KEY].length) {
        resolve(data[STORAGE_KEY]);
        return;
      }
      if (data[LEGACY_KEY]) {
        resolve([{ text: "", color: "#282828", playlistId: data[LEGACY_KEY] }]);
        return;
      }
      resolve([defaultItem()]);
    });
  });
}

function setStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg || "";
  if (msg) setTimeout(() => (el.textContent = ""), 2000);
}

document.addEventListener("DOMContentLoaded", async () => {
  let items = await load();
  renderList(items);

  document.getElementById("addBtn").addEventListener("click", () => {
    items.push(defaultItem());
    renderList(items);
  });

  document.getElementById("saveBtn").addEventListener("click", async () => {
    items = readListFromDOM();
    await save(items);
    setStatus("Saved.");
  });
});
