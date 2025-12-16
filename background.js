function getApiKey() {
  //const manifest = chrome.runtime.getManifest();
  //return manifest.ytApiKey || "";
  return "REMOVED_API_KEY";
}

function getAccessTokenInteractive() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error("chrome.identity error: " + chrome.runtime.lastError.message));
        return;
      }
      if (!token) {
        reject(new Error("No OAuth token returned."));
        return;
      }
      resolve(token);
    });
  });
}

async function ytFetch(url, accessToken, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", "Bearer " + accessToken);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(url, { ...options, headers });
}

async function addVideoToPlaylist(videoId, playlistId) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API key is not configured. Set ytApiKey in manifest.json.");
  if (!playlistId) throw new Error("Playlist ID is missing.");

  const accessToken = await getAccessTokenInteractive();
  const url =
    "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&key=" +
    encodeURIComponent(apiKey);

  const body = {
    snippet: {
      playlistId,
      resourceId: { kind: "youtube#video", videoId }
    }
  };

  const res = await ytFetch(url, accessToken, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error("YouTube API error (" + res.status + "): " + (await res.text()));
  return res.json();
}

// Find playlistItemId for (playlistId, videoId) by paging through playlist items
async function findPlaylistItemId(videoId, playlistId) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API key is not configured. Set ytApiKey in manifest.json.");
  const accessToken = await getAccessTokenInteractive();

  let pageToken = "";
  for (let i = 0; i < 50; i++) { // safety cap
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await ytFetch(url.toString(), accessToken, { method: "GET", headers: { "Content-Type": "application/json" } });
    if (!res.ok) throw new Error("YouTube API error (" + res.status + "): " + (await res.text()));
    const data = await res.json();

    const items = Array.isArray(data.items) ? data.items : [];
    for (const it of items) {
      const v = it?.contentDetails?.videoId;
      if (v === videoId) return it.id; // playlistItemId
    }

    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }

  return null;
}

async function removeVideoFromPlaylist(videoId, playlistId) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API key is not configured. Set ytApiKey in manifest.json.");
  if (!playlistId) throw new Error("Playlist ID is missing.");

  const accessToken = await getAccessTokenInteractive();
  const playlistItemId = await findPlaylistItemId(videoId, playlistId);
  if (!playlistItemId) throw new Error("Could not find this video in the playlist (no playlistItemId found)."+playlistId+" = "+videoId);

  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("id", playlistItemId);
  url.searchParams.set("key", apiKey);

  const res = await ytFetch(url.toString(), accessToken, { method: "DELETE", headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error("YouTube API error (" + res.status + "): " + (await res.text()));
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ADD_TO_PLAYLIST" && message.videoId && message.playlistId) {
    (async () => {
      try {
        const result = await addVideoToPlaylist(message.videoId, message.playlistId);
        sendResponse({ success: true, result });
      } catch (err) {
        console.error("Error adding video to playlist:", err);
        sendResponse({ success: false, error: String(err) });
      }
    })();
    return true;
  }

  if (message?.type === "REMOVE_FROM_PLAYLIST" && message.videoId && message.playlistId) {
    (async () => {
      try {
        await removeVideoFromPlaylist(message.videoId, message.playlistId);
        sendResponse({ success: true });
      } catch (err) {
        console.error("Error removing video from playlist:", err);
        sendResponse({ success: false, error: String(err) });
      }
    })();
    return true;
  }
});
