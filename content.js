(() => {
  const root = (window.PRH = window.PRH || {});
  const { exportSelectedPostsAsEpub } = root.epub;
  const ui = root.ui;
  const api = root.api;

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
    ui.setProgress("");
  }

  function getDerivedState() {
    return {
      ...STATE,
      active: STATE.hasSeenValidPostsResponse,
      loading:
        STATE.loading ||
        (STATE.hasSeenValidPostsResponse &&
          !STATE.loadedPosts.length &&
          !STATE.campaignId),
    };
  }

  function render() {
    const derivedState = getDerivedState();
    ui.update(derivedState, actions);

    const status = document.getElementById("prh-status");
    if (!status) {
      return;
    }

    if (!STATE.hasSeenValidPostsResponse) {
      status.textContent = "Waiting for posts…";
      return;
    }

    if (STATE.loadedPosts.length) {
      const loaded = STATE.loadedPosts.length;
      const total = STATE.totalPosts || "?";
      status.textContent = `${loaded}/${total}`;
      return;
    }

    status.textContent = "Waiting…";
  }

  function handleNavigationChange() {
    if (STATE.currentUrl === location.href) {
      return;
    }

    STATE.currentUrl = location.href;
    resetState();
    render();
  }

  function handlePostsResponse(json) {
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

    api.mergePostsResponseIntoState(STATE, json);
    STATE.hasSeenValidPostsResponse = true;
    render();
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

  const actions = {
    openModal() {
      if (!STATE.hasSeenValidPostsResponse) {
        return;
      }

      ui.openModal();
      render();
    },

    closeModal() {
      ui.closeModal();
    },

    setFilter(value) {
      STATE.filterText = value || "";
      render();
    },

    toggleSelected(postId, checked) {
      if (checked) {
        STATE.selectedPostIds.add(postId);
      } else {
        STATE.selectedPostIds.delete(postId);
      }
      render();
    },

    selectFiltered() {
      for (const post of ui.getFilteredPosts(STATE)) {
        STATE.selectedPostIds.add(post.id);
      }
      render();
    },

    deselectFiltered() {
      for (const post of ui.getFilteredPosts(STATE)) {
        STATE.selectedPostIds.delete(post.id);
      }
      render();
    },

    async loadMore() {
      if (STATE.loading) {
        return;
      }

      if (!STATE.nextUrl) {
        ui.setProgress("No more posts.");
        render();
        return;
      }

      const url = STATE.nextUrl;
      STATE.loading = true;
      ui.setProgress("Loading more posts…");
      render();

      try {
        const json = await fetchPostsPage(url);
        handlePostsResponse(json);

        const loaded = STATE.loadedPosts.length;
        const total = STATE.totalPosts || "?";
        ui.setProgress(`Loaded ${loaded}/${total}`);
      } catch (err) {
        console.error(err);
        ui.setProgress(`Load failed: ${err.message}`);
      } finally {
        STATE.loading = false;
        render();
      }
    },

    async exportEpub() {
      try {
        const posts = ui.getSelectedPosts(STATE);

        if (!posts.length) {
          window.alert("No posts selected.");
          return;
        }

        ui.setProgress("Building EPUB…");

        await exportSelectedPostsAsEpub(STATE, posts, (text) => {
          ui.setProgress(text);
        });

        ui.setProgress(`Done: ${posts.length} posts`);
      } catch (err) {
        console.error(err);
        window.alert(`EPUB export failed: ${err.message}`);
        ui.setProgress("Export failed");
      }
    },
  };

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

  function init() {
    installMessageListener();
    ui.createShell(actions);
    resetState();
    render();
    installSpaWatcher();
  }

  init();
})();