(() => {
  const root = (window.PRH = window.PRH || {});

  root.api = {
    normalizePostsApiUrl(url) {
      if (typeof url !== "string") {
        return null;
      }

      try {
        const u = new URL(url, location.href);
        const isPostsApiUrl =
          u.origin === "https://www.patreon.com" &&
          u.pathname === "/api/posts" &&
          u.searchParams.get("json-api-version") === "1.0";

        return isPostsApiUrl ? u.href : null;
      } catch {
        return null;
      }
    },

    isPostsApiUrl(url) {
      return this.normalizePostsApiUrl(url) !== null;
    },

    parsePostsResponseText(text) {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    },

    isPostsIndexResponse(json) {
      if (!json || typeof json !== "object") {
        return false;
      }

      const data = json.data;
      if (!Array.isArray(data)) {
        return false;
      }

      if (data.length > 0) {
        const allPosts = data.every((item) => item?.type === "post");
        if (!allPosts) {
          return false;
        }
      }

      const hasPaginationSignals =
        typeof json?.meta?.pagination === "object" ||
        typeof json?.links?.next === "string" ||
        typeof json?.links?.prev === "string";

      return hasPaginationSignals;
    },

    canViewPost(post) {
      const attrs = post?.attributes;
      return (
        attrs?.is_public === true || attrs?.current_user_can_view === true
      );
    },

    getAllPostsFromIndexResponse(json) {
      if (!this.isPostsIndexResponse(json)) {
        return [];
      }

      return (json.data || []).filter(
        (item) => item?.type === "post" && item.attributes,
      );
    },

    getPostsFromIndexResponse(json) {
      return this.getAllPostsFromIndexResponse(json).filter((post) =>
        this.canViewPost(post),
      );
    },

    findPostsInResponse(json) {
      const posts = [];

      function walk(node) {
        if (!node) {
          return;
        }

        if (Array.isArray(node)) {
          for (const item of node) {
            walk(item);
          }
          return;
        }

        if (typeof node !== "object") {
          return;
        }

        if (node.type === "post" && node.attributes) {
          posts.push(node);
        }

        for (const value of Object.values(node)) {
          walk(value);
        }
      }

      walk(json);

      const unique = [];
      const seen = new Set();

      for (const post of posts) {
        if (!seen.has(post.id)) {
          seen.add(post.id);
          unique.push(post);
        }
      }

      return unique;
    },

    mergeIncluded(state, json) {
      for (const item of json?.included || []) {
        state.includedByKey.set(`${item.type}:${item.id}`, item);
      }
    },

    getCampaignFromResponse(json) {
      return (json?.included || []).find((item) => item.type === "campaign");
    },

    extractCampaignIdFromResponse(json) {
      const campaign =
        this.getCampaignFromResponse(json) ||
        (json?.data || []).find((item) => item.type === "campaign");

      if (campaign?.id) {
        return String(campaign.id);
      }

      for (const post of this.findPostsInResponse(json)) {
        const id = post?.relationships?.campaign?.data?.id;
        if (id) {
          return String(id);
        }
      }

      return null;
    },

    extractCampaignNameFromResponse(json) {
      const campaign = this.getCampaignFromResponse(json);
      return campaign?.attributes?.name || null;
    },

    addPostsToState(state, posts) {
      let added = 0;

      for (const post of posts) {
        if (!state.postsById.has(post.id)) {
          state.postsById.set(post.id, post);
          state.loadedPosts.push(post);
          // Selection is decided by the caller (content.js) so newly loaded
          // posts can honor the active search filter.
          added += 1;
        } else {
          const previous = state.postsById.get(post.id);
          state.postsById.set(post.id, post);
          const index = state.loadedPosts.indexOf(previous);
          if (index !== -1) {
            state.loadedPosts[index] = post;
          }
        }
      }

      return added;
    },

    mergePostsResponseIntoState(state, json) {
      if (!this.isPostsIndexResponse(json)) {
        return {
          postsAdded: 0,
          postsSkipped: 0,
          campaignId: null,
          campaignName: null,
        };
      }

      this.mergeIncluded(state, json);

      const allPosts = this.getAllPostsFromIndexResponse(json);
      const posts = allPosts.filter((post) => this.canViewPost(post));
      const unauthorizedPosts = allPosts.filter(
        (post) => !this.canViewPost(post),
      );

      for (const post of posts) {
        state.unauthorizedPostIds.delete(post.id);
      }

      if (unauthorizedPosts.length) {
        const unauthorizedIds = new Set(
          unauthorizedPosts.map((post) => post.id),
        );

        for (const id of unauthorizedIds) {
          state.unauthorizedPostIds.add(id);
          state.postsById.delete(id);
          state.selectedPostIds.delete(id);
        }

        state.loadedPosts = state.loadedPosts.filter(
          (post) => !unauthorizedIds.has(post.id),
        );
      }

      const postsAdded = this.addPostsToState(state, posts);

      state.nextUrl = this.normalizePostsApiUrl(json?.links?.next);
      const reportedTotal = Number(json?.meta?.pagination?.total || 0);
      state.totalPosts = Number.isFinite(reportedTotal)
        ? Math.max(0, reportedTotal - state.unauthorizedPostIds.size)
        : 0;

      const campaignId = this.extractCampaignIdFromResponse(json);
      const campaignName = this.extractCampaignNameFromResponse(json);

      if (campaignId) {
        state.campaignId = campaignId;
      }

      if (campaignName) {
        state.creatorName = campaignName;
      }

      return {
        postsAdded,
        postsSkipped: unauthorizedPosts.length,
        campaignId,
        campaignName,
      };
    },
  };
})();
