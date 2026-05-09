(() => {
  const root = (window.PRH = window.PRH || {});
  const { escapeHtml, formatDate } = root.renderer;

  function getFilteredPosts(state) {
    const query = state.filterText.trim().toLowerCase();
    if (!query) {
      return state.loadedPosts;
    }

    return state.loadedPosts.filter((post) => {
      const attrs = post.attributes || {};
      const haystack = [
        attrs.title || "",
        attrs.url || "",
        attrs.patreon_url || "",
        attrs.post_type || "",
        attrs.content_teaser_text || "",
      ]
        .join("\n")
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  function getSelectedPosts(state) {
    return state.loadedPosts.filter((post) => state.selectedPostIds.has(post.id));
  }

  function createShell(actions) {
    if (document.getElementById("prh-bar")) {
      return;
    }

    const bar = document.createElement("div");
    bar.id = "prh-bar";
    bar.className = "prh-hidden";
    bar.innerHTML = `
      <strong>Posts</strong>
      <span id="prh-status">Waiting for posts…</span>
      <div class="prh-spacer"></div>
      <button id="prh-open-modal" type="button">Download posts</button>
    `;

    const backdrop = document.createElement("div");
    backdrop.id = "prh-modal-backdrop";
    backdrop.className = "prh-hidden";
    backdrop.innerHTML = `
      <div id="prh-modal" role="dialog" aria-modal="true">
        <div id="prh-modal-header">
          <div class="prh-modal-top">
            <div>
              <strong>Download posts</strong>
              <span id="prh-selection-summary"></span>
            </div>
            <input
              id="prh-search"
              type="text"
              placeholder="Search loaded posts..."
            />
          </div>
        </div>
        <div id="prh-modal-list"></div>
        <div id="prh-modal-footer">
          <button type="button" class="secondary" id="prh-load-more">
            Load more
          </button>
          <button type="button" class="secondary" id="prh-select-all">
            Select all
          </button>
          <button type="button" class="secondary" id="prh-select-none">
            Deselect all
          </button>
          <button type="button" class="secondary" id="prh-close-modal">
            Close
          </button>
          <div id="prh-progress"></div>
          <button type="button" id="prh-export-epub">Export EPUB</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(bar);
    document.documentElement.appendChild(backdrop);

    document
      .getElementById("prh-open-modal")
      .addEventListener("click", actions.openModal);

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        actions.closeModal();
      }
    });

    document
      .getElementById("prh-close-modal")
      .addEventListener("click", actions.closeModal);

    document.getElementById("prh-search").addEventListener("input", (event) => {
      actions.setFilter(event.target.value || "");
    });

    document
      .getElementById("prh-load-more")
      .addEventListener("click", actions.loadMore);

    document
      .getElementById("prh-select-all")
      .addEventListener("click", actions.selectFiltered);

    document
      .getElementById("prh-select-none")
      .addEventListener("click", actions.deselectFiltered);

    document
      .getElementById("prh-export-epub")
      .addEventListener("click", actions.exportEpub);
  }

  function setVisible(element, visible) {
    if (!element) {
      return;
    }

    element.classList.toggle("prh-hidden", !visible);
  }

  function openModal() {
    const backdrop = document.getElementById("prh-modal-backdrop");
    setVisible(backdrop, true);
  }

  function closeModal() {
    const backdrop = document.getElementById("prh-modal-backdrop");
    setVisible(backdrop, false);
  }

  function setProgress(text) {
    const el = document.getElementById("prh-progress");
    if (el) {
      el.textContent = text || "";
    }
  }

  function update(state, actions) {
    const bar = document.getElementById("prh-bar");
    const modalList = document.getElementById("prh-modal-list");
    const status = document.getElementById("prh-status");
    const search = document.getElementById("prh-search");
    const summary = document.getElementById("prh-selection-summary");
    const loadMoreButton = document.getElementById("prh-load-more");

    setVisible(bar, !!state.active);

    if (!state.active) {
      closeModal();
      return;
    }

    if (status) {
      const loaded = state.loadedPosts.length;
      const total = state.totalPosts || "?";
      status.textContent = state.loading
        ? `Loading… ${loaded}/${total}`
        : `${loaded}/${total}`;
    }

    if (search && search.value !== state.filterText) {
      search.value = state.filterText;
    }

    if (loadMoreButton) {
      const canLoadMore = !!state.nextUrl && !state.loading;
      loadMoreButton.disabled = !canLoadMore;
      loadMoreButton.textContent = state.loading
        ? "Loading…"
        : state.nextUrl
          ? "Load more"
          : "No more posts";
    }

    if (!modalList || !summary) {
      return;
    }

    const filtered = getFilteredPosts(state);
    const selectedCount = getSelectedPosts(state).length;
    summary.textContent = `${selectedCount} selected of ${
      state.loadedPosts.length
    } loaded • ${filtered.length} shown`;

    modalList.innerHTML = "";

    for (const post of filtered) {
      const attrs = post.attributes || {};
      const title = attrs.title || `Post ${post.id}`;

      const row = document.createElement("div");
      row.className = "prh-row";
      row.innerHTML = `
        <input type="checkbox" ${
          state.selectedPostIds.has(post.id) ? "checked" : ""
        } />
        <div>
          <div class="prh-title">${escapeHtml(title)}</div>
          <div class="prh-meta">
            ${escapeHtml(formatDate(attrs.published_at) || "")}
            ${attrs.post_type ? ` • ${escapeHtml(String(attrs.post_type))}` : ""}
          </div>
        </div>
        <a href="${escapeHtml(attrs.url || attrs.patreon_url || "#")}"
           target="_blank"
           rel="noopener noreferrer">Open</a>
      `;

      const checkbox = row.querySelector("input");
      checkbox.addEventListener("change", () => {
        actions.toggleSelected(post.id, checkbox.checked);
      });

      modalList.appendChild(row);
    }
  }

  root.ui = {
    createShell,
    openModal,
    closeModal,
    update,
    setProgress,
    getFilteredPosts,
    getSelectedPosts,
  };
})();