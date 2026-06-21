(() => {
  const root = (window.PRH = window.PRH || {});
  const { exportSelectedPostsAsEpub } = root.epub;
  const api = root.api;
  const search = root.search;

  const STATE = {
    campaignId: null,
    creatorName: null,
    loadedPosts: [],
    postsById: new Map(),
    selectedPostIds: new Set(),
    totalPosts: 0,
    nextUrl: null,
    loading: false,
    includedByKey: new Map(),
    filterText: "",
    currentUrl: location.href,
    hasSeenValidPostsResponse: false,
  };

  const SEEN_PAYLOADS = new Set();
  const MAX_SEEN_PAYLOADS = 200;

  function resetState() {
    STATE.campaignId = null;
    STATE.creatorName = null;
    STATE.loadedPosts = [];
    STATE.postsById = new Map();
    STATE.selectedPostIds = new Set();
    STATE.totalPosts = 0;
    STATE.nextUrl = null;
    STATE.loading = false;
    STATE.includedByKey = new Map();
    STATE.filterText = "";
    STATE.hasSeenValidPostsResponse = false;
  }

  function setProgress(text) {
    try {
      chrome.runtime.sendMessage({ type: "PRH_PROGRESS", text: text || "" }, () => {
        // Read lastError to avoid an unchecked-error warning when no popup is open.
        void chrome.runtime.lastError;
      });
    } catch (e) {}
  }

  function trimmedPosts() {
    return STATE.loadedPosts.map((post) => {
      const attrs = post.attributes || {};
      return {
        id: post.id,
        title: attrs.title || "",
        published_at: attrs.published_at || "",
        post_type: attrs.post_type || "",
        url: attrs.url || "",
        patreon_url: attrs.patreon_url || "",
        content_teaser_text: attrs.content_teaser_text || "",
      };
    });
  }

  function snapshot() {
    return {
      active: STATE.hasSeenValidPostsResponse,
      loading:
        STATE.loading ||
        (STATE.hasSeenValidPostsResponse &&
          !STATE.loadedPosts.length &&
          !STATE.campaignId),
      totalPosts: STATE.totalPosts,
      canLoadMore: !!STATE.nextUrl && !STATE.loading,
      creatorName: STATE.creatorName,
      selectedIds: [...STATE.selectedPostIds],
      posts: trimmedPosts(),
    };
  }

  function getSelectedPosts() {
    return STATE.loadedPosts.filter((post) =>
      STATE.selectedPostIds.has(post.id),
    );
  }

  function postMatchesFilter(post, filterText) {
    const attrs = post.attributes || {};
    const haystack = [
      attrs.title,
      attrs.url,
      attrs.patreon_url,
      attrs.post_type,
      attrs.content_teaser_text,
    ]
      .map((x) => x || "")
      .join("\n");
    return search.matchesQuery(haystack, filterText);
  }

  function selectNewPosts(newPosts, filterText) {
    for (const post of newPosts) {
      if (postMatchesFilter(post, filterText)) {
        STATE.selectedPostIds.add(post.id);
      }
    }
  }

  function handleNavigationChange() {
    if (STATE.currentUrl === location.href) {
      return;
    }

    STATE.currentUrl = location.href;
    resetState();
  }

  function handlePostsResponse(json, filterText) {
    if (!json) {
      return;
    }

    const incomingCampaignId = api.extractCampaignIdFromResponse(json);
    if (!incomingCampaignId) {
      return;
    }

    if (STATE.campaignId && STATE.campaignId !== incomingCampaignId) {
      const oldFilterText = STATE.filterText;
      resetState();
      STATE.filterText = oldFilterText;
    }

    if (!STATE.campaignId) {
      STATE.campaignId = incomingCampaignId;
    }

    const before = new Set(STATE.postsById.keys());
    api.mergePostsResponseIntoState(STATE, json);
    STATE.hasSeenValidPostsResponse = true;

    // Page-side loads pass no filter and select everything; popup "Load more"
    // passes its search so only matching new posts get selected.
    const newPosts = STATE.loadedPosts.filter((post) => !before.has(post.id));
    selectNewPosts(newPosts, filterText);
  }

  function getPayloadKey(payload) {
    const url = String(payload?.url || "");
    const text = String(payload?.text || "");

    return `${url}\n${text.length}\n${text.slice(0, 512)}`;
  }

  function rememberPayloadKey(key) {
    SEEN_PAYLOADS.add(key);

    if (SEEN_PAYLOADS.size > MAX_SEEN_PAYLOADS) {
      const first = SEEN_PAYLOADS.values().next().value;
      if (first) {
        SEEN_PAYLOADS.delete(first);
      }
    }
  }

  function processPostsPayload(payload) {
    if (payload?.source !== "PRH_PAGE_BRIDGE") {
      return;
    }

    if (payload?.type !== "PRH_POSTS_RESPONSE") {
      return;
    }

    const key = getPayloadKey(payload);
    if (SEEN_PAYLOADS.has(key)) {
      return;
    }
    rememberPayloadKey(key);

    const json = api.parsePostsResponseText(payload.text);
    if (!json) {
      return;
    }

    if (!api.isPostsIndexResponse(json)) {
      return;
    }

    handlePostsResponse(json);
  }

  function installSpaWatcher() {
    let lastUrl = location.href;

    const onNavigate = () => {
      const now = location.href;
      if (now === lastUrl) {
        return;
      }

      lastUrl = now;
      setTimeout(handleNavigationChange, 50);
      setTimeout(handleNavigationChange, 250);
      setTimeout(handleNavigationChange, 800);
    };

    const wrapHistoryMethod = (name) => {
      const original = history[name];
      if (typeof original !== "function") {
        return;
      }

      history[name] = function (...args) {
        const result = original.apply(this, args);
        onNavigate();
        return result;
      };
    };

    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");
    window.addEventListener("popstate", onNavigate);

    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        onNavigate();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  async function fetchPostsPage(url) {
    const res = await fetch(url, {
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.json();
  }

  async function loadMore(filterText) {
    if (STATE.loading) {
      return;
    }

    if (!STATE.nextUrl) {
      setProgress("No more posts.");
      return;
    }

    const url = STATE.nextUrl;
    STATE.loading = true;
    setProgress("Loading more posts…");

    try {
      const json = await fetchPostsPage(url);
      handlePostsResponse(json, filterText);

      const loaded = STATE.loadedPosts.length;
      const total = STATE.totalPosts || "?";
      setProgress(`Loaded ${loaded}/${total}`);
    } catch (err) {
      console.error(err);
      setProgress(`Load failed: ${err.message}`);
    } finally {
      STATE.loading = false;
    }
  }

  async function exportEpub() {
    const posts = getSelectedPosts();

    if (!posts.length) {
      return { error: "No posts selected." };
    }

    try {
      setProgress("Building EPUB…");

      await exportSelectedPostsAsEpub(STATE, posts, (text) => {
        setProgress(text);
      });

      setProgress(`Done: ${posts.length} posts`);
      return { ok: true, count: posts.length };
    } catch (err) {
      console.error(err);
      setProgress("Export failed");
      return { error: err.message };
    }
  }

  function installMessageListener() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) {
        return;
      }

      processPostsPayload(event.data);
    });

    const queued = Array.isArray(window.__PRH_POSTS_QUEUE__)
      ? [...window.__PRH_POSTS_QUEUE__]
      : [];

    for (const item of queued) {
      processPostsPayload(item);
    }

    if (Array.isArray(window.__PRH_POSTS_QUEUE__)) {
      window.__PRH_POSTS_QUEUE__.length = 0;
    }
  }

  function installPopupBridge() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const type = message?.type;

      switch (type) {
        case "GET_STATE": {
          sendResponse(snapshot());
          return false;
        }

        case "SET_SELECTION": {
          if (message.checked) {
            STATE.selectedPostIds.add(message.id);
          } else {
            STATE.selectedPostIds.delete(message.id);
          }
          sendResponse(snapshot());
          return false;
        }

        case "SELECT_ALL": {
          const ids = Array.isArray(message.ids) ? message.ids : [];
          for (const id of ids) {
            STATE.selectedPostIds.add(id);
          }
          sendResponse(snapshot());
          return false;
        }

        case "DESELECT_ALL": {
          STATE.selectedPostIds.clear();
          sendResponse(snapshot());
          return false;
        }

        case "LOAD_MORE": {
          loadMore(message.filterText).then(() => sendResponse(snapshot()));
          return true;
        }

        case "EXPORT": {
          exportEpub().then((result) => sendResponse(result));
          return true;
        }

        default:
          return false;
      }
    });
  }

  function init() {
    installMessageListener();
    installPopupBridge();
    resetState();
    installSpaWatcher();
  }

  init();
})();
