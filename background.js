const API_BASE = "https://www.googleapis.com/youtube/v3";

function getAccessToken() {
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

function removeCachedToken(token) {
  return new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
}

// Authorized fetch. On 401 (expired/revoked token) drops the cached token and retries once.
async function ytFetch(url, options = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", "Bearer " + token);
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 && attempt === 0) {
      await removeCachedToken(token);
      continue;
    }
    if (!res.ok) throw new Error("YouTube API error (" + res.status + "): " + (await res.text()));
    return res;
  }
}

// Returns the playlistItemId if the video is already in the playlist, else null (one API call).
async function findPlaylistItemId(videoId, playlistId) {
  const url = new URL(API_BASE + "/playlistItems");
  url.searchParams.set("part", "id");
  url.searchParams.set("playlistId", playlistId);
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("maxResults", "1");

  const data = await (await ytFetch(url.toString())).json();
  return data?.items?.[0]?.id || null;
}

async function addVideoToPlaylist(videoId, playlistId) {
  if (!playlistId) throw new Error("Playlist ID is missing.");

  if (await findPlaylistItemId(videoId, playlistId)) {
    return { alreadyInPlaylist: true };
  }

  const body = {
    snippet: {
      playlistId,
      resourceId: { kind: "youtube#video", videoId }
    }
  };
  await ytFetch(API_BASE + "/playlistItems?part=snippet", { method: "POST", body: JSON.stringify(body) });
  return { alreadyInPlaylist: false };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ADD_TO_PLAYLIST" && message.videoId && message.playlistId) {
    (async () => {
      try {
        const result = await addVideoToPlaylist(message.videoId, message.playlistId);
        sendResponse({ success: true, ...result });
      } catch (err) {
        console.error("Error adding video to playlist:", err);
        sendResponse({ success: false, error: String(err) });
      }
    })();
    return true;
  }
});
