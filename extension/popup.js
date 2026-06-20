(() => {
  const view = {
    tabId: null,
    reachable: false,
    snap: null,
    selectedIds: new Set(),
    filterText: "",
  };

  const els = {
    search: document.getElementById("prh-search"),
    summary: document.getElementById("prh-selection-summary"),
    status: document.getElementById("prh-status"),
    list: document.getElementById("prh-modal-list"),
    loadMore: document.getElementById("prh-load-more"),
    selectAll: document.getElementById("prh-select-all"),
    selectNone: document.getElementById("prh-select-none"),
    exportBtn: document.getElementById("prh-export-epub"),
    progress: document.getElementById("prh-progress"),
  };

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (ch) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[ch];
    });
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return "";
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function getFilteredPosts() {
    const posts = view.snap?.posts || [];
    const query = view.filterText.trim().toLowerCase();
    if (!query) {
      return posts;
    }

    return posts.filter((post) => {
      const haystack = [
        post.title || "",
        post.url || "",
        post.patreon_url || "",
        post.post_type || "",
        post.content_teaser_text || "",
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      if (view.tabId == null) {
        resolve(null);
        return;
      }
      chrome.tabs.sendMessage(view.tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          view.reachable = false;
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
  }

  function applySnapshot(snap) {
    if (!snap) {
      view.reachable = false;
      render();
      return;
    }
    view.reachable = true;
    view.snap = snap;
    view.selectedIds = new Set(snap.selectedIds || []);
    render();
  }

  function render() {
    if (!view.reachable) {
      els.status.textContent = "Open a Patreon creator page, then click the icon.";
      els.list.innerHTML = "";
      els.summary.textContent = "";
      setControlsEnabled(false);
      return;
    }

    const snap = view.snap;

    if (!snap.active) {
      els.status.textContent = "Waiting for posts… scroll the creator's posts.";
      els.list.innerHTML = "";
      els.summary.textContent = "";
      setControlsEnabled(false);
      return;
    }

    const loaded = snap.posts.length;
    const total = snap.totalPosts || "?";
    els.status.textContent = snap.loading
      ? `Loading… ${loaded}/${total}`
      : `${loaded}/${total} loaded`;

    setControlsEnabled(true);

    els.loadMore.disabled = !snap.canLoadMore;
    els.loadMore.textContent = snap.loading
      ? "Loading…"
      : snap.canLoadMore
        ? "Load more"
        : "No more posts";

    const filtered = getFilteredPosts();
    els.summary.textContent = `${view.selectedIds.size} selected of ${loaded} loaded • ${filtered.length} shown`;

    els.list.innerHTML = "";
    for (const post of filtered) {
      const title = post.title || `Post ${post.id}`;
      const row = document.createElement("div");
      row.className = "prh-row";
      row.innerHTML = `
        <input type="checkbox" ${view.selectedIds.has(post.id) ? "checked" : ""} />
        <div>
          <div class="prh-title">${escapeHtml(title)}</div>
          <div class="prh-meta">
            ${escapeHtml(formatDate(post.published_at))}
            ${post.post_type ? ` • ${escapeHtml(String(post.post_type))}` : ""}
          </div>
        </div>
        <a href="${escapeHtml(post.url || post.patreon_url || "#")}"
           target="_blank"
           rel="noopener noreferrer">Open</a>
      `;

      const checkbox = row.querySelector("input");
      checkbox.addEventListener("change", async () => {
        const snap2 = await sendMessage({
          type: "SET_SELECTION",
          id: post.id,
          checked: checkbox.checked,
        });
        applySnapshot(snap2);
      });

      els.list.appendChild(row);
    }
  }

  function setControlsEnabled(enabled) {
    els.search.disabled = !enabled;
    els.selectAll.disabled = !enabled;
    els.selectNone.disabled = !enabled;
    els.exportBtn.disabled = !enabled;
    if (!enabled) {
      els.loadMore.disabled = true;
    }
  }

  function wireEvents() {
    els.search.addEventListener("input", (event) => {
      view.filterText = event.target.value || "";
      render();
    });

    els.loadMore.addEventListener("click", async () => {
      els.loadMore.disabled = true;
      const snap = await sendMessage({
        type: "LOAD_MORE",
        filterText: view.filterText,
      });
      applySnapshot(snap);
    });

    els.selectAll.addEventListener("click", async () => {
      const ids = getFilteredPosts().map((post) => post.id);
      const snap = await sendMessage({ type: "SELECT_ALL", ids });
      applySnapshot(snap);
    });

    els.selectNone.addEventListener("click", async () => {
      const snap = await sendMessage({ type: "DESELECT_ALL" });
      applySnapshot(snap);
    });

    els.exportBtn.addEventListener("click", async () => {
      els.exportBtn.disabled = true;
      const result = await sendMessage({ type: "EXPORT" });
      els.exportBtn.disabled = false;
      if (result?.error) {
        els.progress.textContent = result.error;
      } else if (result?.ok) {
        els.progress.textContent = `Done: ${result.count} posts`;
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "PRH_PROGRESS") {
        els.progress.textContent = message.text || "";
      }
    });
  }

  async function init() {
    wireEvents();

    const tabs = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, resolve),
    );
    view.tabId = tabs?.[0]?.id ?? null;

    const snap = await sendMessage({ type: "GET_STATE" });
    applySnapshot(snap);
  }

  init();
})();
